// Reaproveitado e estendido de B:\AntiGravity\noiser-reconizer\src\core\promptDiff.ts

import type { PromptDiffSpan, PromptItem, SimilarityLayerScore } from '../types/promptEngine'
import {
  TOKEN_STOP_WORDS,
  extractKeywordTokens,
  normalizePromptToken,
  splitPromptDelimiters,
} from './textTokens'

export interface PromptDiffResult {
  hasPrompts: boolean
  promptA: string
  promptB: string
  spansA: PromptDiffSpan[]
  spansB: PromptDiffSpan[]
  sharedTerms: string[]
  similarityRatio: number
}

export function diffPrompts(promptA = '', promptB = ''): PromptDiffResult {
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

  const toSpans = (tokens: string[]): PromptDiffSpan[] =>
    tokens.map((tok) => {
      const norm = normalizePromptToken(tok)
      return {
        text: tok,
        type: norm.length > 2 && sharedSet.has(norm) ? 'shared' : 'unique',
      }
    })

  const totalTerms = new Set([...setA, ...setB]).size

  return {
    hasPrompts,
    promptA: cleanA,
    promptB: cleanB,
    spansA: toSpans(tokensA),
    spansB: toSpans(tokensB),
    sharedTerms: Array.from(sharedSet).sort(),
    similarityRatio: totalTerms > 0 ? sharedSet.size / totalTerms : 0,
  }
}

function jaccardSet(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) {
    if (b.has(x)) inter++
  }
  return inter / (a.size + b.size - inter)
}

/**
 * Calcula similaridade em duas camadas (Semântica vs Estrutural)
 * preparada para a futura tela de Pares e Mapa.
 */
export function computeTwoLayerSimilarity(a: PromptItem, b: PromptItem): SimilarityLayerScore {
  const semTextA = [
    a.attributes.sujeito.text,
    a.attributes.cenario.text,
    a.attributes.luz.text,
    a.attributes.textura_material.text,
    a.attributes.estilo.text,
  ].join(' ')
  const semTextB = [
    b.attributes.sujeito.text,
    b.attributes.cenario.text,
    b.attributes.luz.text,
    b.attributes.textura_material.text,
    b.attributes.estilo.text,
  ].join(' ')

  const tokensA = new Set(extractKeywordTokens(semTextA))
  const tokensB = new Set(extractKeywordTokens(semTextB))
  const semanticSim = Number(jaccardSet(tokensA, tokensB).toFixed(3))

  const structA = new Set<string>([
    a.attributes.estrutura.macroFormat,
    a.attributes.estrutura.kernelDialect,
    ...a.attributes.estrutura.topKeysOrSections.map((k) => k.toLowerCase()),
  ])
  const structB = new Set<string>([
    b.attributes.estrutura.macroFormat,
    b.attributes.estrutura.kernelDialect,
    ...b.attributes.estrutura.topKeysOrSections.map((k) => k.toLowerCase()),
  ])
  const structuralSim = Number(jaccardSet(structA, structB).toFixed(3))
  const divergenceScore = Number(Math.abs(semanticSim - structuralSim).toFixed(3))

  let category: SimilarityLayerScore['category'] = 'distinct'
  if (semanticSim >= 0.72 && structuralSim >= 0.65) {
    category = 'near_duplicate'
  } else if (structuralSim >= 0.65 && semanticSim <= 0.35) {
    category = 'same_skeleton_diff_subject'
  } else if (semanticSim >= 0.6 && structuralSim <= 0.38) {
    category = 'same_subject_diff_skeleton'
  }

  return { semanticSim, structuralSim, divergenceScore, category }
}
