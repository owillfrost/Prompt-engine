import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Check,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  Maximize2,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { computeTwoLayerSimilarity, type PromptDiffResult } from '../../core/promptDiff'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import {
  ATTRIBUTE_META,
  type AttributeKey,
  type AttributeSlot,
  type AttributeTagStat,
  type PairCategory,
  type PairsPayload,
  type PromptDetailResponse,
  type PromptDiffSpan,
  type PromptItem,
  type PromptPairRecord,
} from '../../types/promptEngine'
import {
  annotateRaritySpans,
  diffPromptsLab,
  extractRarityWordSet,
  type LabDiffSpan,
} from '../utils/promptDiffLab'
import { getPromptSemanticTitle } from '../utils/promptDisplay'
import { FavoriteToggleButton } from './FavoriteToggleButton'
import { PromptThumb } from './PromptThumb'
import {
  ClipComparisonSlider,
  ShinyText,
  StarBorderBadge,
} from './ReactBitsLab'

interface PairsViewProps {
  items: PromptItem[]
  pairsData: PairsPayload
  customPairIds: [string, string] | null
  onClearCustomPair: () => void
  onInspectItem: (item: PromptItem) => void
  isFavorite?: (promptId: string) => boolean
  onToggleFavorite?: (item: PromptItem) => void
}

const COMPARABLE_ATTRIBUTE_META = ATTRIBUTE_META.filter((m) => m.key !== 'projeto_cliente')

function mergeDiffRuns(spans: ReadonlyArray<LabDiffSpan>): LabDiffSpan[] {
  const out: LabDiffSpan[] = []
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i]
    const isWhitespaceOnly = /^\s+$/.test(sp.text)
    if ((sp.type === 'unique' || sp.type === 'rare') && isWhitespaceOnly) {
      const prev = out[out.length - 1]
      const next = spans[i + 1]
      if (prev && prev.type === sp.type && next && next.type === sp.type && !/^\s+$/.test(next.text)) {
        prev.text += sp.text
      } else {
        out.push({ text: sp.text, type: 'shared' })
      }
      continue
    }
    const prev = out[out.length - 1]
    if (prev && prev.type === sp.type && sp.type !== 'collapsed') {
      prev.text += sp.text
    } else {
      out.push({ ...sp })
    }
  }
  return out
}

function collapseSharedSpans(
  spans: PromptDiffSpan[]
): Array<{ text: string; type: 'shared' | 'unique' | 'collapsed' }> {
  const out: Array<{ text: string; type: 'shared' | 'unique' | 'collapsed' }> = []
  let sharedRun: PromptDiffSpan[] = []

  const flushShared = () => {
    if (sharedRun.length === 0) return
    const wordCount = sharedRun.filter((s) => /\w/.test(s.text)).length
    if (wordCount >= 4) {
      out.push({ text: ` [··· ${wordCount} termos iguais ···] `, type: 'collapsed' })
    } else {
      for (const s of sharedRun) out.push(s)
    }
    sharedRun = []
  }

  for (const sp of spans) {
    if (sp.type === 'shared' || (sharedRun.length > 0 && /^[\s,;:.]+$/.test(sp.text))) {
      sharedRun.push(sp)
    } else {
      flushShared()
      out.push(sp)
    }
  }
  flushShared()
  return out
}

interface AttributeDiffRow {
  meta: (typeof ATTRIBUTE_META)[number]
  slotA: AttributeSlot
  slotB: AttributeSlot
  txtA: string
  txtB: string
  changed: boolean
  attrDiff: PromptDiffResult
}

interface RarityDriverResult {
  key: AttributeKey
  label: string
  shortLabel: string
  rarerSide: 'A' | 'B'
  delta: number
  isEstimated: boolean
}

function scoreTagStats(stats: readonly AttributeTagStat[]): number {
  let maxIdf = 0
  let sumIdf = 0
  for (const ts of stats) {
    if (ts.idfWeight > maxIdf) maxIdf = ts.idfWeight
    sumIdf += ts.idfWeight
  }
  return maxIdf + (sumIdf - maxIdf) * 0.25
}

function computeSlotRarityScore(
  slot: AttributeSlot,
  axisKey: AttributeKey,
  item: PromptItem
): { score: number; hasIdfData: boolean } {
  if (slot.tagStats && slot.tagStats.length > 0) {
    return {
      score: scoreTagStats(slot.tagStats),
      hasIdfData: true,
    }
  }

  const rarestTags = item.rarity.rarestTags || []
  if (rarestTags.length > 0) {
    const slotTagSet = new Set((slot.tags || []).map((t) => t.toLowerCase()))
    const matched = rarestTags.filter(
      (rt) => rt.axis === axisKey || slotTagSet.has(rt.tag.toLowerCase())
    )
    if (matched.length > 0) {
      return {
        score: scoreTagStats(matched),
        hasIdfData: true,
      }
    }
  }

  return { score: 0, hasIdfData: false }
}

function computeTopRarityDriver(
  itemA: PromptItem,
  itemB: PromptItem,
  changedRows: AttributeDiffRow[]
): RarityDriverResult | null {
  if (changedRows.length === 0) return null

  let best: RarityDriverResult | null = null

  for (const row of changedRows) {
    const idfA = computeSlotRarityScore(row.slotA, row.meta.key, itemA)
    const idfB = computeSlotRarityScore(row.slotB, row.meta.key, itemB)
    const lexicalDivergence = Math.max(0.05, 1 - row.attrDiff.similarityRatio)

    let delta = 0
    let rarerSide: 'A' | 'B' = 'A'
    let isEstimated = false

    if (idfA.hasIdfData || idfB.hasIdfData) {
      delta = Math.abs(idfA.score - idfB.score)
      rarerSide = idfA.score >= idfB.score ? 'A' : 'B'
    } else {
      isEstimated = true
      const estA = row.slotA.filled
        ? (itemA.rarity.percentile / 100) * (0.4 + 0.6 * lexicalDivergence)
        : 0
      const estB = row.slotB.filled
        ? (itemB.rarity.percentile / 100) * (0.4 + 0.6 * lexicalDivergence)
        : 0
      delta = Math.abs(estA - estB)
      rarerSide = estA >= estB ? 'A' : 'B'
    }

    if (!best || delta > best.delta) {
      best = {
        key: row.meta.key,
        label: row.meta.label,
        shortLabel: row.meta.shortLabel,
        rarerSide,
        delta,
        isEstimated,
      }
    }
  }

  if (best && best.delta === 0) {
    let fallbackRow = changedRows[0]
    let maxDiv = -1
    for (const row of changedRows) {
      const div =
        1 - row.attrDiff.similarityRatio + (row.slotA.filled !== row.slotB.filled ? 0.25 : 0)
      if (div > maxDiv) {
        maxDiv = div
        fallbackRow = row
      }
    }
    const lexicalDivergence = Math.max(0.05, 1 - fallbackRow.attrDiff.similarityRatio)
    const tieRarerSide: 'A' | 'B' =
      itemA.rarity.percentile !== itemB.rarity.percentile
        ? itemA.rarity.percentile > itemB.rarity.percentile
          ? 'A'
          : 'B'
        : itemA.rarity.score !== itemB.rarity.score
          ? itemA.rarity.score > itemB.rarity.score
            ? 'A'
            : 'B'
          : fallbackRow.slotA.filled !== fallbackRow.slotB.filled
            ? fallbackRow.slotA.filled
              ? 'A'
              : 'B'
            : fallbackRow.txtA.length >= fallbackRow.txtB.length
              ? 'A'
              : 'B'

    return {
      key: fallbackRow.meta.key,
      label: fallbackRow.meta.label,
      shortLabel: fallbackRow.meta.shortLabel,
      rarerSide: tieRarerSide,
      delta: Math.max(0.01, Number((lexicalDivergence * 0.25).toFixed(2))),
      isEstimated: true,
    }
  }

  return best
}

function pickRarerItem(a: PromptItem, b: PromptItem): PromptItem {
  if (a.rarity.percentile !== b.rarity.percentile) {
    return a.rarity.percentile > b.rarity.percentile ? a : b
  }
  return a.rarity.score >= b.rarity.score ? a : b
}

/**
 * Visual abstrato da Suíte Criativa preenchendo o card do Hero Banner.
 */
const CreativeSuiteHeroBannerVisual: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative h-full min-h-[204px] w-full overflow-hidden rounded-2xl bg-canvas/90 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent)] lg:min-h-[228px]"
  >
    {/* Camada 1: Superfície, brilhos radiais e grade óptica preenchendo 100% do card */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient
          id="pairsSuiteGlowRosa"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(430 102) rotate(135) scale(280 140)"
        >
          <stop stopColor="var(--color-tier-s)" stopOpacity="0.34" />
          <stop offset="0.6" stopColor="var(--color-brand)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="pairsSuiteGlowIndigo"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(176 164) rotate(25) scale(240 110)"
        >
          <stop stopColor="var(--color-brand)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="240" fill="var(--color-surface)" />
      <rect width="640" height="240" fill="url(#pairsSuiteGlowRosa)" />
      <rect width="640" height="240" fill="url(#pairsSuiteGlowIndigo)" />

      {/* Grade óptica sutil */}
      <g stroke="var(--color-ink)" strokeOpacity="0.06" strokeWidth="1">
        <line x1="0" y1="60" x2="640" y2="60" />
        <line x1="0" y1="120" x2="640" y2="120" />
        <line x1="0" y1="180" x2="640" y2="180" />
        <line x1="128" y1="0" x2="128" y2="240" />
        <line x1="256" y1="0" x2="256" y2="240" />
        <line x1="384" y1="0" x2="384" y2="240" />
        <line x1="512" y1="0" x2="512" y2="240" />
      </g>
    </svg>

    {/* Camada 2: Ondas duplas de DNA, 8 slots estruturais e nó central ocupando toda a largura */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hv-enter pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient
          id="pairsHelixMain"
          x1="36"
          y1="120"
          x2="604"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-brand-bright)" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="var(--color-tier-s)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--color-tier-s-bright)" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient
          id="pairsHelixMirror"
          x1="36"
          y1="120"
          x2="604"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-ink)" stopOpacity="0.18" />
          <stop offset="0.52" stopColor="var(--color-brand-bright)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--color-tier-s)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Barras verticais de comparação de 8 slots */}
      {[84, 152, 220, 288, 352, 420, 488, 556].map((x, idx) => {
        const isDivergent = idx === 2 || idx === 4 || idx === 5
        const divergentDelay =
          idx === 2 ? '1.06s' : idx === 4 ? '2.04s' : idx === 5 ? '2.54s' : undefined
        const topY = 56 + ((idx * 17) % 30)
        const botY = 184 - ((idx * 13) % 28)
        return (
          <g
            key={x}
            className={isDivergent ? 'hv-pairs-bar' : undefined}
            style={divergentDelay ? { animationDelay: divergentDelay } : undefined}
          >
            <line
              x1={x}
              y1={topY}
              x2={x}
              y2={botY}
              stroke={isDivergent ? 'var(--color-tier-s)' : 'var(--color-ink)'}
              strokeOpacity={isDivergent ? 0.45 : 0.14}
              strokeWidth="1.35"
              strokeDasharray={isDivergent ? undefined : '2 3'}
            />
            <circle
              cx={x}
              cy={topY}
              r={isDivergent ? 3.6 : 2.5}
              fill={isDivergent ? 'var(--color-tier-s)' : 'var(--color-ink-tertiary)'}
            />
            <circle
              cx={x}
              cy={botY}
              r={isDivergent ? 3.6 : 2.5}
              fill={isDivergent ? 'var(--color-tier-s-bright)' : 'var(--color-brand-bright)'}
              fillOpacity={isDivergent ? 0.95 : 0.7}
            />
          </g>
        )
      })}

      {/* Ondas duplas de DNA (Semântica × Estrutural) */}
      <path
        d="M36 146 C126 62, 214 62, 320 120 C426 178, 514 178, 604 92"
        stroke="url(#pairsHelixMain)"
        className="hero-viz-breathe"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M36 94 C126 178, 214 178, 320 120 C426 62, 514 62, 604 148"
        stroke="url(#pairsHelixMirror)"
        className="hero-viz-breathe-alt"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <line
        x1="36"
        y1="40"
        x2="36"
        y2="200"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="hv-pairs-scan"
      />

      {/* Nó central de divergência */}
      <circle
        cx="320"
        cy="120"
        r="16"
        className="hv-pairs-core"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <circle
        cx="320"
        cy="120"
        r="5.5"
        className="hv-pairs-core"
        fill="var(--color-tier-s)"
      />
      <circle cx="320" cy="120" r="2.2" fill="var(--color-ink)" />
    </svg>

    {/* Camada 3: Retículos óticos nos 4 cantos (sem texto na ilustração) */}
    <span className="pointer-events-none absolute top-3.5 left-3.5 h-3 w-3 border-t border-l border-ink/25" />
    <span className="pointer-events-none absolute top-3.5 right-3.5 h-3 w-3 border-t border-r border-ink/25" />
    <span className="pointer-events-none absolute bottom-3.5 left-3.5 h-3 w-3 border-b border-l border-ink/25" />
    <span className="pointer-events-none absolute right-3.5 bottom-3.5 h-3 w-3 border-r border-b border-ink/25" />
  </div>
)

const MetricCounterBar: React.FC<{
  label: string
  targetPct: number
}> = ({ label, targetPct }) => {
  const animated = useAnimatedNumber(targetPct, { durationMs: 260, decimals: 0 })
  const rounded = Math.round(animated)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-tertiary">{label}</span>
        <span className="tabular-mono text-[12px] font-medium text-ink">{rounded}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.14]">
        <div
          className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
          style={{
            transform: `scaleX(${targetPct <= 0 ? 0 : Math.max(0.03, Math.min(1, targetPct / 100))})`,
          }}
        />
      </div>
    </div>
  )
}

export const PairsView: React.FC<PairsViewProps> = ({
  items,
  pairsData,
  customPairIds,
  onClearCustomPair,
  onInspectItem,
  isFavorite,
  onToggleFavorite,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()
  const [category, setCategory] = useState<PairCategory>('same_skeleton_diff_subject')
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [highlightRarityDriver, setHighlightRarityDriver] = useState(true)
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)
  const [pairQuery, setPairQuery] = useState('')
  const [arenaView, setArenaView] = useState<'cards' | 'slider'>('cards')
  const [hydratedExtras, setHydratedExtras] = useState<Record<string, PromptItem>>({})
  const [loadingCustomPair, setLoadingCustomPair] = useState(false)

  const pairItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const catNavRef = useRef<HTMLDivElement | null>(null)
  const catBtnRefs = useRef<Partial<Record<PairCategory, HTMLButtonElement | null>>>({})
  const [catClipInset, setCatClipInset] = useState('inset(4px 100% 4px 4px round 9999px)')

  const arenaNavRef = useRef<HTMLDivElement | null>(null)
  const arenaBtnRefs = useRef<Partial<Record<'cards' | 'slider', HTMLButtonElement | null>>>({})
  const [arenaClipInset, setArenaClipInset] = useState('inset(2px 50% 2px 2px round 9999px)')

  const baseItemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const itemMap = useMemo(() => {
    const merged = new Map(baseItemMap)
    for (const [id, extra] of Object.entries(hydratedExtras)) {
      if (!merged.has(id)) merged.set(id, extra)
    }
    return merged
  }, [baseItemMap, hydratedExtras])

  useEffect(() => {
    if (!customPairIds) {
      setLoadingCustomPair(false)
      return
    }
    const missing = customPairIds.filter((id) => !baseItemMap.has(id) && !hydratedExtras[id])
    if (missing.length === 0) {
      setLoadingCustomPair(false)
      return
    }

    let cancelled = false
    setLoadingCustomPair(true)
    Promise.all(
      missing.map(async (id) => {
        const res = await fetch(`/api/prompt/${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as PromptDetailResponse
        return payload.item
      })
    )
      .then((fetched) => {
        if (cancelled) return
        setHydratedExtras((prev) => {
          const next = { ...prev }
          for (const it of fetched) {
            next[it.id] = it
          }
          return next
        })
        setLoadingCustomPair(false)
      })
      .catch(() => {
        if (!cancelled) setLoadingCustomPair(false)
      })

    return () => {
      cancelled = true
    }
  }, [customPairIds, baseItemMap, hydratedExtras])

  const activeList: PromptPairRecord[] = useMemo(() => {
    if (category === 'same_skeleton_diff_subject') return pairsData.sameSkeletonDiffSubject
    if (category === 'same_subject_diff_skeleton') return pairsData.sameSubjectDiffSkeleton
    return pairsData.nearDuplicates
  }, [category, pairsData])

  const filteredList = useMemo(() => {
    const q = pairQuery.trim().toLowerCase()
    if (!q) return activeList
    return activeList.filter((pair) => {
      const a = itemMap.get(pair.idA)
      const b = itemMap.get(pair.idB)
      if (!a || !b) return false
      return (
        a.project.toLowerCase().includes(q) ||
        b.project.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        b.title.toLowerCase().includes(q) ||
        a.attributes.estrutura.kernelDialect.toLowerCase().includes(q) ||
        b.attributes.estrutura.kernelDialect.toLowerCase().includes(q) ||
        getPromptSemanticTitle(a).toLowerCase().includes(q) ||
        getPromptSemanticTitle(b).toLowerCase().includes(q)
      )
    })
  }, [activeList, itemMap, pairQuery])

  const customPairRecord: PromptPairRecord | null = useMemo(() => {
    if (!customPairIds) return null
    const a = itemMap.get(customPairIds[0])
    const b = itemMap.get(customPairIds[1])
    if (!a || !b) return null
    const sim = computeTwoLayerSimilarity(a, b)
    const changed = COMPARABLE_ATTRIBUTE_META.map((m) => m.key).filter(
      (k) => a.attributes[k].text.trim().toLowerCase() !== b.attributes[k].text.trim().toLowerCase()
    )
    return {
      id: `custom:${a.id}:${b.id}`,
      idA: a.id,
      idB: b.id,
      category: sim.category === 'distinct' ? 'same_skeleton_diff_subject' : sim.category,
      semanticSim: sim.semanticSim,
      structuralSim: sim.structuralSim,
      divergenceScore: sim.divergenceScore,
      changedAttributes: changed,
      sharedAttributeCount: COMPARABLE_ATTRIBUTE_META.length - changed.length,
      reason: 'Par selecionado diretamente no Mapa.',
    }
  }, [customPairIds, itemMap])

  const currentPair = useMemo(() => {
    if (customPairRecord) return customPairRecord
    if (selectedPairId) {
      const found = filteredList.find((p) => p.id === selectedPairId)
      if (found) return found
    }
    return filteredList[0] || activeList[0] || null
  }, [customPairRecord, selectedPairId, filteredList, activeList])

  const itemA = currentPair ? itemMap.get(currentPair.idA) || null : null
  const itemB = currentPair ? itemMap.get(currentPair.idB) || null : null

  const cleanDiff = useMemo(() => {
    if (!itemA || !itemB) return null
    return diffPromptsLab(itemA.cleanPrompt, itemB.cleanPrompt)
  }, [itemA, itemB])

  const rareWordsA = useMemo(() => (itemA ? extractRarityWordSet(itemA) : new Set<string>()), [itemA])
  const rareWordsB = useMemo(() => (itemB ? extractRarityWordSet(itemB) : new Set<string>()), [itemB])

  const attributeDiffRows = useMemo<AttributeDiffRow[]>(() => {
    if (!itemA || !itemB) return []
    return COMPARABLE_ATTRIBUTE_META.map((meta) => {
      const slotA = itemA.attributes[meta.key]
      const slotB = itemB.attributes[meta.key]
      const txtA = slotA.text || '—'
      const txtB = slotB.text || '—'
      const changed = (slotA.text || '').trim().toLowerCase() !== (slotB.text || '').trim().toLowerCase()
      const attrDiff = diffPromptsLab(txtA, txtB)
      return { meta, slotA, slotB, txtA, txtB, changed, attrDiff }
    })
  }, [itemA, itemB])

  const changedAttrKeySet = useMemo(
    () => new Set(attributeDiffRows.filter((r) => r.changed).map((r) => r.meta.key)),
    [attributeDiffRows]
  )

  const visibleAttributes = useMemo(() => {
    return onlyChanges ? attributeDiffRows.filter((row) => row.changed) : attributeDiffRows
  }, [attributeDiffRows, onlyChanges])

  const topRarityDriver = useMemo(() => {
    if (!itemA || !itemB) return null
    return computeTopRarityDriver(
      itemA,
      itemB,
      attributeDiffRows.filter((row) => row.changed)
    )
  }, [itemA, itemB, attributeDiffRows])

  const categoryTabs = useMemo(
    () =>
      [
        {
          id: 'same_skeleton_diff_subject' as const,
          label: 'Esqueleto =',
          fullLabel: 'Mesmo Esqueleto · Assunto ≠',
          desc: 'Alta estrutural + baixa semântica',
          count: pairsData.sameSkeletonDiffSubject.length,
        },
        {
          id: 'same_subject_diff_skeleton' as const,
          label: 'Assunto =',
          fullLabel: 'Mesmo Assunto · Esqueleto ≠',
          desc: 'Alta semântica + baixa estrutural',
          count: pairsData.sameSubjectDiffSkeleton.length,
        },
        {
          id: 'near_duplicate' as const,
          label: 'Duplicados',
          fullLabel: 'Quase Duplicados',
          desc: 'Alta semântica + alta estrutural',
          count: pairsData.nearDuplicates.length,
        },
      ] as const,
    [pairsData]
  )

  const activeCategoryMeta = categoryTabs.find((c) => c.id === category) ?? categoryTabs[0]

  useLayoutEffect(() => {
    const updateClip = () => {
      const nav = catNavRef.current
      const btn = catBtnRefs.current[category]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setCatClipInset(`inset(4px ${right}px 4px ${left}px round 9999px)`)
    }
    updateClip()
    const navEl = catNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [category, pairsData])

  const hasActiveArenaPair = Boolean(currentPair && itemA && itemB)

  useLayoutEffect(() => {
    const updateArenaClip = () => {
      const nav = arenaNavRef.current
      const btn = arenaBtnRefs.current[arenaView]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setArenaClipInset(`inset(2px ${right}px 2px ${left}px round 9999px)`)
    }
    updateArenaClip()
    const navEl = arenaNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateArenaClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [arenaView, hasActiveArenaPair])

  // Navegação por teclado ↑↓ na lista de pares: 0ms de animação (emil-design-eng)
  const handlePairListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const visiblePairs = filteredList.filter((p) => itemMap.has(p.idA) && itemMap.has(p.idB))
    if (visiblePairs.length === 0) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const currentIndex = currentPair ? visiblePairs.findIndex((p) => p.id === currentPair.id) : -1
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.max(0, Math.min(visiblePairs.length - 1, currentIndex + delta))
    const nextPair = visiblePairs[nextIndex]
    if (!nextPair || nextPair.id === currentPair?.id) return
    onClearCustomPair()
    setSelectedPairId(nextPair.id)
    const node = pairItemRefs.current.get(nextPair.id)
    node?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 p-4 sm:p-6">
      {/* Hero Banner da Suíte Criativa (Texto + 2 CTAs à esquerda · Visual DNA preenchendo o card à direita) */}
      <header className="relative overflow-hidden rounded-[22px] bg-surface p-6 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-ink)_5%,transparent)] sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-5 lg:col-span-5">
            <div className="space-y-2.5">
              <span className="section-eyebrow">
                Suíte Criativa · Similaridade em Duas Camadas
              </span>
              <h1 className="text-[22px] font-medium tracking-[-0.025em] text-ink sm:text-[26px]">
                Duelo de Pares, Divergências &amp; DNA de Raridade
              </h1>
              <p className="max-w-xl text-[13px] leading-relaxed text-ink-tertiary">
                Compara o que cada carta diz (embeddings semânticos) contra como ela é arquitetada
                (molde, dialeto e 8 slots estruturais), isolando em tempo real o atributo que mais
                eleva a raridade do par.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={highlightRarityDriver}
                onClick={() => setHighlightRarityDriver((v) => !v)}
                className={[
                  'lab-pressable inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold cursor-pointer',
                  highlightRarityDriver
                    ? 'bg-tier-s text-canvas [@media(hover:hover)]:hover:brightness-105'
                    : 'border border-tier-s/35 bg-tier-s/12 text-tier-s [@media(hover:hover)]:hover:bg-tier-s/20',
                ].join(' ')}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Destacar impacto na raridade</span>
              </button>

              <button
                type="button"
                aria-pressed={onlyChanges}
                onClick={() => setOnlyChanges((v) => !v)}
                className={[
                  'lab-pressable inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-[12px] font-medium cursor-pointer',
                  onlyChanges
                    ? 'bg-ink/85 text-canvas [@media(hover:hover)]:hover:bg-ink'
                    : 'border border-hairline bg-elevated text-ink-secondary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink',
                ].join(' ')}
              >
                {onlyChanges ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{onlyChanges ? 'Só divergências' : 'Todos os 7 atributos'}</span>
              </button>
            </div>
          </div>

          <div className="flex w-full lg:col-span-7">
            <CreativeSuiteHeroBannerVisual />
          </div>
        </div>
      </header>

      {/* Grid Principal: 2 colunas direto sobre bg-canvas (sem caixas envoltórias) */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Coluna Esquerda: Título + Segmented Clip-Path + Busca + Lista de Pares com Imagem Gradiente */}
        <section className="flex flex-col gap-3.5 lg:sticky lg:top-4 lg:col-span-5 lg:max-h-[calc(100dvh-132px)]">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
                Pares Comparador DNA
              </h2>
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-ink-muted">
                <ArrowUpDown className="h-2.5 w-2.5" />
                <span>↑↓ navegar</span>
              </span>
            </div>
            <p className="truncate text-[12px] text-ink-tertiary">
              {activeCategoryMeta.fullLabel} · {activeCategoryMeta.desc}
            </p>
          </div>

          {/* Segmented control com recorte clip-path */}
          <div
            ref={catNavRef}
            role="tablist"
            aria-label="Categorias de pares"
            className="relative grid grid-cols-3 rounded-full bg-surface p-1"
          >
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                ref={(el) => {
                  catBtnRefs.current[tab.id] = el
                }}
                type="button"
                role="tab"
                aria-selected={!customPairRecord && category === tab.id}
                onClick={() => {
                  onClearCustomPair()
                  setCategory(tab.id)
                  setSelectedPairId(null)
                }}
                className="lab-pressable flex items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium text-ink-tertiary [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                <span className="truncate">{tab.label}</span>
                <span className="tabular-mono text-[10px] opacity-70">{tab.count}</span>
              </button>
            ))}

            {!customPairRecord ? (
              <div
                aria-hidden="true"
                style={{ clipPath: catClipInset }}
                className="pointer-events-none absolute inset-0 grid grid-cols-3 p-1 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
              >
                {categoryTabs.map((tab) => (
                  <span
                    key={tab.id}
                    className="flex items-center justify-center gap-1 rounded-full bg-ink px-2 py-1.5 text-[11px] font-semibold text-canvas"
                  >
                    <span className="truncate">{tab.label}</span>
                    <span className="tabular-mono text-[10px] opacity-75">{tab.count}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Busca rápida na lista de pares */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={pairQuery}
              onChange={(e) => setPairQuery(e.target.value)}
              placeholder="Filtrar pares (projeto, dialeto, título)..."
              aria-label="Filtrar lista de pares"
              className="w-full rounded-full bg-surface py-2 pr-8 pl-9 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:ring-1 focus:ring-border-strong focus:outline-none"
            />
            {pairQuery ? (
              <button
                type="button"
                onClick={() => setPairQuery('')}
                aria-label="Limpar busca de pares"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-ink-muted [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          {/* Lista de cards horizontais com imagem gradiente da carta mais rara */}
          <div
            tabIndex={0}
            role="listbox"
            aria-label="Lista de pares comparáveis"
            onKeyDown={handlePairListKeyDown}
            className="flex-1 space-y-2.5 overflow-y-auto pr-1.5 pb-2 focus:outline-none"
          >
            {filteredList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-hairline bg-surface p-6 text-center font-mono text-[11px] text-ink-muted">
                Nenhum par corresponde a "{pairQuery}".
              </div>
            ) : (
              filteredList.map((pair) => {
                const a = itemMap.get(pair.idA)
                const b = itemMap.get(pair.idB)
                if (!a || !b) return null
                const isSel = currentPair?.id === pair.id
                const rarerItem = pickRarerItem(a, b)
                const rarerSemantic = getPromptSemanticTitle(rarerItem)
                const surfaceToken = isSel ? 'var(--color-elevated)' : 'var(--color-surface)'
                const comparableChangedCount = pair.changedAttributes.filter(
                  (k) => k !== 'projeto_cliente'
                ).length

                return (
                  <button
                    key={pair.id}
                    ref={(el) => {
                      if (el) pairItemRefs.current.set(pair.id, el)
                      else pairItemRefs.current.delete(pair.id)
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onClearCustomPair()
                      setSelectedPairId(pair.id)
                    }}
                    className={[
                      'lab-pressable-subtle group relative flex min-h-[88px] w-full flex-col justify-between overflow-hidden rounded-[18px] p-3.5 text-left cursor-pointer',
                      isSel
                        ? 'bg-elevated ring-1 ring-inset ring-ink/35'
                        : 'bg-surface [@media(hover:hover)]:hover:bg-surface-hover',
                    ].join(' ')}
                  >
                    {/* Imagem da carta mais rara à direita com máscara gradiente */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 w-[64%] overflow-hidden"
                      style={{
                        WebkitMaskImage:
                          'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.5) 38%, rgba(0,0,0,0.92) 78%, #000 100%)',
                        maskImage:
                          'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.5) 38%, rgba(0,0,0,0.92) 78%, #000 100%)',
                      }}
                    >
                      <PromptThumb
                        src={rarerItem.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        fallbackLabel="·"
                        className="h-full w-full object-cover object-center opacity-70"
                        fallbackClassName="h-full w-full bg-gradient-to-br from-transparent via-brand/15 to-tier-s/20"
                      />
                    </div>

                    {/* Gradiente de proteção de leitura à esquerda */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: `linear-gradient(90deg, ${surfaceToken} 0%, ${surfaceToken} 34%, color-mix(in srgb, ${surfaceToken} 68%, transparent) 66%, color-mix(in srgb, ${surfaceToken} 18%, transparent) 100%)`,
                      }}
                    />

                    {/* Conteúdo sobreposto ao gradiente */}
                    <div className="relative z-10 flex w-full items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-ink">
                          {a.project} / {b.project}
                        </div>
                        <div className="mt-0.5 max-w-[78%] truncate text-[11px] text-ink-secondary">
                          {rarerSemantic}
                        </div>
                      </div>

                      <span className="tabular-mono shrink-0 rounded-full bg-tier-s px-2 py-0.5 text-[9px] font-semibold text-canvas">
                        TIER {rarerItem.rarity.tier} · Δ{Math.round(pair.divergenceScore * 100)}%
                      </span>
                    </div>

                    <div className="relative z-10 mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-ink-tertiary">
                      <span className="tabular-mono">
                        SEM {Math.round(pair.semanticSim * 100)}% · EST{' '}
                        {Math.round(pair.structuralSim * 100)}%
                      </span>
                      <span className="tabular-mono text-ink-secondary">
                        {comparableChangedCount}/7 divergem
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* Coluna Direita: Arena de Comparação (direto no bg-canvas) */}
        <section className="flex flex-col gap-6 lg:col-span-7">
          {!currentPair || !itemA || !itemB ? (
            <div className="flex h-64 items-center justify-center rounded-[22px] bg-surface text-[13px] text-ink-muted">
              {loadingCustomPair
                ? 'Hidratando prompts do par via SQLite...'
                : 'Nenhum par disponível nesta categoria.'}
            </div>
          ) : (
            <>
              {/* Cabeçalho da Arena */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[24px] font-normal tracking-[-0.025em] text-ink sm:text-[28px]">
                    Arena de Comparação
                  </h2>

                  {highlightRarityDriver && topRarityDriver ? (
                    <span className="tabular-mono inline-flex items-center gap-1.5 rounded-full bg-tier-s px-3 py-1 text-[10px] font-semibold text-canvas">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>
                        Impacto: {topRarityDriver.label} · Carta {topRarityDriver.rarerSide} (+
                        {topRarityDriver.delta.toFixed(2)})
                      </span>
                    </span>
                  ) : null}
                </div>
                <p className="text-[13px] text-ink-tertiary">{currentPair.reason}</p>
              </div>

              {/* 3 Barras de Telemetria Limpas */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6">
                <MetricCounterBar
                  label="Semântica"
                  targetPct={Math.round(currentPair.semanticSim * 100)}
                />
                <MetricCounterBar
                  label="Estrutural"
                  targetPct={Math.round(currentPair.structuralSim * 100)}
                />
                <MetricCounterBar
                  label="Divergência"
                  targetPct={Math.round(currentPair.divergenceScore * 100)}
                />
              </div>

              {/* Toggle Centralizado Duelo de cartas | Slide A/B com clip-path */}
              <div className="flex justify-center">
                <div
                  ref={arenaNavRef}
                  role="tablist"
                  aria-label="Modo de visualização da arena"
                  className="relative inline-grid grid-cols-2 rounded-full bg-surface p-0.5"
                >
                  {(
                    [
                      { id: 'cards' as const, label: 'Duelo de cartas', Icon: Columns2 },
                      { id: 'slider' as const, label: 'Slide A/B', Icon: SlidersHorizontal },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      ref={(el) => {
                        arenaBtnRefs.current[id] = el
                      }}
                      type="button"
                      role="tab"
                      aria-selected={arenaView === id}
                      onClick={() => setArenaView(id)}
                      className="lab-pressable inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[11px] font-medium text-ink-tertiary [@media(hover:hover)]:hover:text-ink cursor-pointer"
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span>{label}</span>
                    </button>
                  ))}

                  <div
                    aria-hidden="true"
                    style={{ clipPath: arenaClipInset }}
                    className="pointer-events-none absolute inset-0 grid grid-cols-2 p-0.5 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
                  >
                    {(
                      [
                        { id: 'cards' as const, label: 'Duelo de cartas', Icon: Columns2 },
                        { id: 'slider' as const, label: 'Slide A/B', Icon: SlidersHorizontal },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <span
                        key={id}
                        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 py-1.5 text-[11px] font-semibold text-canvas"
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Palco da Arena: Cartas Verticais sem Borda/Stroke OU Slider A/B */}
              {arenaView === 'slider' ? (
                <div className="space-y-3">
                  <ClipComparisonSlider
                    leftLabel="CARTA A"
                    rightLabel="CARTA B"
                    leftSublabel={getPromptSemanticTitle(itemA)}
                    rightSublabel={getPromptSemanticTitle(itemB)}
                    leftImageUrl={itemA.thumbnailUrl}
                    rightImageUrl={itemB.thumbnailUrl}
                    leftTitle={itemA.title}
                    rightTitle={itemB.title}
                    leftTier={itemA.rarity.tier}
                    rightTier={itemB.rarity.tier}
                  />
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    {[
                      { label: 'Inspecionar Carta A', item: itemA },
                      { label: 'Inspecionar Carta B', item: itemB },
                    ].map((btn) => (
                      <button
                        key={btn.item.id + btn.label}
                        type="button"
                        onClick={() => onInspectItem(btn.item)}
                        className="lab-pressable inline-flex items-center gap-1.5 rounded-full bg-elevated px-3.5 py-1.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {(
                    [
                      { side: 'A' as const, label: 'CARTA A', item: itemA, rival: itemB },
                      { side: 'B' as const, label: 'CARTA B', item: itemB, rival: itemA },
                    ] as const
                  ).map(({ side, label, item, rival }) => {
                    const semanticTitle = getPromptSemanticTitle(item)
                    const percentileLead = Math.round(item.rarity.percentile - rival.rarity.percentile)
                    const isRarerWinner = percentileLead > 0

                    return (
                      <div key={`${label}:${item.id}`} className="flex flex-col gap-3">
                        {/* Topo da Carta: Rótulo discreto + Pílula rosa */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="tabular-mono text-[11px] font-medium tracking-wider text-ink-tertiary">
                            {label}
                          </span>

                          <span className="tabular-mono rounded-full bg-tier-s px-2.5 py-0.5 text-[10px] font-semibold text-canvas">
                            TIER {item.rarity.tier} · P{item.rarity.percentile}
                          </span>
                        </div>

                        {/* Imagem vertical 3:4 limpa, SEM borda ou stroke */}
                        <div className="aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-surface">
                          <PromptThumb
                            src={item.thumbnailUrl}
                            alt={item.title}
                            loading="eager"
                            fallbackLabel={side}
                          />
                        </div>

                        {/* 7 pips horizontais de DNA comparáveis centralizados abaixo da imagem */}
                        <div
                          className="mx-auto flex w-full max-w-[216px] items-center justify-center gap-1.5 pt-0.5"
                          aria-label={`DNA estrutural da ${label}: ${changedAttrKeySet.size} atributos divergem`}
                        >
                          {COMPARABLE_ATTRIBUTE_META.map((attr) => {
                            const filled = item.attributes[attr.key].filled
                            const diverges = changedAttrKeySet.has(attr.key)
                            return (
                              <span
                                key={attr.key}
                                title={`${attr.label}${
                                  !filled
                                    ? ' (vazio)'
                                    : diverges
                                      ? ' (diverge entre A e B)'
                                      : ' (igual)'
                                }`}
                                className={[
                                  'h-1.5 flex-1 rounded-full',
                                  !filled
                                    ? 'bg-ink/[0.14]'
                                    : diverges
                                      ? 'bg-tier-s'
                                      : 'bg-ink/80',
                                ].join(' ')}
                              />
                            )
                          })}
                        </div>

                        {/* Bloco tipográfico abaixo dos pips */}
                        <div className="space-y-1">
                          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
                            {semanticTitle}
                          </h3>
                          <p className="truncate font-mono text-[11px] text-ink-tertiary">
                            {item.project} · {item.attributes.estrutura.macroFormat.toUpperCase()}
                          </p>
                          <p className="truncate font-mono text-[11px] text-ink-muted">
                            {item.attributes.estrutura.kernelDialect} · MAT{' '}
                            {Math.round(item.maturity.score)}/100
                          </p>
                          <p className="tabular-mono text-[11px] text-ink-secondary">
                            {item.rarity.label}
                          </p>

                          {isRarerWinner ? (
                            <div className="pt-1">
                              <span className="tabular-mono inline-flex items-center rounded-full bg-tier-s px-2.5 py-0.5 text-[10px] font-semibold text-canvas">
                                +{percentileLead}P mais rara
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* Ações da Carta: 2 pílulas à esquerda + favorito circular à direita */}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onInspectItem(item)}
                              className="lab-pressable inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                            >
                              <Maximize2 className="h-3 w-3" />
                              <span>Inspecionar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void copyText(item.rawPrompt, `pair-card:${side}:${item.id}`)}
                              className="lab-pressable inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                            >
                              {copiedKey === `pair-card:${side}:${item.id}` ? (
                                <Check className="h-3 w-3 text-success" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span>
                                {copiedKey === `pair-card:${side}:${item.id}` ? 'Copiado' : 'Copiar'}
                              </span>
                            </button>
                          </div>

                          {onToggleFavorite ? (
                            <FavoriteToggleButton
                              active={isFavorite?.(item.id) ?? false}
                              onToggle={() => onToggleFavorite(item)}
                              tooltipPlacement="top"
                            />
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Bloco Inferior 1: Diff estruturado por atributos (borda rosa sutil) */}
              <div className="space-y-3 rounded-[22px] border border-tier-s/35 bg-tier-s/[0.04] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow text-tier-s-bright">
                    Diff por Atributos ({visibleAttributes.length}/7 exibidos)
                  </span>
                  <span className="tabular-mono text-[10px] text-ink-muted">
                    {onlyChanges ? 'Atributos idênticos ocultos' : 'Todos os 7 atributos'}
                  </span>
                </div>

                {visibleAttributes.length === 0 ? (
                  <div className="rounded-xl bg-surface p-4 font-mono text-[11px] text-ink-muted">
                    Os 7 atributos comparáveis são idênticos entre A e B; veja o diff lexical abaixo.
                  </div>
                ) : (
                  <div className="diff-span-enter space-y-2.5">
                    {visibleAttributes.map(({ meta, txtA, txtB, attrDiff }) => {
                      const attrRareA = itemA ? extractRarityWordSet(itemA, meta.key) : new Set<string>()
                      const attrRareB = itemB ? extractRarityWordSet(itemB, meta.key) : new Set<string>()
                      const spansA = mergeDiffRuns(
                        annotateRaritySpans(
                          onlyChanges ? collapseSharedSpans(attrDiff.spansA) : attrDiff.spansA,
                          attrRareA
                        )
                      )
                      const spansB = mergeDiffRuns(
                        annotateRaritySpans(
                          onlyChanges ? collapseSharedSpans(attrDiff.spansB) : attrDiff.spansB,
                          attrRareB
                        )
                      )
                      const isDriver = highlightRarityDriver && topRarityDriver?.key === meta.key

                      return (
                        <div
                          key={meta.key}
                          className={[
                            'rounded-2xl border p-3.5 transition-colors [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]',
                            isDriver
                              ? 'border-tier-s/60 bg-tier-s/[0.07]'
                              : 'border-hairline/70 bg-canvas/80',
                          ].join(' ')}
                        >
                          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  'tabular-mono text-[10px] font-medium uppercase tracking-wider',
                                  isDriver ? 'text-tier-s' : 'text-ink-tertiary',
                                ].join(' ')}
                              >
                                {meta.shortLabel} · {meta.label}
                              </span>
                              {isDriver && topRarityDriver ? (
                                <>
                                  <StarBorderBadge innerClassName="text-[9px] font-mono uppercase tracking-wider">
                                    <Sparkles className="h-2.5 w-2.5 text-tier-s" />
                                    <ShinyText className="font-semibold">
                                      MAIOR IMPACTO NA RARIDADE
                                    </ShinyText>
                                  </StarBorderBadge>
                                  <span className="tabular-mono rounded-full border border-tier-s/35 bg-tier-s/10 px-2 py-0.5 text-[9px] text-tier-s-bright">
                                    Carta {topRarityDriver.rarerSide} mais rara (+
                                    {topRarityDriver.delta.toFixed(2)})
                                  </span>
                                </>
                              ) : null}
                            </div>
                            <span className="tabular-mono text-[10px] text-ink-tertiary">
                              {Math.round(attrDiff.similarityRatio * 100)}% em comum
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                            {[
                              { side: 'A' as const, spans: spansA, rawText: txtA },
                              { side: 'B' as const, spans: spansB, rawText: txtB },
                            ].map(({ side, spans, rawText }) => (
                              <div
                                key={side}
                                className="group/slot relative rounded-xl border border-border-subtle bg-surface p-2.5 pr-9 font-mono text-[11px] leading-relaxed text-ink-secondary"
                              >
                                <span className="mb-1 block text-[9px] uppercase tracking-wider text-ink-muted">
                                  Carta {side}
                                </span>
                                <p>
                                  {spans.map((sp, i) => {
                                    if (sp.type === 'rare') {
                                      return (
                                        <span
                                          key={i}
                                          className="rounded-sm bg-tier-s/[0.16] px-1 text-tier-s-bright"
                                          title="Termo que aumenta a raridade"
                                        >
                                          {sp.text}
                                        </span>
                                      )
                                    }
                                    if (sp.type === 'unique') {
                                      return (
                                        <span
                                          key={i}
                                          className="rounded-sm bg-white/[0.12] px-1 text-ink"
                                        >
                                          {sp.text}
                                        </span>
                                      )
                                    }
                                    if (sp.type === 'collapsed') {
                                      return (
                                        <span key={i} className="text-ink-muted">
                                          {sp.text}
                                        </span>
                                      )
                                    }
                                    return (
                                      <span key={i} className="text-ink-tertiary">
                                        {sp.text}
                                      </span>
                                    )
                                  })}
                                </p>

                                {rawText !== '—' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void copyText(rawText, `attr:${meta.key}:${side}`)
                                    }
                                    aria-label={`Copiar ${meta.label} da Carta ${side}`}
                                    className="lab-pressable absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-tertiary [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 focus-visible:opacity-100 transition-opacity [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:text-ink cursor-pointer"
                                    title={`Copiar ${meta.shortLabel} (${side})`}
                                  >
                                    {copiedKey === `attr:${meta.key}:${side}` ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Bloco Inferior 2: Diff lexical completo / colapsado lado a lado */}
              {cleanDiff ? (
                <div className="space-y-3 rounded-[22px] bg-surface p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="section-eyebrow">
                      Diff Textual Lado a Lado ({onlyChanges ? 'só o que mudou' : 'completo'})
                    </span>
                    <span className="tabular-mono text-[10px] text-ink-muted">
                      {cleanDiff.sharedTerms.length} termos compartilhados
                    </span>
                  </div>
                  <div className="diff-span-enter grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      mergeDiffRuns(
                        annotateRaritySpans(
                          onlyChanges ? collapseSharedSpans(cleanDiff.spansA) : cleanDiff.spansA,
                          rareWordsA
                        )
                      ),
                      mergeDiffRuns(
                        annotateRaritySpans(
                          onlyChanges ? collapseSharedSpans(cleanDiff.spansB) : cleanDiff.spansB,
                          rareWordsB
                        )
                      ),
                    ].map((spans, sideIdx) => (
                      <div
                        key={sideIdx}
                        className="max-h-56 overflow-y-auto rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed"
                      >
                        {spans.map((sp, i) => {
                          if (sp.type === 'rare') {
                            return (
                              <span
                                key={i}
                                className="rounded-sm bg-tier-s/[0.16] px-1 text-tier-s-bright"
                                title="Termo que aumenta a raridade"
                              >
                                {sp.text}
                              </span>
                            )
                          }
                          if (sp.type === 'unique') {
                            return (
                              <span
                                key={i}
                                className="rounded-sm bg-white/[0.11] px-1 text-ink"
                              >
                                {sp.text}
                              </span>
                            )
                          }
                          if (sp.type === 'collapsed') {
                            return (
                              <span key={i} className="text-ink-muted">
                                {sp.text}
                              </span>
                            )
                          }
                          return (
                            <span key={i} className="text-ink-tertiary">
                              {sp.text}
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
