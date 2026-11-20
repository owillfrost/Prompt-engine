import type { PromptDiffResult } from '../../core/promptDiff'
import {
  ATTRIBUTE_META,
  type AttributeKey,
  type AttributeTagStat,
  type PromptDiffSpan,
  type PromptItem,
} from '../../types/promptEngine'
import {
  TOKEN_STOP_WORDS,
  normalizePromptToken,
  splitPromptDelimiters,
} from '../../core/textTokens'

/**
 * Computes word-level LCS indices on normalized word tokens.
 * Trims common prefix/suffix first to keep DP small and fast.
 */
function computeLcsMatchedIndices(
  wordsA: string[],
  wordsB: string[]
): { matchedA: Set<number>; matchedB: Set<number> } {
  const matchedA = new Set<number>()
  const matchedB = new Set<number>()

  let start = 0
  while (start < wordsA.length && start < wordsB.length && wordsA[start] === wordsB[start]) {
    matchedA.add(start)
    matchedB.add(start)
    start++
  }

  let endA = wordsA.length - 1
  let endB = wordsB.length - 1
  while (endA >= start && endB >= start && wordsA[endA] === wordsB[endB]) {
    matchedA.add(endA)
    matchedB.add(endB)
    endA--
    endB--
  }

  const lenA = endA - start + 1
  const lenB = endB - start + 1

  if (lenA <= 0 || lenB <= 0) {
    return { matchedA, matchedB }
  }

  // Fallback for unusually huge prompts to avoid excessive memory allocation
  if (lenA * lenB > 300_000) {
    const setB = new Set(wordsB.slice(start, endB + 1))
    const setA = new Set(wordsA.slice(start, endA + 1))
    for (let i = start; i <= endA; i++) {
      if (setB.has(wordsA[i])) matchedA.add(i)
    }
    for (let j = start; j <= endB; j++) {
      if (setA.has(wordsB[j])) matchedB.add(j)
    }
    return { matchedA, matchedB }
  }

  const stride = lenB + 1
  const dp = new Uint32Array((lenA + 1) * stride)

  for (let i = lenA - 1; i >= 0; i--) {
    const aWord = wordsA[start + i]
    const rowOffset = i * stride
    const nextRowOffset = (i + 1) * stride
    for (let j = lenB - 1; j >= 0; j--) {
      if (aWord === wordsB[start + j]) {
        dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1
      } else {
        const down = dp[nextRowOffset + j]
        const right = dp[rowOffset + j + 1]
        dp[rowOffset + j] = down >= right ? down : right
      }
    }
  }

  let i = 0
  let j = 0
  while (i < lenA && j < lenB) {
    if (wordsA[start + i] === wordsB[start + j]) {
      matchedA.add(start + i)
      matchedB.add(start + j)
      i++
      j++
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + j + 1]) {
      i++
    } else {
      j++
    }
  }

  return { matchedA, matchedB }
}

function buildVisualSpans(tokens: string[], matchedWordIndices: Set<number>, tokenToWordIdx: Map<number, number>): PromptDiffSpan[] {
  // First pass: classify word tokens; delimiters are temporarily null
  const types: Array<'shared' | 'unique' | null> = tokens.map((_, idx) => {
    const wordIdx = tokenToWordIdx.get(idx)
    if (wordIdx === undefined) return null
    return matchedWordIndices.has(wordIdx) ? 'shared' : 'unique'
  })

  // Second pass: a delimiter is 'unique' only if strictly flanked by 'unique' word tokens
  // (so changed phrases form a single continuous highlight, while boundary spaces stay neutral/shared)
  for (let idx = 0; idx < types.length; idx++) {
    if (types[idx] !== null) continue

    let prevType: 'shared' | 'unique' | null = null
    for (let p = idx - 1; p >= 0; p--) {
      if (types[p] !== null) {
        prevType = types[p]
        break
      }
    }

    let nextType: 'shared' | 'unique' | null = null
    for (let n = idx + 1; n < types.length; n++) {
      if (types[n] !== null) {
        nextType = types[n]
        break
      }
    }

    types[idx] = prevType === 'unique' && nextType === 'unique' ? 'unique' : 'shared'
  }

  return tokens.map((text, idx) => ({
    text,
    type: types[idx] ?? 'shared',
  }))
}

/**
 * Lab-only prompt diff:
 * - Preserves `sharedTerms` and `similarityRatio` using meaningful tokens (ignoring stop words & <=2 chars)
 * - Uses sequential word-level LCS for `spansA` / `spansB` so identical stop words, short tokens,
 *   and whitespace/punctuation are not falsely highlighted as differences.
 */
export function diffPromptsLab(promptA = '', promptB = ''): PromptDiffResult {
  const cleanA = promptA.trim()
  const cleanB = promptB.trim()
  const hasPrompts = Boolean(cleanA || cleanB)

  if (!hasPrompts) {
    return {
      hasPrompts: false,
      promptA: cleanA,
      promptB: cleanB,
      spansA: [{ text: cleanA, type: 'unique' }],
      spansB: [{ text: cleanB, type: 'unique' }],
      sharedTerms: [],
      similarityRatio: 0,
    }
  }

  const tokensA = splitPromptDelimiters(cleanA)
  const tokensB = splitPromptDelimiters(cleanB)

  const meaningfulSet = (tokens: string[]) =>
    new Set(
      tokens
        .map(normalizePromptToken)
        .filter((t) => t.length > 2 && !TOKEN_STOP_WORDS.has(t))
    )

  const setA = meaningfulSet(tokensA)
  const setB = meaningfulSet(tokensB)

  const sharedSet = new Set<string>()
  for (const t of setA) {
    if (setB.has(t)) sharedSet.add(t)
  }

  const extractWords = (tokens: string[]) => {
    const words: string[] = []
    const tokenToWordIdx = new Map<number, number>()
    tokens.forEach((tok, idx) => {
      const norm = normalizePromptToken(tok)
      if (norm.length > 0) {
        tokenToWordIdx.set(idx, words.length)
        words.push(norm)
      }
    })
    return { words, tokenToWordIdx }
  }

  const extractedA = extractWords(tokensA)
  const extractedB = extractWords(tokensB)
  const { matchedA, matchedB } = computeLcsMatchedIndices(extractedA.words, extractedB.words)

  const totalTerms = new Set([...setA, ...setB]).size

  return {
    hasPrompts,
    promptA: cleanA,
    promptB: cleanB,
    spansA: buildVisualSpans(tokensA, matchedA, extractedA.tokenToWordIdx),
    spansB: buildVisualSpans(tokensB, matchedB, extractedB.tokenToWordIdx),
    sharedTerms: Array.from(sharedSet).sort(),
    similarityRatio: totalTerms > 0 ? sharedSet.size / totalTerms : 0,
  }
}

export type LabDiffSpanType = 'shared' | 'unique' | 'rare' | 'collapsed'

export interface LabDiffSpan {
  text: string
  type: LabDiffSpanType
}

function addTagWords(stats: readonly AttributeTagStat[] | undefined, minIdf: number, out: Set<string>) {
  if (!stats) return
  for (const ts of stats) {
    if (ts.idfWeight < minIdf) continue
    for (const tok of splitPromptDelimiters(ts.tag)) {
      const norm = normalizePromptToken(tok)
      if (norm.length > 2 && !TOKEN_STOP_WORDS.has(norm)) {
        out.add(norm)
      }
    }
  }
}

/**
 * Extracts normalized words from tags that increase rarity for a prompt
 * (its top rarestTags, plus slot tagStats above the prompt's meanIdf).
 */
export function extractRarityWordSet(item: PromptItem, axisKey?: AttributeKey): Set<string> {
  const words = new Set<string>()
  const minIdf = Math.max(1.5, item.rarity.meanIdf || 0)

  const rarestForScope = axisKey
    ? item.rarity.rarestTags.filter((rt) => rt.axis === axisKey)
    : item.rarity.rarestTags
  addTagWords(rarestForScope, 0, words)

  if (axisKey) {
    addTagWords(item.attributes[axisKey].tagStats, minIdf, words)
  } else {
    for (const meta of ATTRIBUTE_META) {
      addTagWords(item.attributes[meta.key].tagStats, minIdf, words)
    }
  }

  return words
}

/**
 * Marks `unique` spans whose normalized word is in `rareWords` as `rare`.
 */
export function annotateRaritySpans(
  spans: ReadonlyArray<LabDiffSpan>,
  rareWords: ReadonlySet<string>
): LabDiffSpan[] {
  if (rareWords.size === 0) return spans.map((sp) => ({ ...sp }))
  return spans.map((sp) => {
    if (sp.type !== 'unique') return { ...sp }
    const norm = normalizePromptToken(sp.text)
    if (norm.length > 2 && rareWords.has(norm)) {
      return { text: sp.text, type: 'rare' }
    }
    return { ...sp }
  })
}
