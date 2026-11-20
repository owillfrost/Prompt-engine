import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Clock,
  Compass,
  Copy,
  Download,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import {
  axisToAttributeKey,
  defaultAttributeSourcesForGap,
  synthesizeGapPrompt,
} from '../core/gapSynthesizer'
import { formatTagPt } from '../core/promptTagsPt'
import { QUADRANT_META, TIER_COLOR_META } from '../core/rarityEngine'
import { playGapRevealSound, playTierSChime } from '../core/soundFeedback'
import { useAnimatedNumber } from '../hooks/useAnimatedNumber'
import type { CartographerRank, GapDiscoveryResult } from '../hooks/useCartographerProfile'
import { useCopyFeedback } from '../hooks/useCopyFeedback'
import { CartographerRankMark } from './CartographerRankMark'
import { PromptThumb } from './PromptThumb'
import type {
  CooccurrenceMatrix2D,
  CoreContentAttributeKey,
  CorpusOverviewStats,
  DecomposePreviewResponse,
  GapAttributeSourceMode,
  GapDonorsResponse,
  GapDraftRecord,
  GapRecord,
  GapsPayload,
  MacroFormat,
  PromptItem,
} from '../types/promptEngine'

interface GapsViewProps {
  items: PromptItem[]
  gapsData: GapsPayload
  stats?: CorpusOverviewStats | null
  initialScope?: string
  initialGapId?: string | null
  onInspectItem: (item: PromptItem) => void
  soundEnabled?: boolean
  discoveredGapIds?: string[]
  onDiscoverGap?: (gapId: string) => GapDiscoveryResult
  cartographerRank?: CartographerRank
  territoryOccupiedPct?: number
}

type GapListMode = 'project_2d_zero' | 'global_3d_zero' | 'global_2d_low_lift'

const EMPTY_DISCOVERED_IDS: string[] = []

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function hashDateString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function formatRemainingUntilMidnight(nowMs: number): string {
  const now = new Date(nowMs)
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  )
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime())
  const totalMinutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
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

function computeDonorHeroHeight(expectedCount: number): number {
  if (expectedCount >= 20) return 140
  if (expectedCount < 10) return 96
  return Math.round(96 + ((expectedCount - 10) / 10) * 44)
}

interface RegistrationCeremonyData {
  gapTitle: string
  expectedCount: number
  serialNumber: number
  rankRoman: string
  rankTitle: string
  territoryPct: number
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
  initialScope = 'all',
  initialGapId = null,
  onInspectItem,
  soundEnabled = true,
  discoveredGapIds = EMPTY_DISCOVERED_IDS,
  onDiscoverGap,
  cartographerRank,
  territoryOccupiedPct = 0,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()
  const [matrixScope, setMatrixScope] = useState<string>(initialScope)
  const [axisPairKey, setAxisPairKey] = useState<string>('environment:lighting')
  const [listMode, setListMode] = useState<GapListMode>('project_2d_zero')
  const [selectedGapId, setSelectedGapId] = useState<string | null>(initialGapId)

  // Workstream 2 + Brief v2: Gap do Dia, Ritual de Descoberta O=0, Cerimônia e doadores hero
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [revealNonce, setRevealNonce] = useState(0)
  const [vaultModalGap, setVaultModalGap] = useState<GapRecord | null>(null)
  const [ceremonyData, setCeremonyData] = useState<RegistrationCeremonyData | null>(null)
  const [ceremonyBarReady, setCeremonyBarReady] = useState(false)
  const [donorImgError, setDonorImgError] = useState<{ a: boolean; b: boolean }>({
    a: false,
    b: false,
  })
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

  // Etapa 4: Estado do sintetizador Gap-to-Prompt
  const [synthFormat, setSynthFormat] = useState<MacroFormat>('json')
  const [aspectRatio, setAspectRatio] = useState<string>('3:4')
  const [includeNegative, setIncludeNegative] = useState(true)
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

  // Etapa 4: Caderno local persistido em data/gap_drafts.json
  const [savedDrafts, setSavedDrafts] = useState<GapDraftRecord[]>([])
  const [savingDraft, setSavingDraft] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
      if (initialGapId.startsWith('g3d:')) setListMode('global_3d_zero')
      else if (initialGapId.startsWith('g2d:')) setListMode('global_2d_low_lift')
      else setListMode('project_2d_zero')
    }
  }, [initialGapId])

  useEffect(() => {
    fetch('/api/gap-drafts')
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((data: { drafts?: GapDraftRecord[] }) => {
        if (Array.isArray(data.drafts)) setSavedDrafts(data.drafts)
      })
      .catch(() => {
        // ignore
      })
  }, [])

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

  const allKnownGaps = useMemo(
    () => [
      ...gapsData.projectGaps,
      ...gapsData.globalTriadGaps,
      ...gapsData.globalUnderexplored,
    ],
    [gapsData.projectGaps, gapsData.globalTriadGaps, gapsData.globalUnderexplored]
  )

  const todayKey = useMemo(() => getLocalDateKey(new Date(nowMs)), [nowMs])
  const expiresInLabel = useMemo(() => formatRemainingUntilMidnight(nowMs), [nowMs])

  const gapOfTheDay: GapRecord | null = useMemo(() => {
    const basePool = [...gapsData.globalTriadGaps, ...gapsData.projectGaps]
    const zeroPool = basePool.filter((g) => g.observedCount === 0)
    const fallbackPool = basePool.length > 0 ? basePool : gapsData.globalUnderexplored
    const pool = zeroPool.length > 0 ? zeroPool : fallbackPool
    if (pool.length === 0) return null
    const idx = hashDateString(todayKey) % pool.length
    return pool[idx] || null
  }, [gapsData.globalTriadGaps, gapsData.projectGaps, gapsData.globalUnderexplored, todayKey])

  const mappedZeroGapsCount = useMemo(() => {
    const zeroCount =
      gapsData.projectGaps.filter((g) => g.observedCount === 0).length +
      gapsData.globalTriadGaps.filter((g) => g.observedCount === 0).length
    return Math.max(1, zeroCount, discoveredGapIds.length, localDiscoveredIds.length)
  }, [
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
    if (listMode === 'global_3d_zero') return gapsData.globalTriadGaps
    if (listMode === 'global_2d_low_lift') return gapsData.globalUnderexplored
    if (matrixScope !== 'all') {
      return gapsData.projectGaps.filter((g) => g.scope === matrixScope)
    }
    return gapsData.projectGaps
  }, [listMode, gapsData, matrixScope])

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
      if (gap.kind === 'global_3d_zero') {
        setListMode('global_3d_zero')
      } else if (gap.kind === 'global_2d_low_lift') {
        setListMode('global_2d_low_lift')
      } else {
        setListMode('project_2d_zero')
        if (matrixScope !== 'all' && matrixScope !== gap.scope && availableScopes.includes(gap.scope)) {
          setMatrixScope(gap.scope)
        }
      }
    } else if (isKnown) {
      if (gapsData.globalTriadGaps.some((g) => g.id === gap.id)) {
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

  const donorsListA = useMemo(() => {
    if (donorsPool && donorsPool.donorsA.length > 0) return donorsPool.donorsA
    return fallbackDonorA ? [fallbackDonorA] : []
  }, [donorsPool, fallbackDonorA])

  const donorsListB = useMemo(() => {
    if (donorsPool && donorsPool.donorsB.length > 0) return donorsPool.donorsB
    return fallbackDonorB ? [fallbackDonorB] : []
  }, [donorsPool, fallbackDonorB])

  const donorA = donorsListA.length > 0 ? donorsListA[donorAIdx % donorsListA.length] : null
  const donorB = donorsListB.length > 0 ? donorsListB[donorBIdx % donorsListB.length] : null

  useEffect(() => {
    setDonorImgError((prev) => (prev.a ? { ...prev, a: false } : prev))
  }, [donorA?.id])

  useEffect(() => {
    setDonorImgError((prev) => (prev.b ? { ...prev, b: false } : prev))
  }, [donorB?.id])

  const savedDraftByGapId = useMemo(() => {
    const map = new Map<string, GapDraftRecord>()
    for (const d of savedDrafts) {
      const prev = map.get(d.gapId)
      if (!prev || d.createdAt > prev.createdAt) {
        map.set(d.gapId, d)
      }
    }
    return map
  }, [savedDrafts])

  // Síntese automática quando não houver edição manual em andamento
  useEffect(() => {
    if (!selectedGap || manuallyEdited) return
    const res = synthesizeGapPrompt({
      gap: selectedGap,
      donorA,
      donorB,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }, [
    selectedGap,
    donorA,
    donorB,
    synthFormat,
    aspectRatio,
    includeNegative,
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
        const srcItem = srcMode === 'donor_b' ? donorB : srcMode === 'donor_a' ? donorA : null
        if (!srcItem) continue
        for (const tg of srcItem.attributes[slot.key].tags) inheritedSet.add(tg)
      }
      for (const d of [donorA, donorB]) {
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
  }, [draftText, selectedGap, donorA, donorB, attributeSources])

  const targetSlotsMap = useMemo(() => {
    const map = new Map<CoreContentAttributeKey, string[]>()
    if (!selectedGap) return map
    const add = (ax: string | undefined, tg: string | undefined) => {
      if (!ax || !tg) return
      const key = axisToAttributeKey(ax)
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
      format: synthFormat,
      aspectRatio,
      includeNegative,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }

  const handleSaveDraft = async () => {
    if (!selectedGap || !draftText.trim() || savingDraft) return
    setSavingDraft(true)
    try {
      const res = await fetch('/api/gap-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        playTierSChime(soundEnabled)
        setCeremonyData({
          gapTitle: selectedGap.title,
          expectedCount: selectedGap.expectedCount,
          serialNumber,
          rankRoman: cartographerRank?.roman ?? 'I',
          rankTitle: cartographerRank?.title ?? 'Explorador de Campo',
          territoryPct: Math.min(100, Math.max(territoryOccupiedPct, 1)),
        })
      }
    } finally {
      setSavingDraft(false)
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
      }
    } catch {
      // ignore
    }
  }

  const handleLoadSavedDraft = (d: GapDraftRecord) => {
    const existing = allKnownGaps.find((g) => g.id === d.gapId)
    if (!existing) {
      setAdHocCellGap({
        id: d.gapId,
        kind: d.gapId.startsWith('pgap:') ? 'project_2d_zero' : 'global_2d_low_lift',
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
  const modalSerial = vaultModalGap ? getSerialForGap(vaultModalGap.id) : null
  const isSelectedNearMiss =
    selectedGap !== null &&
    selectedGap.observedCount >= 1 &&
    selectedGap.observedCount <= 3 &&
    selectedGap.expectedCount >= 3
  const donorHeroHeight = selectedGap ? computeDonorHeroHeight(selectedGap.expectedCount) : 112
  const isDonorAActive = Object.values(attributeSources).includes('donor_a')
  const isDonorBActive = Object.values(attributeSources).includes('donor_b')

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <span className="section-eyebrow">
            Matriz de Co-ocorrência · N={gfCount.toLocaleString('pt-BR')} Google Flow · Corpus{' '}
            {totalCount.toLocaleString('pt-BR')}
          </span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-zinc-100">
            Detector & Laboratório de Gaps Criativos (O = 0)
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
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
            className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-2 text-[12px] text-zinc-200 focus:border-white/25 focus:outline-none"
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
            className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-2 text-[12px] text-zinc-200 focus:border-white/25 focus:outline-none"
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

      {/* Gap do Dia (Destaque rotativo 24h) */}
      {gapOfTheDay ? (
        <section
          aria-label="Gap do Dia"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8b84b]/35 bg-[#101013] px-4 py-3.5"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/60 bg-[#e8b84b]/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-[#e8b84b]">
                <Compass className="h-3 w-3" />
                GAP DO DIA
              </span>
              <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-white/[0.09] bg-[#0b0b0e] px-2 py-0.5 text-[10px] text-zinc-300">
                <Clock className="h-3 w-3 text-zinc-400" />
                EXPIRA EM {expiresInLabel}
              </span>
              <span className="tabular-mono rounded-full border border-white/[0.07] bg-[#0b0b0e] px-2 py-0.5 text-[10px] text-zinc-400">
                {gapOfTheDay.scope}
              </span>
              {getSerialForGap(gapOfTheDay.id) !== null ? (
                <span className="tabular-mono rounded-full border border-[#e8b84b]/35 bg-[#141418] px-2 py-0.5 text-[10px] text-[#e8b84b]">
                  Gap {formatGapSerial(getSerialForGap(gapOfTheDay.id)!)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-baseline gap-2.5 pt-0.5">
              <h2 className="text-[14px] font-medium tracking-tight text-zinc-100">
                {formatTagPt(gapOfTheDay.tagA)} × {formatTagPt(gapOfTheDay.tagB)}
                {gapOfTheDay.tagC ? ` × ${formatTagPt(gapOfTheDay.tagC)}` : ''}
              </h2>
              <span className="tabular-mono text-[11px] text-[#e8b84b]">
                E={gapOfTheDay.expectedCount}
              </span>
              <span className="tabular-mono text-[10px] text-zinc-500">
                O={gapOfTheDay.observedCount}
              </span>
            </div>
            <p className="line-clamp-1 text-[11px] text-zinc-400">{gapOfTheDay.rationale}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                selectAndRevealGap(gapOfTheDay, {
                  syncScopeAndList: true,
                  scrollToLab: true,
                })
              }
              className="btn-primary text-[12px]"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Explorar território</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* Matriz 2D de Co-ocorrência */}
      {activeMatrix ? (
        <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="section-eyebrow">
                Matriz 2D · {activeMatrix.axisALabel} × {activeMatrix.axisBLabel} (
                {activeMatrix.scope === 'all' ? 'Global' : activeMatrix.scope} · N=
                {activeMatrix.totalPrompts.toLocaleString('pt-BR')})
              </span>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Pergunta respondida: quais cruzamentos entre ingredientes frequentes ainda têm{' '}
                <span className="font-mono text-zinc-300">0</span> ocorrências?
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-[#e8b84b]/70 bg-[#e8b84b]/10" />
                Gap (O=0, plausível)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-purple-400/55 bg-purple-500/[0.07]" />
                Quase-virgem (O=1–3)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-white/10 bg-white/[0.09]" />
                Saturado
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed border-separate border-spacing-1 text-left">
              <thead>
                <tr>
                  <th className="w-[176px] px-1.5 py-1 font-mono text-[10px] font-normal text-zinc-500">
                    {activeMatrix.axisALabel} \ {activeMatrix.axisBLabel}
                  </th>
                  {activeMatrix.cols.map((col) => (
                    <th
                      key={col}
                      className="px-1.5 py-1 font-mono text-[10px] font-normal text-zinc-400"
                      title={`${formatTagPt(col)} (${col})`}
                    >
                      <div className="truncate">{formatTagPt(col)}</div>
                      <div className="text-[9px] text-zinc-600">
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
                      className="max-w-[176px] overflow-hidden px-1.5 py-1 font-mono text-[10px] text-zinc-300"
                      title={`${formatTagPt(row)} (${activeMatrix.rowTotals[row] || 0})`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">{formatTagPt(row)}</span>
                        <span className="shrink-0 text-zinc-600">
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
                                ? { backgroundColor: `rgba(244, 244, 246, ${intensity})` }
                                : undefined
                            }
                            className={[
                              'flex w-full flex-col items-start rounded-lg px-1.5 py-1 font-mono text-[10px] transition-colors',
                              cell.isGap
                                ? 'border border-dashed border-[#e8b84b]/65 bg-[#e8b84b]/[0.07] text-[#e8b84b] cursor-pointer hover:border-[#e8b84b]'
                                : isNearMiss
                                  ? 'border border-dashed border-purple-400/55 bg-purple-500/[0.07] text-purple-300 cursor-pointer hover:border-purple-400'
                                  : cell.observed === 0
                                    ? `border border-white/[0.04] bg-[#09090b] text-zinc-700${isClickable ? ' cursor-pointer hover:border-white/20' : ''}`
                                    : `border border-white/[0.06] text-zinc-200${isClickable ? ' cursor-pointer hover:border-white/25' : ''}`,
                              isSelectedCell ? 'ring-1 ring-white/45' : '',
                            ].join(' ')}
                            title={`O=${cell.observed} | E=${cell.expected} | Lift=${cell.lift}`}
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 lg:col-span-5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'project_2d_zero', label: 'Por Projeto (O = 0)', count: gapsData.projectGaps.length },
                { id: 'global_3d_zero', label: 'Tríades Globais (O = 0)', count: gapsData.globalTriadGaps.length },
                { id: 'global_2d_low_lift', label: 'Subexplorados (Lift < 0.36)', count: gapsData.globalUnderexplored.length },
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
                  'rounded-xl border px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                  listMode === m.id
                    ? 'border-white/25 bg-[#17171d] font-medium text-zinc-100'
                    : 'border-white/[0.06] bg-[#0b0b0e] text-zinc-400 hover:border-white/[0.15]',
                ].join(' ')}
              >
                {m.label} <span className="tabular-mono text-zinc-500">({m.count})</span>
              </button>
            ))}
          </div>

          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {rankedGaps.map((g) => {
              const isSel = selectedGap?.id === g.id
              const listSerial = getSerialForGap(g.id)
              const mappedDraft = savedDraftByGapId.get(g.id)
              const isMapped = Boolean(mappedDraft)
              const isNearMissItem = g.observedCount >= 1 && g.observedCount <= 3
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectAndRevealGap(g)}
                  className={[
                    'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                    isMapped
                      ? isSel
                        ? 'border-[#e8b84b]/45 bg-[#131317] opacity-85'
                        : 'border-white/[0.05] bg-[#0a0a0d] opacity-70'
                      : isSel
                        ? 'border-[#e8b84b]/60 bg-[#15151a]'
                        : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.16]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-zinc-100">{g.title}</span>
                    <span className="tabular-mono shrink-0 text-[10px] text-[#e8b84b]">
                      O={g.observedCount} · E={g.expectedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-zinc-500">
                    <span className="flex items-center gap-2 truncate">
                      <span>{g.scope}</span>
                      {isMapped ? (
                        <span className="inline-flex items-center gap-1 rounded border border-[#e8b84b]/35 bg-[#e8b84b]/[0.08] px-1.5 py-0.5 text-[9px] text-[#e8b84b]">
                          <Check className="h-2.5 w-2.5" />
                          <span>
                            Mapeado{listSerial !== null ? ` · ${formatGapSerial(listSerial)}` : ''}
                          </span>
                        </span>
                      ) : listSerial !== null ? (
                        <span className="text-[#e8b84b]/85">{formatGapSerial(listSerial)}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0">
                      {g.freqA}× · {g.freqB}×{g.freqC ? ` · ${g.freqC}×` : ''}
                    </span>
                  </div>
                  {isNearMissItem ? (
                    <div className="font-mono text-[10px] text-purple-300/90">
                      a {g.observedCount}{' '}
                      {g.observedCount === 1 ? 'ocorrência' : 'ocorrências'} de ser virgem
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>

        {/* Laboratório de Síntese & Doadores */}
        <section
          ref={synthesisSectionRef}
          className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5 lg:col-span-7"
        >
          {!selectedGap ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="tabular-mono rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[10px] tracking-wider text-zinc-300">
                EXPLORAÇÃO LIVRE
              </span>
              <p className="text-[13px] text-zinc-500">
                Selecione um cruzamento na lista ou na matriz para abrir o briefing.
              </p>
            </div>
          ) : (
            <>
              {/* Bloco 1: BRIEFING + Selo de Estado do Ciclo */}
              <div
                key={`${selectedGap.id}:${revealNonce}`}
                className={[
                  'space-y-3 border-b border-white/[0.07] pb-4',
                  selectedGap.observedCount === 0 ? 'gap-vault-enter' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="section-eyebrow tracking-[0.16em]">
                      BRIEFING · {selectedGap.scope}
                    </span>
                    {selectedSavedDraft ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/60 bg-[#e8b84b]/12 px-2 py-0.5 text-[9px] font-medium tracking-wider text-[#e8b84b]">
                        <Check className="h-2.5 w-2.5" />
                        <span>
                          MAPEADO · Gap {formatGapSerial(selectedSerial ?? 1)}
                          {formatShortTimestamp(selectedSavedDraft.createdAt)
                            ? ` · ${formatShortTimestamp(selectedSavedDraft.createdAt)}`
                            : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="tabular-mono rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium tracking-wider text-zinc-300">
                        EM MAPEAMENTO
                      </span>
                    )}
                    {selectedGap.observedCount === 0 ? (
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/50 bg-[#e8b84b]/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-[#e8b84b]">
                        <Compass className="h-2.5 w-2.5" />
                        TERRITÓRIO VIRGEM
                      </span>
                    ) : isSelectedNearMiss ? (
                      <span className="tabular-mono rounded-full border border-purple-400/55 bg-purple-500/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-purple-300">
                        QUASE-VIRGEM
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-medium tracking-tight text-zinc-100">
                      {formatTagPt(selectedGap.tagA)} × {formatTagPt(selectedGap.tagB)}
                      {selectedGap.tagC ? ` × ${formatTagPt(selectedGap.tagC)}` : ''}
                    </h2>
                    <p className="mt-1 text-[12px] text-zinc-400">{selectedGap.rationale}</p>
                    {selectedGap.observedCount >= 1 && selectedGap.observedCount <= 3 ? (
                      <p className="mt-1 font-mono text-[11px] text-purple-300">
                        a {selectedGap.observedCount}{' '}
                        {selectedGap.observedCount === 1 ? 'ocorrência' : 'ocorrências'} de ser virgem
                      </p>
                    ) : null}
                  </div>

                  {/* E-score grande como indicador empírico de dificuldade/potencial */}
                  <div className="shrink-0 rounded-xl border border-[#e8b84b]/35 bg-[#e8b84b]/[0.06] px-3.5 py-2 text-right">
                    <div className="tabular-mono text-[9px] uppercase tracking-[0.14em] text-[#e8b84b]/80">
                      O={selectedGap.observedCount} · E-Score
                    </div>
                    <div className="tabular-mono text-2xl font-medium leading-tight text-[#e8b84b]">
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
                  <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                    <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisA)}</div>
                    <div className="mt-1 text-[12px] font-medium text-zinc-200">
                      {formatTagPt(selectedGap.tagA)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                      {selectedGap.freqA} ocorrências
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                    <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisB)}</div>
                    <div className="mt-1 text-[12px] font-medium text-zinc-200">
                      {formatTagPt(selectedGap.tagB)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                      {selectedGap.freqB} ocorrências
                    </div>
                  </div>
                  {selectedGap.axisC && selectedGap.tagC ? (
                    <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                      <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisC)}</div>
                      <div className="mt-1 text-[12px] font-medium text-zinc-200">
                        {formatTagPt(selectedGap.tagC)}
                      </div>
                      <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                        {selectedGap.freqC} ocorrências
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Bloco 2: PONTE CRIATIVA — Doadores em tamanho hero proporcional ao E-score */}
              <div className="space-y-3 border-b border-white/[0.07] pb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow tracking-[0.16em]">
                    PONTE CRIATIVA · DOADORES DO ACERVO
                  </span>
                  {loadingDonors ? (
                    <span className="tabular-mono text-[10px] text-zinc-500">
                      Consultando SQLite FTS5...
                    </span>
                  ) : (
                    <span className="tabular-mono text-[10px] text-zinc-500">
                      Escala hero {donorHeroHeight}px (E={selectedGap.expectedCount})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: 'a' as const,
                        role: 'DOADOR A',
                        axisLabel: AXIS_NAME_PT(selectedGap.axisA).toUpperCase(),
                        tagLabel: formatTagPt(selectedGap.tagA),
                        freq: selectedGap.freqA,
                        item: donorA,
                        idx: donorAIdx,
                        total: donorsListA.length,
                        isActiveSource: isDonorAActive,
                        imgBroken: donorImgError.a,
                        onImgError: () => setDonorImgError((prev) => ({ ...prev, a: true })),
                        onCycle: () => {
                          setDonorAIdx((i) => i + 1)
                          setManuallyEdited(false)
                        },
                      },
                      {
                        key: 'b' as const,
                        role: 'DOADOR B',
                        axisLabel: AXIS_NAME_PT(selectedGap.axisB).toUpperCase(),
                        tagLabel: formatTagPt(selectedGap.tagB),
                        freq: selectedGap.freqB,
                        item: donorB,
                        idx: donorBIdx,
                        total: donorsListB.length,
                        isActiveSource: isDonorBActive,
                        imgBroken: donorImgError.b,
                        onImgError: () => setDonorImgError((prev) => ({ ...prev, b: true })),
                        onCycle: () => {
                          setDonorBIdx((i) => i + 1)
                          setManuallyEdited(false)
                        },
                      },
                    ] as const
                  ).map(
                    ({
                      key,
                      role,
                      axisLabel,
                      tagLabel,
                      freq,
                      item,
                      idx,
                      total,
                      isActiveSource,
                      imgBroken,
                      onImgError,
                      onCycle,
                    }) => {
                      const itemTierMeta = item ? TIER_COLOR_META[item.rarity.tier] : null
                      return (
                        <div
                          key={role}
                          className="flex flex-col gap-2.5 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-3"
                        >
                          {/* Imagem hero 96–140px com AR 3:4 preservado + anel dourado se ativo + overlay Trocar doador */}
                          <div className="flex items-start gap-3">
                            <div
                              style={{ height: `${donorHeroHeight}px` }}
                              className={[
                                'relative aspect-[3/4] shrink-0 overflow-hidden rounded-[10px] border bg-[#121217] transition-colors',
                                isActiveSource
                                  ? 'border-[#e8b84b] ring-1 ring-[#e8b84b]/75'
                                  : 'border-white/10',
                              ].join(' ')}
                            >
                              {item?.thumbnailUrl && !imgBroken ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt={item.title}
                                  onError={onImgError}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-zinc-600">
                                  Sem imagem
                                </div>
                              )}

                              {total > 1 ? (
                                <button
                                  type="button"
                                  onClick={onCycle}
                                  className="btn-secondary absolute right-1.5 bottom-1.5 min-h-[26px] rounded-lg border-white/20 bg-black/65 px-2 py-1 text-[10px] text-zinc-100 backdrop-blur-sm hover:border-white/40 hover:bg-black/80"
                                  title="Alternar para outro prompt que contém este ingrediente"
                                >
                                  <RefreshCw className="h-2.5 w-2.5" />
                                  <span>Trocar doador</span>
                                </button>
                              ) : null}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                              <div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="tabular-mono truncate text-[9px] uppercase tracking-[0.12em] text-zinc-400">
                                    {role} · {axisLabel} · {freq} OCORRÊNCIAS
                                  </span>
                                  {total > 0 ? (
                                    <span className="tabular-mono shrink-0 text-[9px] text-zinc-500">
                                      {(idx % total) + 1}/{total}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-1 truncate text-[12px] font-medium text-zinc-100">
                                  {item ? item.title : 'Sem doador disponível'}
                                </div>

                                <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                                  {tagLabel}
                                </div>

                                {item && itemTierMeta ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                                    <span
                                      className={[
                                        'rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                                        itemTierMeta.badgeClass,
                                      ].join(' ')}
                                    >
                                      TIER {item.rarity.tier}
                                    </span>
                                    <span className="truncate text-zinc-500">
                                      {item.project} · MAT {Math.round(item.maturity.score)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              <div className="pt-2">
                                <button
                                  key={`inspect-${key}`}
                                  type="button"
                                  disabled={!item}
                                  onClick={() => item && onInspectItem(item)}
                                  className="btn-secondary min-h-[30px] px-2.5 text-[10px]"
                                >
                                  <Maximize2 className="h-3 w-3" />
                                  <span>Ver 8 atributos</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>

              {/* Bloco 3: REGISTRO — Sintetizador Gap-to-Prompt + Telemetria Ao Vivo */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="section-eyebrow tracking-[0.16em]">
                      REGISTRO · SÍNTESE ASSISTIDA
                    </span>
                    <p className="text-[11px] text-zinc-500">
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
                      className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2 py-1 font-mono text-[10px] text-zinc-300 focus:outline-none"
                      aria-label="Proporção"
                    >
                      {ASPECT_OPTIONS.map((ar) => (
                        <option key={ar} value={ar}>
                          AR {ar}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-2 py-1 font-mono text-[10px] text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNegative}
                        onChange={(e) => {
                          setIncludeNegative(e.target.checked)
                          setManuallyEdited(false)
                        }}
                        className="accent-zinc-300"
                      />
                      <span>Negativo</span>
                    </label>
                  </div>
                </div>

                {/* Matriz de origem dos 6 atributos principais */}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CORE_ATTR_SLOTS.map((slot) => {
                    const isGapAxis = targetSlotsMap.has(slot.key)
                    const currentSource = attributeSources[slot.key]
                    return (
                      <div
                        key={slot.key}
                        className={[
                          'flex flex-col gap-1.5 rounded-xl border p-2',
                          isGapAxis
                            ? 'border-dashed border-[#e8b84b]/45 bg-[#e8b84b]/[0.04]'
                            : 'border-white/[0.06] bg-[#0b0b0e]',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-medium text-zinc-300">
                            {slot.short} · {slot.label}
                          </span>
                          {isGapAxis ? (
                            <span className="font-mono text-[9px] text-[#e8b84b]">ALVO</span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'donor_a', label: 'A' },
                              { id: 'gap_target', label: 'Gap' },
                              { id: 'donor_b', label: 'B' },
                            ] as const
                          ).map((opt) => {
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
                                    ? 'border-white/25 bg-[#1b1b22] text-zinc-100'
                                    : 'border-white/[0.05] bg-[#09090b] text-zinc-500 hover:text-zinc-300',
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
                    className="w-full rounded-2xl border border-white/[0.08] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-200 focus:border-white/25 focus:outline-none"
                  />
                  {manuallyEdited ? (
                    <span className="pointer-events-none absolute top-2.5 right-3 rounded-md border border-white/10 bg-[#141418] px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                      editado manualmente
                    </span>
                  ) : null}
                </div>

                {/* Barra de telemetria ao vivo (/api/decompose-preview) */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-3 py-2 font-mono text-[11px]">
                  {preview ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            TIER_COLOR_META[preview.rarity.tier].badgeClass,
                          ].join(' ')}
                        >
                          TIER {preview.rarity.tier}
                        </span>
                        <span className={TIER_COLOR_META[preview.rarity.tier].textClass}>
                          {preview.rarity.label}
                        </span>
                        <span className="text-zinc-500">·</span>
                        <span className="text-zinc-300">MAT {Math.round(preview.maturity.score)}</span>
                        <span className="text-zinc-500">
                          ({QUADRANT_META[preview.quadrant].label})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-zinc-400">
                          {preview.attributes.estrutura.filledAttributesCount}/8 atr.
                        </span>
                        <span className="text-zinc-400">
                          {preview.attributes.estrutura.tokenCount} tok
                        </span>
                        <span
                          className={
                            preview.exactGapOccurrences === 0
                              ? 'text-[#e8b84b]'
                              : 'text-zinc-400'
                          }
                          title={
                            preview.exactGapOccurrences === 0 && (preview.secondaryFtsOccurrences ?? 0) > 0
                              ? `0 ocorrências como eixo primário (${preview.secondaryFtsOccurrences} menções secundárias no FTS5)`
                              : undefined
                          }
                        >
                          {preview.exactGapOccurrences === 0
                            ? 'O = 0 confirmado'
                            : `O = ${preview.exactGapOccurrences} no escopo`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-zinc-500">
                      {previewLoading
                        ? 'Calculando percentil e decomposição em 8 atributos...'
                        : 'Aguardando prompt para simulação.'}
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
                      onClick={() => void copyText(draftText, 'gap-synth')}
                      className="btn-secondary text-[11px]"
                    >
                      {copiedKey === 'gap-synth' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedKey === 'gap-synth' ? 'Copiado' : 'Copiar prompt'}</span>
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
                      disabled={savingDraft || !draftText.trim()}
                      onClick={() => void handleSaveDraft()}
                      className="btn-primary text-[12px]"
                    >
                      {justSaved ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <BookmarkPlus className="h-4 w-4" />
                      )}
                      <span>
                        {savingDraft
                          ? 'Registrando...'
                          : justSaved
                            ? 'Registrado no Caderno'
                            : 'Salvar no Caderno'}
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
      <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <span className="section-eyebrow">
              Caderno Local de Gaps ({savedDrafts.length})
            </span>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Rascunhos salvos localmente em{' '}
              <span className="font-mono text-zinc-300">data/gap_drafts.json</span>: bibliotecas originais seguem em modo Read-Only.
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
          <p className="py-6 text-center font-mono text-[11px] text-zinc-500">
            Nenhum rascunho salvo no Caderno.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedDrafts.map((d) => {
              const tierMeta = TIER_COLOR_META[d.rarityTier] || TIER_COLOR_META.C
              return (
                <article
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-3.5"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-zinc-100">
                          {d.gapTitle}
                        </div>
                        <div className="tabular-mono text-[10px] text-zinc-500">
                          {d.scope} · {d.macroFormat.toUpperCase()} · {d.aspectRatio}
                        </div>
                      </div>
                      <span
                        className={[
                          'tabular-mono shrink-0 rounded-full border px-2 py-0.5 text-[10px]',
                          tierMeta.badgeClass,
                        ].join(' ')}
                      >
                        TIER {d.rarityTier}
                      </span>
                    </div>

                    <p className="line-clamp-3 rounded-lg border border-white/[0.05] bg-[#09090b] p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
                      {d.rawPrompt}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2 font-mono text-[10px]">
                    <span className={tierMeta.textClass}>
                      P{d.rarityPercentile} · MAT {Math.round(d.maturityScore)} · {d.filledAttributesCount}/8
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadSavedDraft(d)}
                        className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-200 hover:border-white/25 cursor-pointer"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyText(d.rawPrompt, `draft:${d.id}`)}
                        className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-300 hover:border-white/25 cursor-pointer"
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
                        className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-500 hover:border-white/25 hover:text-zinc-200 cursor-pointer"
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setVaultModalGap(null)}
        >
          <div
            key={`vault-modal:${vaultModalGap.id}:${revealNonce}`}
            className="gap-vault-enter flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#e8b84b]/45 bg-[#0d0d11] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Abertura de Território Virgem"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/60 bg-[#e8b84b]/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-[#e8b84b]">
                    <Compass className="h-3 w-3" />
                    TERRITÓRIO VIRGEM
                  </span>
                  <span className="tabular-mono rounded-full border border-[#e8b84b]/35 bg-[#141418] px-2 py-0.5 text-[10px] text-[#e8b84b]">
                    Gap {formatGapSerial(modalSerial ?? 1)} / {mappedZeroGapsCount} mapeados
                  </span>
                </div>
                <h2 className="text-[16px] font-medium tracking-tight text-zinc-100">
                  Abertura de Território Virgem · {vaultModalGap.title}
                </h2>
                <p className="font-mono text-[11px] text-zinc-400">{vaultModalGap.scope}</p>
              </div>

              <button
                type="button"
                onClick={() => setVaultModalGap(null)}
                className="rounded-xl border border-white/[0.08] p-2 text-zinc-400 hover:border-white/[0.18] hover:text-zinc-100 cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Score E animado + telemetria de lacuna */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/[0.05] px-4 py-3">
                <div>
                  <span className="section-eyebrow">Potencial Empírico Esperado</span>
                  <p className="mt-1 text-[12px] text-zinc-300">{vaultModalGap.rationale}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular-mono text-[10px] uppercase tracking-wider text-[#e8b84b]/80">
                    O = 0 · Score E
                  </div>
                  <div className="tabular-mono text-2xl font-medium text-[#e8b84b]">
                    <AnimatedExpectedScore target={vaultModalGap.expectedCount} />
                  </div>
                </div>
              </div>

              {/* Ingredientes do cruzamento virgem */}
              <div className="space-y-2">
                <span className="section-eyebrow">Ingredientes do Cruzamento (O = 0)</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.08] bg-[#101014] p-3">
                    <div className="section-eyebrow">{AXIS_NAME_PT(vaultModalGap.axisA)}</div>
                    <div className="mt-1 text-[13px] font-medium text-zinc-100">
                      {formatTagPt(vaultModalGap.tagA)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                      {vaultModalGap.freqA} ocorrências no escopo
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-[#101014] p-3">
                    <div className="section-eyebrow">{AXIS_NAME_PT(vaultModalGap.axisB)}</div>
                    <div className="mt-1 text-[13px] font-medium text-zinc-100">
                      {formatTagPt(vaultModalGap.tagB)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                      {vaultModalGap.freqB} ocorrências no escopo
                    </div>
                  </div>
                  {vaultModalGap.axisC && vaultModalGap.tagC ? (
                    <div className="rounded-xl border border-white/[0.08] bg-[#101014] p-3 sm:col-span-2">
                      <div className="section-eyebrow">{AXIS_NAME_PT(vaultModalGap.axisC)}</div>
                      <div className="mt-1 text-[13px] font-medium text-zinc-100">
                        {formatTagPt(vaultModalGap.tagC)}
                      </div>
                      <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
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
                    <span className="tabular-mono text-[10px] text-zinc-500">
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
                        className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-[#101014] p-2.5"
                      >
                        <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[#15151a]">
                          <PromptThumb
                            src={donor?.thumbnailUrl}
                            alt={donor?.title ?? role}
                            fallbackLabel="Sem img"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                            {role} · {tagLabel}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] font-medium text-zinc-200">
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
                              <span className="truncate text-zinc-500">
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

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-3.5">
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

      {/* Cerimônia de Registro (≤2.5s, skipável por clique ou Esc, zero confete/troféu) */}
      {ceremonyData ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs cursor-pointer"
          onClick={() => setCeremonyData(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Cerimônia de Registro Cartográfico"
        >
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-[#e8b84b]/45 bg-[#0c0c10] p-6 text-center shadow-2xl">
            <div className="stamp-certify inline-flex items-center gap-2 rounded-full border border-[#e8b84b]/75 bg-[#e8b84b]/15 px-3.5 py-1 text-[11px] font-medium tracking-[0.16em] text-[#e8b84b]">
              <Check className="h-3.5 w-3.5" />
              <span>TERRITÓRIO VIRGEM</span>
            </div>

            <div className="space-y-1">
              <div className="tabular-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                E-Score Registrado
              </div>
              <div className="tabular-mono text-4xl font-medium tracking-tight text-[#e8b84b]">
                <AnimatedExpectedScore target={ceremonyData.expectedCount} />
              </div>
              <p className="text-[12px] text-zinc-300">{ceremonyData.gapTitle}</p>
            </div>

            <div className="w-full space-y-2 border-t border-white/[0.08] pt-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-2 font-mono text-zinc-200">
                  <CartographerRankMark
                    roman={ceremonyData.rankRoman}
                    title={ceremonyData.rankTitle}
                  />
                  <span>
                    +1 território · Cartógrafo {ceremonyData.rankRoman} · Gap{' '}
                    {formatGapSerial(ceremonyData.serialNumber)}
                  </span>
                </span>
                <span className="tabular-mono text-[10px] text-[#e8b84b]">
                  {ceremonyData.territoryPct.toFixed(1)}%
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#e8b84b] transition-transform duration-200"
                  style={{
                    transform: `scaleX(${
                      ceremonyBarReady
                        ? Math.max(0.03, Math.min(1, ceremonyData.territoryPct / 100))
                        : Math.max(0.01, Math.min(1, Math.max(0, ceremonyData.territoryPct - 0.5) / 100))
                    })`,
                    transitionTimingFunction: 'var(--ease-out)',
                  }}
                />
              </div>

              <div className="font-mono text-[10px] text-zinc-500">
                Clique em qualquer ponto para continuar
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AXIS_NAME_PT(axis: string): string {
  const map: Record<string, string> = {
    environment: 'Cenário',
    lighting: 'Luz',
    pose: 'Sujeito / Pose',
    angle: 'Câmera',
    fabric: 'Textura',
    wardrobe: 'Figurino',
  }
  return map[axis] || axis
}
