import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookmarkCheck,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Download,
  FlaskConical,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  axisToAttributeKey,
  defaultAttributeSourcesForGap,
  synthesizeGapPrompt,
} from '../../core/gapSynthesizer'
import { formatTagPt } from '../../core/promptTagsPt'
import { QUADRANT_META } from '../../core/rarityEngine'
import { playGapRevealSound, playTierSChime } from '../../core/soundFeedback'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import type { CartographerRank, GapDiscoveryResult } from '../../hooks/useCartographerProfile'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import { CartographerRankMark } from './CartographerRankMark'
import {
  DailyGapMissionBanner,
  axisNamePt,
  getLocalDateKey,
} from './DailyGapMissionBanner'
import { GapsIntroModal } from './GapsIntroModal'
import { PromptThumb } from './PromptThumb'
import { TIER_COLOR_META, matrixCellBg } from '../utils/themeTokens'
import {
  ATTRIBUTE_META,
  type CooccurrenceMatrix2D,
  type CoreContentAttributeKey,
  type CorpusOverviewStats,
  type DecomposePreviewResponse,
  type GapAttributeSourceMode,
  type GapDonorsResponse,
  type GapDraftRecord,
  type GapMissionStage,
  type GapMissionsStatusResponse,
  type GapRecord,
  type GapsPayload,
  type MacroFormat,
  type PromptItem,
  type RarityTier,
  type TestedGapBridgeSummary,
} from '../../types/promptEngine'

interface GapsViewProps {
  items: PromptItem[]
  gapsData: GapsPayload
  stats?: CorpusOverviewStats | null
  syncVersion?: number
  initialScope?: string
  initialGapId?: string | null
  initialDraftToLoad?: GapDraftRecord | null
  onConsumedInitialDraft?: () => void
  onDraftsChange?: (drafts: GapDraftRecord[]) => void
  onInspectItem: (item: PromptItem) => void
  onInspectPromptById?: (id: string) => void
  soundEnabled?: boolean
  discoveredGapIds?: string[]
  onDiscoverGap?: (gapId: string) => GapDiscoveryResult
  onDailyMissionCompleted?: (dateKey?: string) => void
  cartographerRank?: CartographerRank
  territoryOccupiedPct?: number
  exploredPromptsCount?: number
  favoritesCount?: number
}

type GapListMode =
  | 'global_frontier_zero'
  | 'global_3d_zero'
  | 'project_2d_zero'
  | 'global_2d_low_lift'
  | 'completed'

function canonicalBridgeKey(tags: string[]): string {
  return tags
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|')
}

function buildGapFromTestedBridge(tb: TestedGapBridgeSummary): GapRecord {
  const [tA = 'unknown', tB = 'unknown', tC] = tb.tags
  return {
    id: tC ? `tested:${tA}:${tB}:${tC}` : `tested:${tA}:${tB}`,
    kind: 'global_3d_zero',
    scope: tb.projects[0] || 'Eagle Sync',
    axisA: 'environment',
    tagA: tA,
    freqA: 0,
    axisB: 'lighting',
    tagB: tB,
    freqB: 0,
    axisC: tC ? 'angle' : undefined,
    tagC: tC,
    freqC: tC ? 0 : undefined,
    observedCount: tb.count,
    expectedCount: tb.count,
    lift: 1,
    isCoherent: true,
    donorAId: tb.items[0]?.id || null,
    donorBId: tb.items[1]?.id || tb.items[0]?.id || null,
    title: tb.tags.map((t) => formatTagPt(t)).join(' × '),
    rationale: `Missão testada e sincronizada do Eagle: ${tb.count} ${tb.count === 1 ? 'imagem gerada' : 'imagens geradas'} em ${tb.projects.join(', ') || 'Eagle'}.`,
  }
}

const EMPTY_DISCOVERED_IDS: string[] = []

function hashDateString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function formatGapSerial(serial: number): string {
  return `#${String(serial).padStart(4, '0')}`
}

function formatShortTimestamp(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface RegistrationCeremonyData {
  gapTitle: string
  expectedCount: number
  serialNumber: number
  rankRoman: string
  rankTitle: string
  territoryPct: number
  tier: RarityTier
  percentile: number
  maturityScore: number
  filledAttrs: number
  donorThumbUrl?: string | null
}

const AnimatedExpectedScore: React.FC<{ target: number }> = ({ target }) => {
  const animated = useAnimatedNumber(target, { durationMs: 380, decimals: 2 })
  return <>{animated.toFixed(2)}</>
}

const ASPECT_OPTIONS = ['3:4', '4:5', '1:1', '16:9'] as const

const CORE_ATTR_SLOTS: ReadonlyArray<{
  key: CoreContentAttributeKey
  short: string
  label: string
}> = [
  { key: 'sujeito', short: 'SUJ', label: 'Sujeito' },
  { key: 'cenario', short: 'CEN', label: 'Cenário' },
  { key: 'luz', short: 'LUZ', label: 'Luz' },
  { key: 'camera', short: 'CAM', label: 'Câmera' },
  { key: 'textura_material', short: 'MAT', label: 'Material' },
  { key: 'estilo', short: 'EST', label: 'Estilo' },
]

const FORMAT_TABS: ReadonlyArray<{ id: MacroFormat; label: string; dialect: string }> = [
  { id: 'json', label: 'JSON', dialect: 'nano_banana_g6' },
  { id: 'sections', label: 'Seções', dialect: 'fdr_direct' },
  { id: 'single_paragraph', label: 'Parágrafo Único', dialect: 'qwen_natural' },
]

function triggerFileDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const GapsView: React.FC<GapsViewProps> = ({
  items,
  gapsData,
  stats,
  syncVersion = 0,
  initialScope = 'all',
  initialGapId = null,
  initialDraftToLoad = null,
  onConsumedInitialDraft,
  onDraftsChange,
  onInspectItem,
  onInspectPromptById,
  soundEnabled = true,
  discoveredGapIds = EMPTY_DISCOVERED_IDS,
  onDiscoverGap,
  onDailyMissionCompleted,
  cartographerRank,
  territoryOccupiedPct = 0,
  exploredPromptsCount = 0,
  favoritesCount = 0,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()
  const creativeFrontierGaps = useMemo(
    () => gapsData.creativeFrontierGaps ?? [],
    [gapsData.creativeFrontierGaps]
  )
  const [matrixScope, setMatrixScope] = useState<string>(initialScope)
  const [axisPairKey, setAxisPairKey] = useState<string>('environment:lighting')
  const [listMode, setListMode] = useState<GapListMode>(() => {
    if (initialScope && initialScope !== 'all') return 'project_2d_zero'
    if (initialGapId?.startsWith('gfnt:')) return 'global_frontier_zero'
    if (initialGapId?.startsWith('g3d:')) return 'global_3d_zero'
    if (initialGapId?.startsWith('g2d:')) return 'global_2d_low_lift'
    if (initialGapId) return 'project_2d_zero'
    return (gapsData.creativeFrontierGaps?.length ?? 0) > 0 ? 'global_frontier_zero' : 'global_3d_zero'
  })
  const [selectedGapId, setSelectedGapId] = useState<string | null>(initialGapId)

  // Workstream 2 + Brief v2: Gap do Dia, Ritual de Descoberta O=0, Cerimônia e doadores hero
  const [introOpen, setIntroOpen] = useState(true)
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey())
  const [revealNonce, setRevealNonce] = useState(0)
  const [vaultModalGap, setVaultModalGap] = useState<GapRecord | null>(null)
  const [ceremonyData, setCeremonyData] = useState<RegistrationCeremonyData | null>(null)
  const [ceremonyBarReady, setCeremonyBarReady] = useState(false)
  const [adHocCellGap, setAdHocCellGap] = useState<GapRecord | null>(null)
  const [localDiscoveredIds, setLocalDiscoveredIds] = useState<string[]>([])
  const [lastDiscovery, setLastDiscovery] = useState<(GapDiscoveryResult & { gapId: string }) | null>(
    null
  )
  const synthesisSectionRef = useRef<HTMLElement | null>(null)

  // Etapa 4: Pool dinâmico de doadores reais do SQLite
  const [donorsPool, setDonorsPool] = useState<GapDonorsResponse | null>(null)
  const [loadingDonors, setLoadingDonors] = useState(false)
  const [donorAIdx, setDonorAIdx] = useState(0)
  const [donorBIdx, setDonorBIdx] = useState(0)
  const [donorCIdx, setDonorCIdx] = useState(0)

  // Etapa 4: Estado do sintetizador Gap-to-Prompt
  const [synthFormat, setSynthFormat] = useState<MacroFormat>('json')
  const [aspectRatio, setAspectRatio] = useState<string>('3:4')
  const [includeNegative, setIncludeNegative] = useState(true)
  const [exploratoryMode, setExploratoryMode] = useState(true)
  const [preserveIdentity, setPreserveIdentity] = useState(false)
  const [attributeSources, setAttributeSources] = useState<
    Record<CoreContentAttributeKey, GapAttributeSourceMode>
  >({
    sujeito: 'donor_a',
    cenario: 'donor_a',
    luz: 'donor_b',
    camera: 'donor_b',
    textura_material: 'donor_a',
    estilo: 'donor_a',
  })
  const [draftText, setDraftText] = useState('')
  const [manuallyEdited, setManuallyEdited] = useState(false)

  // Etapa 4: Telemetria ao vivo (/api/decompose-preview)
  const [preview, setPreview] = useState<DecomposePreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Etapa 4 + Rastreamento de Missões: Caderno local + missões testadas no Eagle
  const [savedDrafts, setSavedDrafts] = useState<GapDraftRecord[]>([])
  const [testedBridges, setTestedBridges] = useState<TestedGapBridgeSummary[]>(
    () => gapsData.testedBridges ?? []
  )
  const [savingDraft, setSavingDraft] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!vaultModalGap) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVaultModalGap(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [vaultModalGap])

  useEffect(() => {
    if (!ceremonyData) {
      setCeremonyBarReady(false)
      return
    }
    const rafId = window.requestAnimationFrame(() => {
      setCeremonyBarReady(true)
    })
    const dismissTimer = window.setTimeout(() => {
      setCeremonyData(null)
    }, 2400)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCeremonyData(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(dismissTimer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [ceremonyData])

  useEffect(() => {
    if (initialScope && initialScope !== 'all') {
      setMatrixScope(initialScope)
      setListMode('project_2d_zero')
    }
  }, [initialScope])

  useEffect(() => {
    if (initialGapId) {
      setSelectedGapId(initialGapId)
      if (initialGapId.startsWith('gfnt:')) setListMode('global_frontier_zero')
      else if (initialGapId.startsWith('g3d:')) setListMode('global_3d_zero')
      else if (initialGapId.startsWith('g2d:')) setListMode('global_2d_low_lift')
      else if (initialGapId.startsWith('tested:')) setListMode('completed')
      else setListMode('project_2d_zero')
    }
  }, [initialGapId])

  useEffect(() => {
    let active = true
    fetch('/api/gap-missions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GapMissionsStatusResponse | null) => {
        if (!active || !data) return
        if (Array.isArray(data.drafts)) {
          setSavedDrafts(data.drafts)
          onDraftsChange?.(data.drafts)
        }
        if (Array.isArray(data.testedBridges)) {
          setTestedBridges(data.testedBridges)
        }
      })
      .catch(() => {
        fetch('/api/gap-drafts')
          .then((r) => (r.ok ? r.json() : { drafts: [] }))
          .then((data: { drafts?: GapDraftRecord[] }) => {
            if (!active) return
            if (Array.isArray(data.drafts)) {
              setSavedDrafts(data.drafts)
              onDraftsChange?.(data.drafts)
            }
          })
          .catch(() => {
            // ignore
          })
      })
    return () => {
      active = false
    }
  }, [onDraftsChange, syncVersion])

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const availableScopes = useMemo(() => {
    const s = new Set<string>()
    for (const m of gapsData.matrices) s.add(m.scope)
    return Array.from(s)
  }, [gapsData.matrices])

  const availableAxisPairs = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of gapsData.matrices) {
      map.set(`${m.axisA}:${m.axisB}`, `${m.axisALabel} × ${m.axisBLabel}`)
    }
    return Array.from(map.entries())
  }, [gapsData.matrices])

  const activeMatrix: CooccurrenceMatrix2D | null = useMemo(() => {
    const [a, b] = axisPairKey.split(':')
    return (
      gapsData.matrices.find((m) => m.scope === matrixScope && m.axisA === a && m.axisB === b) ||
      gapsData.matrices.find((m) => m.scope === matrixScope) ||
      gapsData.matrices[0] ||
      null
    )
  }, [gapsData.matrices, matrixScope, axisPairKey])

  const activeMatrixMaxObs = useMemo(() => {
    if (!activeMatrix || activeMatrix.cells.length === 0) return 1
    return Math.max(1, ...activeMatrix.cells.map((c) => c.observed))
  }, [activeMatrix])

  const globalMatrix = useMemo(
    () => gapsData.matrices.find((m) => m.scope === 'all') ?? null,
    [gapsData.matrices]
  )
  const gfCount = stats?.googleFlowSize ?? globalMatrix?.totalPrompts ?? 0
  const totalCount = stats?.totalCorpusSize ?? gfCount

  const testedByCanonical = useMemo(() => {
    const map = new Map<string, TestedGapBridgeSummary>()
    for (const tb of testedBridges) {
      const ck = canonicalBridgeKey(tb.tags)
      if (!ck) continue
      const prev = map.get(ck)
      if (!prev || tb.latestBtime > prev.latestBtime) {
        map.set(ck, tb)
      }
    }
    return map
  }, [testedBridges])

  const getTestedBridgeForGap = (gap: GapRecord): TestedGapBridgeSummary | null => {
    const tags = [gap.tagA, gap.tagB, ...(gap.tagC ? [gap.tagC] : [])]
    return testedByCanonical.get(canonicalBridgeKey(tags)) ?? null
  }

  const savedDraftByGapId = useMemo(() => {
    const map = new Map<string, GapDraftRecord>()
    for (const d of savedDrafts) {
      const prev = map.get(d.gapId)
      if (!prev || (d.updatedAt || d.createdAt) > (prev.updatedAt || prev.createdAt)) {
        map.set(d.gapId, d)
      }
    }
    return map
  }, [savedDrafts])

  const getMissionStageForGap = (
    gap: GapRecord
  ): { stage: 'idle' | GapMissionStage; testedBridge: TestedGapBridgeSummary | null; draft: GapDraftRecord | null } => {
    const testedBridge = getTestedBridgeForGap(gap)
    const draft = savedDraftByGapId.get(gap.id) ?? null
    if (testedBridge) {
      return { stage: 'tested', testedBridge, draft }
    }
    if (draft) {
      return { stage: draft.status ?? 'forged', testedBridge: null, draft }
    }
    return { stage: 'idle', testedBridge: null, draft: null }
  }

  const baseKnownGaps = useMemo(
    () => [
      ...creativeFrontierGaps,
      ...gapsData.globalTriadGaps,
      ...gapsData.projectGaps,
      ...gapsData.globalUnderexplored,
    ],
    [creativeFrontierGaps, gapsData.globalTriadGaps, gapsData.projectGaps, gapsData.globalUnderexplored]
  )

  const completedGaps: GapRecord[] = useMemo(() => {
    const out: GapRecord[] = []
    const seenCanonical = new Set<string>()
    const seenIds = new Set<string>()

    for (const tb of testedBridges) {
      const ck = canonicalBridgeKey(tb.tags)
      if (seenCanonical.has(ck)) continue
      seenCanonical.add(ck)
      const match = baseKnownGaps.find(
        (g) => canonicalBridgeKey([g.tagA, g.tagB, ...(g.tagC ? [g.tagC] : [])]) === ck
      )
      const rec = match || buildGapFromTestedBridge(tb)
      seenIds.add(rec.id)
      out.push(rec)
    }

    for (const d of savedDrafts) {
      if (d.status === 'copied') continue
      const ck = canonicalBridgeKey([d.tagA, d.tagB, ...(d.tagC ? [d.tagC] : [])])
      if (seenIds.has(d.gapId) || (ck && seenCanonical.has(ck))) continue
      seenIds.add(d.gapId)
      if (ck) seenCanonical.add(ck)
      const match = baseKnownGaps.find((g) => g.id === d.gapId)
      out.push(
        match || {
          id: d.gapId,
          kind: d.gapId.startsWith('gfnt:')
            ? 'global_frontier_zero'
            : d.gapId.startsWith('g3d:')
              ? 'global_3d_zero'
              : 'project_2d_zero',
          scope: d.scope,
          axisA: d.axisA,
          tagA: d.tagA,
          freqA: 0,
          axisB: d.axisB,
          tagB: d.tagB,
          freqB: 0,
          axisC: d.axisC,
          tagC: d.tagC,
          observedCount: 0,
          expectedCount: 1,
          lift: 0,
          isCoherent: true,
          donorAId: d.donorAId,
          donorBId: d.donorBId,
          donorCId: d.donorCId ?? null,
          title: d.gapTitle,
          rationale: `Missão ${d.status === 'tested' ? 'marcada como testada' : 'forjada no Caderno Local'}.`,
        }
      )
    }
    return out
  }, [testedBridges, savedDrafts, baseKnownGaps])

  const allKnownGaps = useMemo(
    () => [...baseKnownGaps, ...completedGaps.filter((c) => !baseKnownGaps.some((b) => b.id === c.id))],
    [baseKnownGaps, completedGaps]
  )

  const gapOfTheDay: GapRecord | null = useMemo(() => {
    const frontierAndTriad = [...creativeFrontierGaps, ...gapsData.globalTriadGaps]
    const basePool = frontierAndTriad.length > 0 ? frontierAndTriad : gapsData.projectGaps
    const untestedZero = basePool.filter((g) => {
      if (g.observedCount !== 0) return false
      const tags = [g.tagA, g.tagB, ...(g.tagC ? [g.tagC] : [])]
      return !testedByCanonical.has(canonicalBridgeKey(tags))
    })
    const zeroPool = basePool.filter((g) => g.observedCount === 0)
    const fallbackPool = basePool.length > 0 ? basePool : gapsData.globalUnderexplored
    const pool = untestedZero.length > 0 ? untestedZero : zeroPool.length > 0 ? zeroPool : fallbackPool
    if (pool.length === 0) return null
    const idx = hashDateString(todayKey) % pool.length
    return pool[idx] || null
  }, [creativeFrontierGaps, gapsData.globalTriadGaps, gapsData.projectGaps, gapsData.globalUnderexplored, testedByCanonical, todayKey])

  const mappedZeroGapsCount = useMemo(() => {
    const zeroCount =
      creativeFrontierGaps.filter((g) => g.observedCount === 0).length +
      gapsData.projectGaps.filter((g) => g.observedCount === 0).length +
      gapsData.globalTriadGaps.filter((g) => g.observedCount === 0).length
    return Math.max(1, zeroCount, discoveredGapIds.length, localDiscoveredIds.length)
  }, [
    creativeFrontierGaps,
    gapsData.projectGaps,
    gapsData.globalTriadGaps,
    discoveredGapIds.length,
    localDiscoveredIds.length,
  ])

  const getSerialForGap = (gapId: string): number | null => {
    const propIdx = discoveredGapIds.indexOf(gapId)
    if (propIdx >= 0) return propIdx + 1
    if (lastDiscovery && lastDiscovery.gapId === gapId && lastDiscovery.serialNumber > 0) {
      return lastDiscovery.serialNumber
    }
    const localIdx = localDiscoveredIds.indexOf(gapId)
    if (localIdx >= 0) return localIdx + 1
    return null
  }

  const rankedGaps: GapRecord[] = useMemo(() => {
    if (listMode === 'global_frontier_zero') return creativeFrontierGaps
    if (listMode === 'global_3d_zero') return gapsData.globalTriadGaps
    if (listMode === 'global_2d_low_lift') return gapsData.globalUnderexplored
    if (listMode === 'completed') return completedGaps
    if (matrixScope !== 'all') {
      return gapsData.projectGaps.filter((g) => g.scope === matrixScope)
    }
    return gapsData.projectGaps
  }, [listMode, creativeFrontierGaps, gapsData, matrixScope, completedGaps])

  const selectedGap: GapRecord | null = useMemo(() => {
    if (selectedGapId) {
      const hit = allKnownGaps.find((g) => g.id === selectedGapId)
      if (hit) return hit
      if (adHocCellGap && adHocCellGap.id === selectedGapId) return adHocCellGap
    }
    return rankedGaps[0] || null
  }, [allKnownGaps, adHocCellGap, selectedGapId, rankedGaps])

  const scrollToSynthesisLab = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    synthesisSectionRef.current?.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const selectAndRevealGap = (
    gap: GapRecord,
    options?: {
      openVaultModal?: boolean
      syncScopeAndList?: boolean
      scrollToLab?: boolean
    }
  ) => {
    const isKnown = allKnownGaps.some((g) => g.id === gap.id)
    setAdHocCellGap(isKnown ? null : gap)
    setSelectedGapId(gap.id)

    if (options?.syncScopeAndList) {
      if (gap.kind === 'global_frontier_zero') {
        setListMode('global_frontier_zero')
      } else if (gap.kind === 'global_3d_zero') {
        setListMode('global_3d_zero')
      } else if (gap.kind === 'global_2d_low_lift') {
        setListMode('global_2d_low_lift')
      } else if (gap.id.startsWith('tested:')) {
        setListMode('completed')
      } else {
        setListMode('project_2d_zero')
        if (matrixScope !== 'all' && matrixScope !== gap.scope && availableScopes.includes(gap.scope)) {
          setMatrixScope(gap.scope)
        }
      }
    } else if (isKnown && listMode !== 'completed') {
      if (creativeFrontierGaps.some((g) => g.id === gap.id)) {
        setListMode('global_frontier_zero')
      } else if (gapsData.globalTriadGaps.some((g) => g.id === gap.id)) {
        setListMode('global_3d_zero')
      } else if (gapsData.globalUnderexplored.some((g) => g.id === gap.id)) {
        setListMode('global_2d_low_lift')
      } else if (gapsData.projectGaps.some((g) => g.id === gap.id)) {
        setListMode('project_2d_zero')
      }
    }

    if (gap.observedCount === 0) {
      if (onDiscoverGap) {
        const res = onDiscoverGap(gap.id)
        setLastDiscovery({ gapId: gap.id, ...res })
      } else {
        setLocalDiscoveredIds((prev) => (prev.includes(gap.id) ? prev : [...prev, gap.id]))
      }
      playGapRevealSound(soundEnabled)
      setRevealNonce((n) => n + 1)
      if (options?.openVaultModal) {
        setVaultModalGap(gap)
      }
    }

    if (options?.scrollToLab) {
      scrollToSynthesisLab()
    }
  }

  // Ao trocar de Gap selecionado: resetar índices de doadores, fontes padrão e buscar doadores no SQLite
  useEffect(() => {
    if (!selectedGap) {
      setDonorsPool(null)
      return
    }
    setDonorAIdx(0)
    setDonorBIdx(0)
    setDonorCIdx(0)
    setAttributeSources(defaultAttributeSourcesForGap(selectedGap))
    setManuallyEdited(false)

    const controller = new AbortController()
    setLoadingDonors(true)
    const params = new URLSearchParams({
      tagA: selectedGap.tagA,
      tagB: selectedGap.tagB,
      scope: selectedGap.scope,
    })
    if (selectedGap.tagC) params.set('tagC', selectedGap.tagC)

    fetch(`/api/gap-donors?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as GapDonorsResponse
      })
      .then((pool) => {
        setDonorsPool(pool)
        setLoadingDonors(false)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setDonorsPool(null)
        setLoadingDonors(false)
      })

    return () => controller.abort()
  }, [selectedGap])

  const fallbackDonorA = selectedGap?.donorAId ? itemMap.get(selectedGap.donorAId) || null : null
  const fallbackDonorB = selectedGap?.donorBId ? itemMap.get(selectedGap.donorBId) || null : null
  const fallbackDonorC = selectedGap?.donorCId ? itemMap.get(selectedGap.donorCId) || null : null

  const donorsListA = useMemo(() => {
    if (donorsPool && donorsPool.donorsA.length > 0) return donorsPool.donorsA
    return fallbackDonorA ? [fallbackDonorA] : []
  }, [donorsPool, fallbackDonorA])

  const donorsListB = useMemo(() => {
    if (donorsPool && donorsPool.donorsB.length > 0) return donorsPool.donorsB
    return fallbackDonorB ? [fallbackDonorB] : []
  }, [donorsPool, fallbackDonorB])

  const donorsListC = useMemo(() => {
    if (donorsPool && donorsPool.donorsC.length > 0) return donorsPool.donorsC
    return fallbackDonorC ? [fallbackDonorC] : []
  }, [donorsPool, fallbackDonorC])

  const donorA = donorsListA.length > 0 ? donorsListA[donorAIdx % donorsListA.length] : null
  const donorB = donorsListB.length > 0 ? donorsListB[donorBIdx % donorsListB.length] : null
  const donorC = donorsListC.length > 0 ? donorsListC[donorCIdx % donorsListC.length] : null

  // Síntese automática quando não houver edição manual em andamento
  useEffect(() => {
    if (!selectedGap || manuallyEdited) return
    const res = synthesizeGapPrompt({
      gap: selectedGap,
      donorA,
      donorB,
      donorC,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      preserveIdentity,
      exploratoryMode,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }, [
    selectedGap,
    donorA,
    donorB,
    donorC,
    synthFormat,
    aspectRatio,
    includeNegative,
    preserveIdentity,
    exploratoryMode,
    attributeSources,
    manuallyEdited,
  ])

  // Telemetria em tempo real via POST /api/decompose-preview
  useEffect(() => {
    if (!selectedGap || !draftText.trim()) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      const targetTags = [selectedGap.tagA, selectedGap.tagB]
      if (selectedGap.tagC) targetTags.push(selectedGap.tagC)

      const inheritedSet = new Set<string>()
      for (const slot of CORE_ATTR_SLOTS) {
        const srcMode = attributeSources[slot.key]
        const srcItem =
          srcMode === 'donor_c'
            ? donorC
            : srcMode === 'donor_b'
              ? donorB
              : srcMode === 'donor_a'
                ? donorA
                : null
        if (!srcItem) continue
        for (const tg of srcItem.attributes[slot.key].tags) inheritedSet.add(tg)
      }
      for (const d of [donorA, donorB, donorC]) {
        if (!d) continue
        for (const rt of d.rarity.rarestTags) inheritedSet.add(rt.tag)
      }

      fetch('/api/decompose-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          rawPrompt: draftText,
          scope: selectedGap.scope,
          targetTags,
          inheritedTags: Array.from(inheritedSet),
          knownGapZero: selectedGap.observedCount === 0,
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return (await r.json()) as DecomposePreviewResponse
        })
        .then((res) => {
          setPreview(res)
          setPreviewLoading(false)
        })
        .catch((err) => {
          if ((err as { name?: string })?.name === 'AbortError') return
          setPreviewLoading(false)
        })
    }, 260)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draftText, selectedGap, donorA, donorB, donorC, attributeSources])

  const targetSlotsMap = useMemo(() => {
    const map = new Map<CoreContentAttributeKey, string[]>()
    if (!selectedGap) return map
    const add = (ax: string | undefined, tg: string | undefined) => {
      if (!ax || !tg) return
      const key = axisToAttributeKey(ax, tg)
      const arr = map.get(key) || []
      if (!arr.includes(tg)) arr.push(tg)
      map.set(key, arr)
    }
    add(selectedGap.axisA, selectedGap.tagA)
    add(selectedGap.axisB, selectedGap.tagB)
    add(selectedGap.axisC, selectedGap.tagC)
    return map
  }, [selectedGap])

  const handleRegenerateBase = () => {
    if (!selectedGap) return
    setManuallyEdited(false)
    const res = synthesizeGapPrompt({
      gap: selectedGap,
      donorA,
      donorB,
      donorC,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      preserveIdentity,
      exploratoryMode,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }

  const persistMissionStage = async (
    status: GapMissionStage,
    options?: { showCeremony?: boolean; forceStatus?: boolean }
  ) => {
    if (!selectedGap || !draftText.trim()) return
    const res = await fetch('/api/gap-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upsertByGapId: true,
        status,
        forceStatus: options?.forceStatus === true,
        gapId: selectedGap.id,
        gapTitle: selectedGap.title,
        scope: selectedGap.scope,
        axisA: selectedGap.axisA,
        tagA: selectedGap.tagA,
        axisB: selectedGap.axisB,
        tagB: selectedGap.tagB,
        axisC: selectedGap.axisC,
        tagC: selectedGap.tagC,
        donorAId: donorA?.id || null,
        donorBId: donorB?.id || null,
        donorCId: donorC?.id || null,
        macroFormat: preview?.attributes.estrutura.macroFormat || synthFormat,
        aspectRatio,
        attributeSources,
        rawPrompt: draftText,
        rarityPercentile: preview?.rarity.percentile ?? 85,
        rarityTier: preview?.rarity.tier ?? 'A',
        rarityLabel: preview?.rarity.label ?? 'mais raro que 85% da coleção',
        maturityScore: preview?.maturity.score ?? 75,
        quadrant: preview?.quadrant ?? 'raro_maduro',
        filledAttributesCount: preview?.attributes.estrutura.filledAttributesCount ?? 8,
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { drafts: GapDraftRecord[] }
      setSavedDrafts(data.drafts)
      onDraftsChange?.(data.drafts)
      if (status !== 'copied') {
        setJustSaved(true)
        window.setTimeout(() => setJustSaved(false), 1800)

        let serialNumber = getSerialForGap(selectedGap.id) ?? data.drafts.length
        if (onDiscoverGap) {
          const disc = onDiscoverGap(selectedGap.id)
          setLastDiscovery({ gapId: selectedGap.id, ...disc })
          serialNumber = disc.serialNumber
        } else if (!localDiscoveredIds.includes(selectedGap.id)) {
          setLocalDiscoveredIds((prev) => [...prev, selectedGap.id])
          serialNumber = localDiscoveredIds.length + 1
        }
        if (gapOfTheDay && selectedGap.id === gapOfTheDay.id) {
          onDailyMissionCompleted?.(todayKey)
        }
        if (options?.showCeremony) {
          playTierSChime(soundEnabled)
          setCeremonyData({
            gapTitle: selectedGap.title,
            expectedCount: selectedGap.expectedCount,
            serialNumber,
            rankRoman: cartographerRank?.roman ?? 'I',
            rankTitle: cartographerRank?.title ?? 'Explorador de Campo',
            territoryPct: Math.min(100, Math.max(territoryOccupiedPct, 1)),
            tier: preview?.rarity.tier ?? 'A',
            percentile: preview?.rarity.percentile ?? 85,
            maturityScore: preview?.maturity.score ?? 75,
            filledAttrs: preview?.attributes.estrutura.filledAttributesCount ?? 8,
            donorThumbUrl: donorA?.thumbnailUrl ?? donorB?.thumbnailUrl ?? null,
          })
        }
      }
    }
  }

  const handleSaveDraft = async () => {
    if (!selectedGap || !draftText.trim() || savingDraft) return
    setSavingDraft(true)
    try {
      await persistMissionStage('forged', { showCeremony: true })
    } finally {
      setSavingDraft(false)
    }
  }

  const handleMarkTested = async () => {
    if (!selectedGap || !draftText.trim() || savingDraft) return
    setSavingDraft(true)
    try {
      await persistMissionStage('tested', { showCeremony: true, forceStatus: true })
    } finally {
      setSavingDraft(false)
    }
  }

  const handleCopyPromptAndTrack = () => {
    if (!draftText.trim()) return
    void copyText(draftText, 'gap-synth')
    if (selectedGap) {
      void persistMissionStage('copied').catch(() => null)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/gap-drafts/${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const data = (await res.json()) as { drafts: GapDraftRecord[] }
        setSavedDrafts(data.drafts)
        onDraftsChange?.(data.drafts)
      }
    } catch {
      // ignore
    }
  }

  const handleLoadSavedDraft = (d: GapDraftRecord) => {
    const existing = allKnownGaps.find((g) => g.id === d.gapId)
    if (!existing) {
      const inferredKind = d.gapId.startsWith('gfnt:')
        ? 'global_frontier_zero'
        : d.gapId.startsWith('g3d:')
          ? 'global_3d_zero'
          : d.gapId.startsWith('pgap:')
            ? 'project_2d_zero'
            : 'global_2d_low_lift'
      setAdHocCellGap({
        id: d.gapId,
        kind: inferredKind,
        scope: d.scope,
        axisA: d.axisA,
        tagA: d.tagA,
        freqA: 0,
        axisB: d.axisB,
        tagB: d.tagB,
        freqB: 0,
        axisC: d.axisC,
        tagC: d.tagC,
        observedCount: 0,
        expectedCount: 1,
        lift: 0,
        isCoherent: true,
        donorAId: d.donorAId,
        donorBId: d.donorBId,
        donorCId: d.donorCId ?? null,
        title: d.gapTitle,
        rationale: `Rascunho carregado do Caderno Local (${d.scope}).`,
      })
    } else {
      setAdHocCellGap(null)
    }
    setSelectedGapId(d.gapId)
    setSynthFormat(d.macroFormat)
    setAspectRatio(d.aspectRatio || '3:4')
    if (d.attributeSources) setAttributeSources(d.attributeSources)
    setManuallyEdited(true)
    setDraftText(d.rawPrompt)
    scrollToSynthesisLab()
  }

  useEffect(() => {
    if (!initialDraftToLoad) return
    setIntroOpen(false)
    handleLoadSavedDraft(initialDraftToLoad)
    onConsumedInitialDraft?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftToLoad])

  const handleExportSingle = (kind: 'json' | 'md') => {
    if (!selectedGap || !draftText.trim()) return
    const slug = `${selectedGap.tagA}_${selectedGap.tagB}`.replace(/[^a-z0-9_]+/gi, '-')
    if (kind === 'json') {
      const payload = {
        gap: {
          id: selectedGap.id,
          title: selectedGap.title,
          scope: selectedGap.scope,
          tags: [selectedGap.tagA, selectedGap.tagB, ...(selectedGap.tagC ? [selectedGap.tagC] : [])],
          observedCount: selectedGap.observedCount,
          expectedCount: selectedGap.expectedCount,
        },
        synthesis: {
          format: preview?.attributes.estrutura.macroFormat || synthFormat,
          aspectRatio,
          donorAId: donorA?.id || null,
          donorBId: donorB?.id || null,
          donorCId: donorC?.id || null,
          exploratoryMode,
          preserveIdentity,
          rarity: preview?.rarity || null,
          maturity: preview?.maturity || null,
          rawPrompt: draftText,
        },
      }
      triggerFileDownload(`gap_${slug}.json`, JSON.stringify(payload, null, 2), 'application/json')
    } else {
      const md = [
        `# Gap Brief: ${selectedGap.title}`,
        ``,
        `- **Escopo:** ${selectedGap.scope}`,
        `- **Lacuna:** O=${selectedGap.observedCount} · E=${selectedGap.expectedCount}`,
        `- **Formato:** ${(preview?.attributes.estrutura.macroFormat || synthFormat).toUpperCase()} (${aspectRatio})`,
        `- **Simulação:** ${preview ? `Tier ${preview.rarity.tier} · ${preview.rarity.label} · MAT ${preview.maturity.score}/100` : 'Pendente'}`,
        ``,
        `## Prompt Sintetizado`,
        ``,
        '```',
        draftText,
        '```',
      ].join('\n')
      triggerFileDownload(`gap_${slug}.md`, md, 'text/markdown;charset=utf-8')
    }
  }

  const selectedSerial = selectedGap ? getSerialForGap(selectedGap.id) : null
  const selectedSavedDraft = selectedGap ? savedDraftByGapId.get(selectedGap.id) ?? null : null
  const selectedMissionInfo = selectedGap ? getMissionStageForGap(selectedGap) : null
  const dailyMissionInfo = gapOfTheDay ? getMissionStageForGap(gapOfTheDay) : null
  const modalSerial = vaultModalGap ? getSerialForGap(vaultModalGap.id) : null
  const isSelectedNearMiss =
    selectedGap !== null &&
    selectedGap.observedCount >= 1 &&
    selectedGap.observedCount <= 3 &&
    selectedGap.expectedCount >= 3
  const isDonorAActive = Object.values(attributeSources).includes('donor_a')
  const isDonorBActive = Object.values(attributeSources).includes('donor_b')
  const isDonorCActive = Object.values(attributeSources).includes('donor_c')

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <span className="section-eyebrow">
            Matriz de Co-ocorrência · N={gfCount.toLocaleString('pt-BR')} Google Flow · Corpus{' '}
            {totalCount.toLocaleString('pt-BR')}
          </span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-ink">
            Detector &amp; Laboratório de Gaps Criativos (O = 0)
          </h1>
          <p className="mt-1 text-[13px] text-ink-tertiary">
            Selecione um cruzamento virgem (O = 0), combine dois doadores reais do acervo e sintetize um novo prompt com simulação de raridade ao vivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={matrixScope}
            onChange={(e) => {
              setMatrixScope(e.target.value)
              setAdHocCellGap(null)
            }}
            className="rounded-xl border border-hairline bg-canvas px-3 py-2 text-[12px] text-ink focus:border-border-hover focus:outline-none"
            aria-label="Escopo da matriz"
          >
            {availableScopes.map((sc) => (
              <option key={sc} value={sc}>
                {sc === 'all'
                  ? `Acervo Global (${gfCount.toLocaleString('pt-BR')} · Matriz)`
                  : `Projeto: ${sc}`}
              </option>
            ))}
          </select>

          <select
            value={axisPairKey}
            onChange={(e) => setAxisPairKey(e.target.value)}
            className="rounded-xl border border-hairline bg-canvas px-3 py-2 text-[12px] text-ink focus:border-border-hover focus:outline-none"
            aria-label="Eixos da matriz"
          >
            {availableAxisPairs.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Gap do Dia — Quadro de Missões & Bounties */}
      {gapOfTheDay ? (
        <DailyGapMissionBanner
          gap={gapOfTheDay}
          serialNumber={getSerialForGap(gapOfTheDay.id)}
          missionStatus={dailyMissionInfo?.stage ?? 'idle'}
          testedImagesCount={dailyMissionInfo?.testedBridge?.count ?? 0}
          isActiveInLab={selectedGap?.id === gapOfTheDay.id}
          itemMap={itemMap}
          onExecuteMission={() =>
            selectAndRevealGap(gapOfTheDay, {
              syncScopeAndList: true,
              scrollToLab: true,
            })
          }
          onInspectItem={onInspectItem}
          onDateRollover={setTodayKey}
          bountyProgress={{
            exploredCount: exploredPromptsCount,
            discoveredGapsCount: Math.max(discoveredGapIds.length, localDiscoveredIds.length),
            curatedCount: favoritesCount + savedDrafts.length + testedBridges.length,
          }}
        />
      ) : null}

      {/* Matriz 2D de Co-ocorrência */}
      {activeMatrix ? (
        <section className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="section-eyebrow">
                Matriz 2D · {activeMatrix.axisALabel} × {activeMatrix.axisBLabel} (
                {activeMatrix.scope === 'all' ? 'Global' : activeMatrix.scope} · N=
                {activeMatrix.totalPrompts.toLocaleString('pt-BR')})
              </span>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Pergunta respondida: quais cruzamentos entre ingredientes frequentes ainda têm{' '}
                <span className="font-mono text-ink-secondary">0</span> ocorrências?
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-ink-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-tier-s/60 bg-tier-s/10" />
                Gap (O=0, plausível)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-tier-a/60 bg-tier-a/10" />
                Quase-virgem (O=1–3)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-hairline bg-white/[0.09]" />
                Saturado
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed border-separate border-spacing-1 text-left">
              <thead>
                <tr>
                  <th className="w-[176px] px-1.5 py-1 font-mono text-[10px] font-normal text-ink-muted">
                    {activeMatrix.axisALabel} \ {activeMatrix.axisBLabel}
                  </th>
                  {activeMatrix.cols.map((col) => (
                    <th
                      key={col}
                      className="px-1.5 py-1 font-mono text-[10px] font-normal text-ink-tertiary"
                      aria-label={`${formatTagPt(col)} (${col})`}
                    >
                      <div className="truncate">{formatTagPt(col)}</div>
                      <div className="text-[9px] text-ink-muted">
                        ({activeMatrix.colTotals[col] || 0})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeMatrix.rows.map((row) => (
                  <tr key={row}>
                    <td
                      className="max-w-[176px] overflow-hidden px-1.5 py-1 font-mono text-[10px] text-ink-secondary"
                      aria-label={`${formatTagPt(row)} (${activeMatrix.rowTotals[row] || 0})`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">{formatTagPt(row)}</span>
                        <span className="shrink-0 text-ink-muted">
                          ({activeMatrix.rowTotals[row] || 0})
                        </span>
                      </div>
                    </td>
                    {activeMatrix.cols.map((col) => {
                      const cell = activeMatrix.cells.find((c) => c.row === row && c.col === col)
                      if (!cell) return <td key={col} />
                      const intensity =
                        cell.observed > 0
                          ? Math.min(0.24, 0.03 + (cell.observed / activeMatrixMaxObs) * 0.21)
                          : 0
                      const isNearMiss =
                        !cell.isGap &&
                        cell.observed >= 1 &&
                        cell.observed <= 3 &&
                        cell.expected >= 3
                      const isClickable = cell.isGap || isNearMiss || cell.lift < 0.4
                      const matchingGapId =
                        activeMatrix.scope !== 'all'
                          ? `pgap:${activeMatrix.scope}:${activeMatrix.axisA}:${row}:${activeMatrix.axisB}:${col}`
                          : `g2d:${activeMatrix.axisA}:${row}:${activeMatrix.axisB}:${col}`
                      const isSelectedCell = selectedGap?.id === matchingGapId

                      return (
                        <td key={col}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isClickable) return
                              const knownHit = allKnownGaps.find((g) => g.id === matchingGapId)
                              const freqA = activeMatrix.rowTotals[row] || 0
                              const freqB = activeMatrix.colTotals[col] || 0
                              const scopeLabel =
                                activeMatrix.scope === 'all'
                                  ? `Google Flow (${gfCount.toLocaleString('pt-BR')})`
                                  : activeMatrix.scope
                              const cellGap: GapRecord = knownHit || {
                                id: matchingGapId,
                                kind:
                                  activeMatrix.scope !== 'all' && cell.observed === 0
                                    ? 'project_2d_zero'
                                    : 'global_2d_low_lift',
                                scope: scopeLabel,
                                axisA: activeMatrix.axisA,
                                tagA: row,
                                freqA,
                                axisB: activeMatrix.axisB,
                                tagB: col,
                                freqB,
                                observedCount: cell.observed,
                                expectedCount: cell.expected,
                                lift: cell.lift,
                                isCoherent: cell.isCoherent,
                                donorAId: null,
                                donorBId: null,
                                title: `${formatTagPt(row)} × ${formatTagPt(col)}`,
                                rationale:
                                  cell.observed === 0
                                    ? `Em '${scopeLabel}' (N=${activeMatrix.totalPrompts.toLocaleString('pt-BR')}), '${formatTagPt(row)}' (${freqA}×) e '${formatTagPt(col)}' (${freqB}×) ainda têm O=0 (E=${cell.expected}).`
                                    : isNearMiss
                                      ? `Território quase-virgem em '${scopeLabel}': observado apenas ${cell.observed}× vs. ${cell.expected}× esperado (Lift ${cell.lift}×).`
                                      : `Subexplorado em '${scopeLabel}': observado ${cell.observed}× vs. ${cell.expected}× esperado (Lift ${cell.lift}×).`,
                              }
                              selectAndRevealGap(cellGap, { openVaultModal: cell.isGap })
                            }}
                            style={
                              !cell.isGap && !isNearMiss && cell.observed > 0
                                ? { backgroundColor: matrixCellBg(intensity) }
                                : undefined
                            }
                            className={[
                              'flex w-full flex-col items-start rounded-lg px-1.5 py-1 font-mono text-[10px] transition-colors',
                              cell.isGap
                                ? 'border border-dashed border-tier-s/60 bg-tier-s/[0.07] text-tier-s cursor-pointer hover:border-tier-s'
                                : isNearMiss
                                  ? 'border border-dashed border-tier-a/60 bg-tier-a/[0.07] text-tier-a cursor-pointer hover:border-tier-a'
                                  : cell.observed === 0
                                    ? `border border-border-subtle bg-canvas text-ink-muted${isClickable ? ' cursor-pointer hover:border-border-hover' : ''}`
                                    : `border border-border-subtle text-ink${isClickable ? ' cursor-pointer hover:border-border-hover' : ''}`,
                              isSelectedCell ? 'ring-1 ring-border-strong' : '',
                            ].join(' ')}
                            aria-label={`${formatTagPt(row)} × ${formatTagPt(col)}: O=${cell.observed}, E=${cell.expected}, Lift=${cell.lift}`}
                          >
                            <span>
                              {cell.isGap ? 'O=0' : isNearMiss ? `O=${cell.observed}` : cell.observed}
                            </span>
                            <span className="text-[9px] opacity-65">E={cell.expected}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Lista Ranqueada + Laboratório de Síntese Gap-to-Prompt */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4 sm:p-5 lg:sticky lg:top-[72px] lg:col-span-5 lg:max-h-[calc(100dvh-96px)]">
          <div className="flex items-baseline justify-between gap-2 border-b border-hairline pb-3">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-ink">
                GAPs Missions
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Escolha um cruzamento para iniciar uma nova criação.
              </p>
            </div>
            <span className="tabular-mono shrink-0 rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[10px] text-ink-tertiary">
              {rankedGaps.length} missões
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                {
                  id: 'global_frontier_zero',
                  label: 'Fronteiras Inéditas (O = 0)',
                  count: creativeFrontierGaps.length,
                },
                {
                  id: 'global_3d_zero',
                  label: 'Multi-Eixo Global (O = 0)',
                  count: gapsData.globalTriadGaps.length,
                },
                {
                  id: 'project_2d_zero',
                  label: 'Por Projeto (O = 0)',
                  count: gapsData.projectGaps.length,
                },
                {
                  id: 'global_2d_low_lift',
                  label: 'Subexplorados (Lift < 0.36)',
                  count: gapsData.globalUnderexplored.length,
                },
                {
                  id: 'completed',
                  label: 'Cumpridas / Testadas',
                  count: completedGaps.length,
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setListMode(m.id)
                  setSelectedGapId(null)
                  setAdHocCellGap(null)
                }}
                className={[
                  'press-scale rounded-xl border px-2.5 py-1.5 text-[11px] transition-[border-color,background-color,transform] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] cursor-pointer',
                  listMode === m.id
                    ? 'border-border-hover bg-elevated font-medium text-ink'
                    : 'border-hairline bg-canvas text-ink-tertiary hover:border-border-hover',
                ].join(' ')}
              >
                {m.label} <span className="tabular-mono text-ink-muted">({m.count})</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rankedGaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-canvas p-6 text-center">
                <span className="font-mono text-[11px] text-ink-secondary">
                  {listMode === 'completed'
                    ? 'Nenhuma missão cumprida ou testada ainda.'
                    : 'Nenhuma lacuna encontrada nesta categoria/escopo.'}
                </span>
                <p className="text-[11px] text-ink-muted">
                  {listMode === 'completed'
                    ? 'Copie um prompt sintetizado, forje uma carta ou sincronize imagens geradas no Eagle para acompanhar suas missões aqui.'
                    : 'Troque o filtro de escopo ou explore a aba Fronteiras Inéditas.'}
                </p>
              </div>
            ) : (
              rankedGaps.map((g) => {
                const isSel = selectedGap?.id === g.id
                const listSerial = getSerialForGap(g.id)
                const missionInfo = getMissionStageForGap(g)
                const stage = missionInfo.stage
                const testedBridge = missionInfo.testedBridge
                const isMapped = stage !== 'idle'
                const isNearMissItem = g.observedCount >= 1 && g.observedCount <= 3
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectAndRevealGap(g)}
                    className={[
                      'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                      stage === 'tested'
                        ? isSel
                          ? 'border-success/55 bg-elevated'
                          : 'border-success/25 bg-canvas hover:border-success/45'
                        : isMapped
                          ? isSel
                            ? 'border-tier-s/45 bg-elevated'
                            : 'border-hairline bg-canvas opacity-85 hover:border-border-hover'
                          : isSel
                            ? 'border-tier-s/60 bg-elevated'
                            : 'border-hairline bg-canvas hover:border-border-hover',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">
                        {formatTagPt(g.tagA)} × {formatTagPt(g.tagB)}
                        {g.tagC ? ` × ${formatTagPt(g.tagC)}` : ''}
                      </span>
                      <span
                        className={[
                          'tabular-mono shrink-0 text-[10px]',
                          stage === 'tested' ? 'text-success' : 'text-tier-s',
                        ].join(' ')}
                      >
                        O={g.observedCount} · E={g.expectedCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-muted">
                      <span className="flex flex-wrap items-center gap-1.5 truncate">
                        <span>{g.scope}</span>
                        {g.isFrontier ? (
                          <span className="rounded border border-tier-s/30 bg-tier-s/[0.06] px-1.5 py-0.5 text-[9px] text-tier-s">
                            Fronteira
                          </span>
                        ) : null}
                        {stage === 'tested' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            <span>
                              {testedBridge
                                ? `Testada · ${testedBridge.count} ${testedBridge.count === 1 ? 'img' : 'imgs'}`
                                : 'Testada'}
                            </span>
                          </span>
                        ) : stage === 'forged' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-tier-s/35 bg-tier-s/[0.08] px-1.5 py-0.5 text-[9px] text-tier-s">
                            <Check className="h-2.5 w-2.5" />
                            <span>
                              Forjada{listSerial !== null ? ` · ${formatGapSerial(listSerial)}` : ''}
                            </span>
                          </span>
                        ) : stage === 'copied' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-tier-a/40 bg-tier-a/[0.08] px-1.5 py-0.5 text-[9px] text-tier-a">
                            <Clock className="h-2.5 w-2.5" />
                            <span>Em teste</span>
                          </span>
                        ) : listSerial !== null ? (
                          <span className="text-tier-s/85">{formatGapSerial(listSerial)}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0">
                        {g.freqA}× · {g.freqB}×{g.freqC ? ` · ${g.freqC}×` : ''}
                      </span>
                    </div>
                    {isNearMissItem ? (
                      <div className="font-mono text-[10px] text-tier-a/90">
                        a {g.observedCount}{' '}
                        {g.observedCount === 1 ? 'ocorrência' : 'ocorrências'} de ser virgem
                      </div>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* Altar de Fusão & Síntese de Cartas */}
        <section
          ref={synthesisSectionRef}
          className="flex flex-col gap-5 rounded-2xl border border-hairline bg-surface p-4 sm:p-5 lg:col-span-7"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
            <div>
              <span className="section-eyebrow text-tier-s">Card Fusion Altar · Síntese O = 0</span>
              <h2 className="mt-0.5 text-[16px] font-semibold tracking-tight text-ink">
                Altar de Fusão &amp; Forja de Cartas
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-tertiary">
                Combine duas cartas doadoras pelo núcleo de 6 atributos para revelar uma carta inédita.
              </p>
            </div>
            {preview ? (
              <span
                className={[
                  'tabular-mono rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
                  TIER_COLOR_META[preview.rarity.tier].badgeClass,
                ].join(' ')}
              >
                RESULTADO PREVISTO: TIER {preview.rarity.tier} · P{preview.rarity.percentile}
              </span>
            ) : null}
          </div>

          {!selectedGap ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="tabular-mono rounded-full border border-hairline bg-white/[0.04] px-2.5 py-0.5 text-[10px] tracking-wider text-ink-secondary">
                EXPLORAÇÃO LIVRE
              </span>
              <p className="text-[13px] text-ink-muted">
                Selecione um cruzamento na lista ou na matriz para abrir o briefing.
              </p>
            </div>
          ) : (
            <>
              {/* Bloco 1: BRIEFING + Selo de Estado do Ciclo */}
              <div
                key={`${selectedGap.id}:${revealNonce}`}
                className={[
                  'space-y-3 border-b border-hairline pb-4',
                  selectedGap.observedCount === 0 ? 'gap-vault-enter' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="section-eyebrow tracking-[0.16em]">
                      BRIEFING · {selectedGap.scope}
                    </span>
                    {selectedMissionInfo?.stage === 'tested' ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-success/50 bg-success/12 px-2 py-0.5 text-[9px] font-medium tracking-wider text-success">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>
                          {selectedMissionInfo.testedBridge
                            ? `TESTADA NO EAGLE · ${selectedMissionInfo.testedBridge.count} ${selectedMissionInfo.testedBridge.count === 1 ? 'IMG' : 'IMGS'}`
                            : 'MISSÃO CUMPRIDA · TESTADA'}
                        </span>
                      </span>
                    ) : selectedMissionInfo?.stage === 'forged' ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-s/60 bg-tier-s/12 px-2 py-0.5 text-[9px] font-medium tracking-wider text-tier-s">
                        <Check className="h-2.5 w-2.5" />
                        <span>
                          FORJADA · Gap {formatGapSerial(selectedSerial ?? 1)}
                          {selectedSavedDraft?.createdAt
                            ? ` · ${formatShortTimestamp(selectedSavedDraft.createdAt)}`
                            : ''}
                        </span>
                      </span>
                    ) : selectedMissionInfo?.stage === 'copied' ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-a/55 bg-tier-a/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-tier-a">
                        <Clock className="h-2.5 w-2.5" />
                        <span>EM TESTE (PROMPT COPIADO)</span>
                      </span>
                    ) : (
                      <span className="tabular-mono rounded-full border border-hairline bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium tracking-wider text-ink-secondary">
                        EM MAPEAMENTO
                      </span>
                    )}
                    {selectedGap.isFrontier ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-s/55 bg-tier-s/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-tier-s">
                        <FlaskConical className="h-2.5 w-2.5" />
                        <span>FRONTEIRA INÉDITA</span>
                      </span>
                    ) : null}
                    {selectedGap.observedCount === 0 ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-s/60 bg-tier-s/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-tier-s">
                        <Compass className="h-2.5 w-2.5" />
                        TERRITÓRIO VIRGEM
                      </span>
                    ) : isSelectedNearMiss ? (
                      <span className="tabular-mono rounded-full border border-tier-a/60 bg-tier-a/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-tier-a">
                        QUASE-VIRGEM
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-medium tracking-tight text-ink">
                      {formatTagPt(selectedGap.tagA)} × {formatTagPt(selectedGap.tagB)}
                      {selectedGap.tagC ? ` × ${formatTagPt(selectedGap.tagC)}` : ''}
                    </h2>
                    <p className="mt-1 text-[12px] text-ink-tertiary">{selectedGap.rationale}</p>
                    {selectedGap.observedCount >= 1 && selectedGap.observedCount <= 3 ? (
                      <p className="mt-1 font-mono text-[11px] text-tier-a">
                        a {selectedGap.observedCount}{' '}
                        {selectedGap.observedCount === 1 ? 'ocorrência' : 'ocorrências'} de ser virgem
                      </p>
                    ) : null}
                  </div>

                  {/* E-score grande como indicador empírico de dificuldade/potencial */}
                  <div className="shrink-0 rounded-xl border border-tier-s/35 bg-tier-s/[0.06] px-3.5 py-2 text-right">
                    <div className="tabular-mono text-[9px] uppercase tracking-[0.14em] text-tier-s/80">
                      O={selectedGap.observedCount} · E-Score
                    </div>
                    <div className="tabular-mono text-2xl font-medium leading-tight text-tier-s">
                      {selectedGap.observedCount === 0 ? (
                        <AnimatedExpectedScore target={selectedGap.expectedCount} />
                      ) : (
                        selectedGap.expectedCount
                      )}
                    </div>
                  </div>
                </div>

                {/* Ingredientes alvo */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-hairline bg-canvas p-2.5">
                    <div className="section-eyebrow">{axisNamePt(selectedGap.axisA)}</div>
                    <div className="mt-1 text-[12px] font-medium text-ink">
                      {formatTagPt(selectedGap.tagA)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                      {selectedGap.freqA} ocorrências
                    </div>
                  </div>
                  <div className="rounded-xl border border-hairline bg-canvas p-2.5">
                    <div className="section-eyebrow">{axisNamePt(selectedGap.axisB)}</div>
                    <div className="mt-1 text-[12px] font-medium text-ink">
                      {formatTagPt(selectedGap.tagB)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                      {selectedGap.freqB} ocorrências
                    </div>
                  </div>
                  {selectedGap.axisC && selectedGap.tagC ? (
                    <div className="rounded-xl border border-hairline bg-canvas p-2.5">
                      <div className="section-eyebrow">{axisNamePt(selectedGap.axisC)}</div>
                      <div className="mt-1 text-[12px] font-medium text-ink">
                        {formatTagPt(selectedGap.tagC)}
                      </div>
                      <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                        {selectedGap.freqC} ocorrências
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedMissionInfo?.testedBridge && selectedMissionInfo.testedBridge.items.length > 0 ? (
                  <div className="rounded-xl border border-success/35 bg-success/[0.06] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-success">
                        Resultados já gerados no Eagle ({selectedMissionInfo.testedBridge.count}{' '}
                        {selectedMissionInfo.testedBridge.count === 1 ? 'imagem' : 'imagens'})
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted">
                        Projetos: {selectedMissionInfo.testedBridge.projects.join(', ')}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {selectedMissionInfo.testedBridge.items.slice(0, 8).map((thumb) => (
                        <button
                          key={thumb.id}
                          type="button"
                          onClick={() => onInspectPromptById?.(thumb.id)}
                          title={`${thumb.title} (${thumb.project}) — clique para inspecionar`}
                          className="relative h-16 w-14 overflow-hidden rounded-lg border border-success/35 bg-elevated transition-[border-color,transform] hover:border-success cursor-pointer"
                        >
                          <PromptThumb
                            src={thumb.thumbnailUrl}
                            alt={thumb.title}
                            loading="lazy"
                            fallbackLabel={thumb.project}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bloco 2: PONTE CRIATIVA — 2 cards grandes com raio central de combinação */}
              <div className="space-y-3 border-b border-hairline pb-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow tracking-[0.16em]">
                    PONTE CRIATIVA · DOADORES DO ACERVO
                  </span>
                  {loadingDonors ? (
                    <span className="tabular-mono text-[10px] text-ink-muted">
                      Consultando SQLite FTS5...
                    </span>
                  ) : (
                    <span className="tabular-mono text-[10px] text-ink-muted">
                      Combine os componentes (E={selectedGap.expectedCount})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3.5">
                  {(
                    [
                      {
                        key: 'a' as const,
                        role: 'DOADOR A',
                        axisLabel: axisNamePt(selectedGap.axisA).toUpperCase(),
                        tagLabel: formatTagPt(selectedGap.tagA),
                        freq: selectedGap.freqA,
                        item: donorA,
                        idx: donorAIdx,
                        total: donorsListA.length,
                        isActiveSource: isDonorAActive,
                        onCycle: () => {
                          setDonorAIdx((i) => i + 1)
                          setManuallyEdited(false)
                        },
                      },
                      {
                        key: 'b' as const,
                        role: 'DOADOR B',
                        axisLabel: axisNamePt(selectedGap.axisB).toUpperCase(),
                        tagLabel: formatTagPt(selectedGap.tagB),
                        freq: selectedGap.freqB,
                        item: donorB,
                        idx: donorBIdx,
                        total: donorsListB.length,
                        isActiveSource: isDonorBActive,
                        onCycle: () => {
                          setDonorBIdx((i) => i + 1)
                          setManuallyEdited(false)
                        },
                      },
                    ] as const
                  ).map(
                    (
                      {
                        key,
                        role,
                        axisLabel,
                        tagLabel,
                        freq,
                        item,
                        idx,
                        total,
                        isActiveSource,
                        onCycle,
                      },
                      cardIndex
                    ) => {
                      const itemTierMeta = item ? TIER_COLOR_META[item.rarity.tier] : null
                      return (
                        <React.Fragment key={role}>
                          {cardIndex === 1 ? (
                            <div className="flex flex-col items-center justify-center gap-1 py-1 sm:px-0.5">
                              <button
                                type="button"
                                onClick={handleRegenerateBase}
                                aria-label="Combinar componentes dos dois doadores"
                                className="press-scale flex h-11 w-11 items-center justify-center rounded-full border border-tier-s/60 bg-surface text-tier-s shadow-md transition-[border-color,background-color,transform] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] hover:border-tier-s hover:bg-tier-s/10 cursor-pointer"
                              >
                                <Zap className="h-5 w-5 fill-tier-s/20" />
                              </button>
                              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-tier-s/80">
                                fundir
                              </span>
                            </div>
                          ) : null}

                          <div
                            className={[
                              'flex flex-col overflow-hidden rounded-2xl border bg-canvas transition-[border-color] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]',
                              isActiveSource
                                ? 'border-tier-s/60 ring-1 ring-tier-s/35'
                                : 'border-hairline',
                            ].join(' ')}
                          >
                            {/* Imagem grande em 4:5 com badges e ação de troca */}
                            <div className="relative aspect-[4/5] w-full overflow-hidden bg-elevated">
                              <PromptThumb
                                src={item?.thumbnailUrl}
                                alt={item?.title ?? role}
                                loading="eager"
                                fallbackLabel="Sem imagem"
                              />

                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent"
                              />
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                              />

                              <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
                                <span className="tabular-mono truncate rounded-full border border-border-hover bg-canvas/90 px-2 py-0.5 text-[9px] font-medium tracking-[0.12em] text-ink">
                                  {role} · {axisLabel}
                                </span>
                                {total > 0 ? (
                                  <span className="tabular-mono shrink-0 rounded-full border border-hairline bg-canvas/90 px-2 py-0.5 text-[9px] text-ink-secondary">
                                    {(idx % total) + 1}/{total}
                                  </span>
                                ) : null}
                              </div>

                              <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-mono text-[10px] font-medium text-tier-s">
                                    {tagLabel}
                                  </div>
                                  <div className="tabular-mono text-[9px] text-ink-secondary/80">
                                    {freq} ocorrências
                                  </div>
                                </div>

                                {total > 1 ? (
                                  <button
                                    type="button"
                                    onClick={onCycle}
                                    aria-label="Alternar para outro prompt com este ingrediente"
                                    className="btn-secondary min-h-[28px] shrink-0 rounded-lg border-border-hover bg-canvas/90 px-2.5 py-1 text-[10px] text-ink hover:border-border-strong hover:bg-surface"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                    <span>Trocar</span>
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {/* Metadados + ação de inspeção */}
                            <div className="flex flex-col gap-2.5 p-3">
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-medium text-ink">
                                  {item ? item.title : 'Sem doador disponível'}
                                </div>

                                {item && itemTierMeta ? (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                                    <span
                                      className={[
                                        'rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                                        itemTierMeta.badgeClass,
                                      ].join(' ')}
                                    >
                                      TIER {item.rarity.tier}
                                    </span>
                                    <span className="truncate text-ink-muted">
                                      {item.project} · MAT {Math.round(item.maturity.score)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              <button
                                key={`inspect-${key}`}
                                type="button"
                                disabled={!item}
                                onClick={() => item && onInspectItem(item)}
                                className="btn-secondary min-h-[32px] w-full justify-center px-2.5 text-[11px]"
                              >
                                <Maximize2 className="h-3 w-3" />
                                <span>Ver 8 atributos</span>
                              </button>
                            </div>
                          </div>
                        </React.Fragment>
                      )
                    }
                  )}
                </div>

                {selectedGap.axisC && selectedGap.tagC ? (
                  <div
                    className={[
                      'flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-canvas p-3 transition-[border-color]',
                      isDonorCActive
                        ? 'border-tier-s/60 ring-1 ring-tier-s/35'
                        : 'border-hairline',
                    ].join(' ')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-elevated">
                        <PromptThumb
                          src={donorC?.thumbnailUrl}
                          alt={donorC?.title ?? 'DOADOR C'}
                          loading="lazy"
                          fallbackLabel="Sem img"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]">
                          <span className="rounded-full border border-border-hover bg-elevated px-2 py-0.5 text-ink">
                            DOADOR C · {axisNamePt(selectedGap.axisC)}
                          </span>
                          <span className="text-tier-s">{formatTagPt(selectedGap.tagC)}</span>
                          {donorsListC.length > 0 ? (
                            <span className="text-ink-muted">
                              {(donorCIdx % donorsListC.length) + 1}/{donorsListC.length}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[12px] font-medium text-ink">
                          {donorC ? donorC.title : 'Sem doador C disponível'}
                        </div>
                        {donorC ? (
                          <div className="mt-0.5 truncate font-mono text-[10px] text-ink-muted">
                            {donorC.project} · TIER {donorC.rarity.tier} · MAT {Math.round(donorC.maturity.score)} · {selectedGap.freqC ?? 0} ocorrências
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {donorsListC.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDonorCIdx((i) => i + 1)
                            setManuallyEdited(false)
                          }}
                          className="btn-secondary min-h-[30px] px-2.5 text-[10px]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Trocar C</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={!donorC}
                        onClick={() => donorC && onInspectItem(donorC)}
                        className="btn-secondary min-h-[30px] px-2.5 text-[10px]"
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>Ver 8 atributos</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bloco 3: REGISTRO — Sintetizador Gap-to-Prompt + Telemetria Ao Vivo */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="section-eyebrow tracking-[0.16em]">
                      REGISTRO · SÍNTESE ASSISTIDA
                    </span>
                    <p className="text-[11px] text-ink-muted">
                      Monta os 8 atributos cruzando os doadores e injeta a combinação O = 0.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {FORMAT_TABS.map((fmt) => {
                      const active = synthFormat === fmt.id
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          data-active={active}
                          onClick={() => {
                            setSynthFormat(fmt.id)
                            setManuallyEdited(false)
                          }}
                          className="btn-ghost font-mono text-[10px]"
                        >
                          {fmt.label}
                        </button>
                      )
                    })}

                    <select
                      value={aspectRatio}
                      onChange={(e) => {
                        setAspectRatio(e.target.value)
                        setManuallyEdited(false)
                      }}
                      className="rounded-xl border border-hairline bg-canvas px-2 py-1 font-mono text-[10px] text-ink-secondary focus:outline-none"
                      aria-label="Proporção"
                    >
                      {ASPECT_OPTIONS.map((ar) => (
                        <option key={ar} value={ar}>
                          AR {ar}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-canvas px-2 py-1 font-mono text-[10px] text-ink-tertiary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNegative}
                        onChange={(e) => {
                          setIncludeNegative(e.target.checked)
                          setManuallyEdited(false)
                        }}
                        className="accent-tier-s"
                      />
                      <span>Negativo</span>
                    </label>

                    <label
                      className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-canvas px-2 py-1 font-mono text-[10px] text-ink-tertiary cursor-pointer"
                      title="Enxuga boilerplate repetitivo e mistura apenas a essência dos doadores + fronteira criativa"
                    >
                      <input
                        type="checkbox"
                        checked={exploratoryMode}
                        onChange={(e) => {
                          setExploratoryMode(e.target.checked)
                          setManuallyEdited(false)
                        }}
                        className="accent-tier-s"
                      />
                      <span>Exploratório</span>
                    </label>

                    <label
                      className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-canvas px-2 py-1 font-mono text-[10px] text-ink-tertiary cursor-pointer"
                      title="Mantém cláusulas de IDENTITY LOCK / preservação facial do Doador A"
                    >
                      <input
                        type="checkbox"
                        checked={preserveIdentity}
                        onChange={(e) => {
                          setPreserveIdentity(e.target.checked)
                          setManuallyEdited(false)
                        }}
                        className="accent-tier-s"
                      />
                      <span>Identidade (A)</span>
                    </label>
                  </div>
                </div>

                {/* Matriz de origem dos 6 atributos principais */}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CORE_ATTR_SLOTS.map((slot) => {
                    const isGapAxis = targetSlotsMap.has(slot.key)
                    const currentSource = attributeSources[slot.key]
                    const hasDonorC = Boolean(selectedGap.axisC && selectedGap.tagC)
                    const slotOptions = hasDonorC
                      ? ([
                          { id: 'donor_a', label: 'A' },
                          { id: 'gap_target', label: 'Gap' },
                          { id: 'donor_b', label: 'B' },
                          { id: 'donor_c', label: 'C' },
                        ] as const)
                      : ([
                          { id: 'donor_a', label: 'A' },
                          { id: 'gap_target', label: 'Gap' },
                          { id: 'donor_b', label: 'B' },
                        ] as const)
                    return (
                      <div
                        key={slot.key}
                        className={[
                          'flex flex-col gap-1.5 rounded-xl border p-2',
                          isGapAxis
                            ? 'border-dashed border-tier-s/35 bg-tier-s/[0.04]'
                            : 'border-hairline bg-canvas',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-medium text-ink-secondary">
                            {slot.short} · {slot.label}
                          </span>
                          {isGapAxis ? (
                            <span className="font-mono text-[9px] text-tier-s">ALVO</span>
                          ) : null}
                        </div>
                        <div className={hasDonorC ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-3 gap-1'}>
                          {slotOptions.map((opt) => {
                            const active = currentSource === opt.id
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setAttributeSources((prev) => ({ ...prev, [slot.key]: opt.id }))
                                  setManuallyEdited(false)
                                }}
                                className={[
                                  'rounded-md border py-0.5 font-mono text-[9px] transition-colors cursor-pointer',
                                  active
                                    ? 'border-border-hover bg-elevated text-ink'
                                    : 'border-hairline bg-canvas text-ink-muted hover:text-ink-secondary',
                                ].join(' ')}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Editor editável do Prompt Sintetizado */}
                <div className="relative">
                  <textarea
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value)
                      setManuallyEdited(true)
                    }}
                    rows={synthFormat === 'json' ? 12 : 9}
                    spellCheck={false}
                    aria-label="Prompt sintetizado do Gap"
                    className="w-full rounded-2xl border border-hairline bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink focus:border-border-hover focus:outline-none"
                  />
                  {manuallyEdited ? (
                    <span className="pointer-events-none absolute top-2.5 right-3 rounded-md border border-hairline bg-elevated px-2 py-0.5 font-mono text-[9px] text-ink-tertiary">
                      editado manualmente
                    </span>
                  ) : null}
                </div>

                {/* Carta Sintetizada Preview & Telemetria Ao Vivo */}
                <div className="rounded-2xl border border-hairline bg-canvas p-3.5 font-mono text-[11px]">
                  {preview ? (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
                              TIER_COLOR_META[preview.rarity.tier].badgeClass,
                            ].join(' ')}
                          >
                            CARTA TIER {preview.rarity.tier}
                          </span>
                          <span className={TIER_COLOR_META[preview.rarity.tier].textClass}>
                            {preview.rarity.label}
                          </span>
                          <span className="text-ink-muted">·</span>
                          <span className="text-ink">MAT {Math.round(preview.maturity.score)}/100</span>
                          <span className="text-ink-muted">
                            ({QUADRANT_META[preview.quadrant].label})
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="text-ink-tertiary">
                            {preview.attributes.estrutura.filledAttributesCount}/8 atr.
                          </span>
                          <span className="text-ink-tertiary">
                            {preview.attributes.estrutura.tokenCount} tok
                          </span>
                          <span
                            className={
                              preview.exactGapOccurrences === 0
                                ? 'text-tier-s'
                                : 'text-ink-tertiary'
                            }
                            title={
                              preview.exactGapOccurrences === 0
                                ? '0 ocorrências reais encontradas via SQLite FTS5 em todo o corpus'
                                : `${preview.exactGapOccurrences} prompts no corpus já combinam essas tags no FTS5`
                            }
                          >
                            {preview.exactGapOccurrences === 0
                              ? 'O = 0 real (FTS5)'
                              : `O = ${preview.exactGapOccurrences} no acervo (FTS5)`}
                          </span>
                        </div>
                      </div>

                      {/* 8-Attribute Stat Pips da Carta Resultante */}
                      <div className="grid grid-cols-8 gap-1">
                        {ATTRIBUTE_META.map((attr) => {
                          const filled = preview.attributes[attr.key].filled
                          return (
                            <div key={attr.key} className="flex flex-col items-center gap-1">
                              <span
                                className={['h-1 w-full rounded-full', filled ? '' : 'bg-hairline'].join(' ')}
                                style={
                                  filled
                                    ? { backgroundColor: TIER_COLOR_META[preview.rarity.tier].barColor }
                                    : undefined
                                }
                              />
                              <span className="text-[9px] text-ink-muted">{attr.shortLabel}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-ink-muted">
                      {previewLoading
                        ? 'Calculando raridade e decomposição em 8 atributos da carta...'
                        : 'Aguardando síntese para simular carta.'}
                    </span>
                  )}
                </div>

                {/* Botões de ação */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRegenerateBase}
                      className="btn-ghost text-[11px]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Regenerar base</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyPromptAndTrack}
                      className="btn-secondary text-[11px]"
                    >
                      {copiedKey === 'gap-synth' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedKey === 'gap-synth' ? 'Copiado · Em teste' : 'Copiar prompt'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportSingle('md')}
                      className="btn-secondary font-mono text-[10px]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Exportar .MD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingle('json')}
                      className="btn-secondary font-mono text-[10px]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Exportar .JSON</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingDraft || !draftText.trim() || selectedMissionInfo?.stage === 'tested'}
                      onClick={() => void handleMarkTested()}
                      className={[
                        'btn-secondary text-[11px]',
                        selectedMissionInfo?.stage === 'tested'
                          ? 'border-success/50 text-success'
                          : '',
                      ].join(' ')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        {selectedMissionInfo?.stage === 'tested'
                          ? 'Missão Testada'
                          : 'Marcar Testada'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={savingDraft || !draftText.trim()}
                      onClick={() => void handleSaveDraft()}
                      className="btn-primary text-[12px]"
                    >
                      {justSaved ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>
                        {savingDraft
                          ? 'Forjando Carta...'
                          : justSaved
                            ? 'Carta Revelada & Salva'
                            : 'Forjar & Revelar Carta'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Caderno Local de Exploração de Gaps (data/gap_drafts.json) */}
      <section className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <span className="section-eyebrow">
              Caderno Local de Gaps ({savedDrafts.length})
            </span>
            <p className="mt-0.5 text-[12px] text-ink-tertiary">
              Rascunhos salvos localmente em{' '}
              <span className="font-mono text-ink-secondary">data/gap_drafts.json</span>: bibliotecas originais seguem em modo Read-Only.
            </p>
          </div>

          {savedDrafts.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                triggerFileDownload(
                  'caderno_gaps_prompt_engine.json',
                  JSON.stringify(savedDrafts, null, 2),
                  'application/json'
                )
              }
              className="btn-secondary font-mono text-[11px]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar caderno (.JSON)</span>
            </button>
          ) : null}
        </div>

        {savedDrafts.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-ink-muted">
            Nenhum rascunho salvo no Caderno.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedDrafts.map((d) => {
              const tierMeta = TIER_COLOR_META[d.rarityTier] || TIER_COLOR_META.C
              return (
                <article
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-hairline bg-canvas p-3.5"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-ink">
                          {d.gapTitle}
                        </div>
                        <div className="tabular-mono text-[10px] text-ink-muted">
                          {d.scope} · {d.macroFormat.toUpperCase()} · {d.aspectRatio}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={[
                            'tabular-mono shrink-0 rounded-full border px-2 py-0.5 text-[10px]',
                            tierMeta.badgeClass,
                          ].join(' ')}
                        >
                          TIER {d.rarityTier}
                        </span>
                        {d.status === 'tested' ? (
                          <span className="font-mono text-[9px] text-success">Testada</span>
                        ) : d.status === 'copied' ? (
                          <span className="font-mono text-[9px] text-tier-a">Em teste</span>
                        ) : (
                          <span className="font-mono text-[9px] text-tier-s">Forjada</span>
                        )}
                      </div>
                    </div>

                    <p className="line-clamp-3 rounded-lg border border-hairline bg-canvas p-2 font-mono text-[10px] leading-relaxed text-ink-tertiary">
                      {d.rawPrompt}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2 font-mono text-[10px]">
                    <span className={tierMeta.textClass}>
                      P{d.rarityPercentile} · MAT {Math.round(d.maturityScore)} · {d.filledAttributesCount}/8
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadSavedDraft(d)}
                        className="rounded-lg border border-hairline bg-elevated px-2 py-1 text-ink hover:border-border-hover cursor-pointer"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyText(d.rawPrompt, `draft:${d.id}`)}
                        className="rounded-lg border border-hairline bg-elevated px-2 py-1 text-ink-secondary hover:border-border-hover cursor-pointer"
                        aria-label="Copiar rascunho"
                      >
                        {copiedKey === `draft:${d.id}` ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDraft(d.id)}
                        className="rounded-lg border border-hairline bg-elevated px-2 py-1 text-ink-muted hover:border-border-hover hover:text-ink cursor-pointer"
                        aria-label="Remover rascunho"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Modal Ritual: Abertura de Território Virgem (O=0 na Matriz 2D) */}
      {vaultModalGap ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVaultModalGap(null)}
        >
          <div
            key={`vault-modal:${vaultModalGap.id}:${revealNonce}`}
            className="gap-vault-enter flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-tier-s/35 bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Abertura de Território Virgem"
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-s/60 bg-tier-s/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-tier-s">
                    <Compass className="h-3 w-3" />
                    TERRITÓRIO VIRGEM
                  </span>
                  <span className="tabular-mono rounded-full border border-tier-s/35 bg-elevated px-2 py-0.5 text-[10px] text-tier-s">
                    Gap {formatGapSerial(modalSerial ?? 1)} / {mappedZeroGapsCount} mapeados
                  </span>
                </div>
                <h2 className="text-[16px] font-medium tracking-tight text-ink">
                  Abertura de Território Virgem · {vaultModalGap.title}
                </h2>
                <p className="font-mono text-[11px] text-ink-tertiary">{vaultModalGap.scope}</p>
              </div>

              <button
                type="button"
                onClick={() => setVaultModalGap(null)}
                className="rounded-xl border border-hairline p-2 text-ink-tertiary hover:border-border-hover hover:text-ink cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Score E animado + telemetria de lacuna */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tier-s/35 bg-tier-s/[0.05] px-4 py-3">
                <div>
                  <span className="section-eyebrow">Potencial Empírico Esperado</span>
                  <p className="mt-1 text-[12px] text-ink-secondary">{vaultModalGap.rationale}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-mono text-[10px] uppercase tracking-wider text-tier-s/80">
                    O = 0 · Score E
                  </div>
                  <div className="tabular-mono text-2xl font-medium text-tier-s">
                    <AnimatedExpectedScore target={vaultModalGap.expectedCount} />
                  </div>
                </div>
              </div>

              {/* Ingredientes do cruzamento virgem */}
              <div className="space-y-2">
                <span className="section-eyebrow">Ingredientes do Cruzamento (O = 0)</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-hairline bg-canvas p-3">
                    <div className="section-eyebrow">{axisNamePt(vaultModalGap.axisA)}</div>
                    <div className="mt-1 text-[13px] font-medium text-ink">
                      {formatTagPt(vaultModalGap.tagA)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                      {vaultModalGap.freqA} ocorrências no escopo
                    </div>
                  </div>
                  <div className="rounded-xl border border-hairline bg-canvas p-3">
                    <div className="section-eyebrow">{axisNamePt(vaultModalGap.axisB)}</div>
                    <div className="mt-1 text-[13px] font-medium text-ink">
                      {formatTagPt(vaultModalGap.tagB)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                      {vaultModalGap.freqB} ocorrências no escopo
                    </div>
                  </div>
                  {vaultModalGap.axisC && vaultModalGap.tagC ? (
                    <div className="rounded-xl border border-hairline bg-canvas p-3 sm:col-span-2">
                      <div className="section-eyebrow">{axisNamePt(vaultModalGap.axisC)}</div>
                      <div className="mt-1 text-[13px] font-medium text-ink">
                        {formatTagPt(vaultModalGap.tagC)}
                      </div>
                      <div className="tabular-mono mt-0.5 text-[10px] text-ink-muted">
                        {vaultModalGap.freqC} ocorrências no escopo
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Preview dos Doadores A e B */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">Preview de Doadores (SQLite FTS5)</span>
                  {loadingDonors ? (
                    <span className="tabular-mono text-[10px] text-ink-muted">
                      Carregando doadores...
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {[
                    {
                      role: 'Doador A',
                      tagLabel: formatTagPt(vaultModalGap.tagA),
                      donor: donorA,
                    },
                    {
                      role: 'Doador B',
                      tagLabel: formatTagPt(vaultModalGap.tagB),
                      donor: donorB,
                    },
                  ].map(({ role, tagLabel, donor }) => {
                    const donorTierMeta = donor ? TIER_COLOR_META[donor.rarity.tier] : null
                    return (
                      <div
                        key={role}
                        className="flex items-start gap-2.5 rounded-xl border border-hairline bg-canvas p-2.5"
                      >
                        <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg border border-hairline bg-elevated">
                          <PromptThumb
                            src={donor?.thumbnailUrl}
                            alt={donor?.title ?? role}
                            fallbackLabel="Sem img"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
                            {role} · {tagLabel}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] font-medium text-ink">
                            {donor
                              ? donor.title
                              : loadingDonors
                                ? 'Buscando no acervo...'
                                : 'Sem doador disponível'}
                          </div>
                          {donor && donorTierMeta ? (
                            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                              <span
                                className={[
                                  'rounded-full border px-1.5 py-0.5 text-[9px]',
                                  donorTierMeta.badgeClass,
                                ].join(' ')}
                              >
                                TIER {donor.rarity.tier}
                              </span>
                              <span className="truncate text-ink-muted">
                                {donor.project} · MAT {Math.round(donor.maturity.score)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-3.5">
              <button
                type="button"
                onClick={() => setVaultModalGap(null)}
                className="btn-secondary text-[12px]"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  setVaultModalGap(null)
                  scrollToSynthesisLab()
                }}
                className="btn-primary text-[12px]"
              >
                <Compass className="h-4 w-4" />
                <span>Sintetizar no laboratório</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Revelação Determinística de Carta Forjada (≤2.5s, skipável por clique ou Esc, sem sorteio) */}
      {ceremonyData ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
          onClick={() => setCeremonyData(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Revelação de Carta Forjada"
        >
          <div className="card-reveal-stage relative flex w-full max-w-[380px] flex-col items-center gap-4 overflow-hidden rounded-[24px] border border-tier-s/60 bg-surface p-6 text-center shadow-2xl">
            <div
              aria-hidden="true"
              className="card-reveal-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 bg-gradient-to-r from-transparent via-tier-s-bright/20 to-transparent"
            />

            <div className="flex w-full items-center justify-between gap-2">
              <span
                className={[
                  'tabular-mono rounded-full border px-2.5 py-0.5 text-[10px] font-semibold',
                  TIER_COLOR_META[ceremonyData.tier].badgeClass,
                ].join(' ')}
              >
                TIER {ceremonyData.tier} · P{ceremonyData.percentile}
              </span>
              <span className="tabular-mono text-[10px] font-medium text-tier-s">
                SÉRIE {formatGapSerial(ceremonyData.serialNumber)}
              </span>
            </div>

            {ceremonyData.donorThumbUrl ? (
              <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-hairline bg-canvas">
                <PromptThumb
                  src={ceremonyData.donorThumbUrl}
                  alt={ceremonyData.gapTitle}
                  fallbackLabel={ceremonyData.gapTitle}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
              </div>
            ) : null}

            <div className="stamp-certify relative inline-flex items-center gap-2 rounded-full border border-tier-s/80 bg-tier-s/15 px-3.5 py-1 text-[11px] font-medium tracking-[0.16em] text-tier-s">
              <span
                aria-hidden="true"
                className="gap-certify-ring pointer-events-none absolute inset-0 rounded-full border border-tier-s/60"
              />
              <Check className="h-3.5 w-3.5" />
              <span>CARTA REVELADA · O = 0</span>
            </div>

            <div className="space-y-1">
              <div className="tabular-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
                E-Score de Lacuna · MAT {Math.round(ceremonyData.maturityScore)}/100 ·{' '}
                {ceremonyData.filledAttrs}/8
              </div>
              <div className="tabular-mono text-4xl font-medium tracking-tight text-tier-s">
                <AnimatedExpectedScore target={ceremonyData.expectedCount} />
              </div>
              <p className="text-[13px] font-medium text-ink">{ceremonyData.gapTitle}</p>
            </div>

            <div className="w-full space-y-2 border-t border-hairline pt-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-2 font-mono text-ink-secondary">
                  <CartographerRankMark
                    roman={ceremonyData.rankRoman}
                    title={ceremonyData.rankTitle}
                  />
                  <span>
                    +1 território · Cartógrafo {ceremonyData.rankRoman}
                  </span>
                </span>
                <span className="tabular-mono text-[10px] text-tier-s">
                  {ceremonyData.territoryPct.toFixed(1)}%
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]"
                  style={{
                    transform: `scaleX(${
                      ceremonyBarReady
                        ? Math.max(0.03, Math.min(1, ceremonyData.territoryPct / 100))
                        : Math.max(0.01, Math.min(1, Math.max(0, ceremonyData.territoryPct - 0.5) / 100))
                    })`,
                  }}
                />
              </div>

              <div className="font-mono text-[10px] text-ink-muted">
                Clique ou pressione Esc para continuar
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <GapsIntroModal open={introOpen} items={items} onClose={() => setIntroOpen(false)} />
    </div>
  )
}
