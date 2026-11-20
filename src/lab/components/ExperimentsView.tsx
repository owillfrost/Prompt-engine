import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Compass,
  Copy,
  Download,
  Lock,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
  Split,
  Unlock,
} from 'lucide-react'
import {
  ANTITHESIS_PRESETS,
  buildRandomDriftSources,
  defaultAntithesisSources,
  synthesizeExperimentalPrompt,
  type AntithesisPreset,
} from '../../core/experimentalFusion'
import { formatTagPt } from '../../core/promptTagsPt'
import { QUADRANT_META } from '../../core/rarityEngine'
import { playGapRevealSound, playTierSChime } from '../../core/soundFeedback'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import type {
  AntipodeCandidateItem,
  CoreContentAttributeKey,
  DecomposePreviewResponse,
  ExperimentalSlotSource,
  ExperimentSampleResponse,
  ExperimentVariantMode,
  GapDraftRecord,
  MacroFormat,
  PromptItem,
  SourceLibFilter,
} from '../../types/promptEngine'
import { getPromptSemanticTitle } from '../utils/promptDisplay'
import { TIER_COLOR_META } from '../utils/themeTokens'
import { FavoriteToggleButton } from './FavoriteToggleButton'
import { PromptThumb } from './PromptThumb'

interface ExperimentsViewProps {
  sourceLib: SourceLibFilter
  soundEnabled?: boolean
  onInspectItem: (item: PromptItem) => void
  isFavorite?: (promptId: string) => boolean
  onToggleFavorite?: (item: PromptItem) => void
  onDraftsChange?: (drafts: GapDraftRecord[]) => void
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

const FORMAT_TABS: ReadonlyArray<{ id: MacroFormat; label: string }> = [
  { id: 'json', label: 'JSON' },
  { id: 'sections', label: 'Seções' },
  { id: 'single_paragraph', label: 'Parágrafo' },
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

/**
 * Visual abstrato da Suíte Experimental preenchendo o card do Hero Banner (sem texto interno).
 */
const ExperimentalSuiteHeroBannerVisual: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative h-full min-h-[204px] w-full overflow-hidden rounded-2xl bg-canvas/90 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent)] lg:min-h-[228px]"
  >
    {/* Camada 1: Superfície, brilhos radiais e grade vetorial 24D preenchendo 100% do card */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient
          id="expSuiteGlowRosa"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(454 88) rotate(135) scale(280 144)"
        >
          <stop stopColor="var(--color-tier-s)" stopOpacity="0.34" />
          <stop offset="0.62" stopColor="var(--color-brand)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="expSuiteGlowIndigo"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(168 162) rotate(20) scale(244 114)"
        >
          <stop stopColor="var(--color-brand)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="240" fill="var(--color-surface)" />
      <rect width="640" height="240" fill="url(#expSuiteGlowRosa)" />
      <rect width="640" height="240" fill="url(#expSuiteGlowIndigo)" />

      {/* Grade vetorial 24D */}
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

    {/* Camada 2: Órbitas de colisão 24D, vetores opostos Polo A ↔ Antípoda B e nós */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hv-enter pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient
          id="expVectorAxis"
          x1="112"
          y1="176"
          x2="528"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-brand-bright)" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="var(--color-tier-s)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--color-tier-s-bright)" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Órbitas de colisão e ângulo de oposição */}
      <circle
        cx="320"
        cy="120"
        r="86"
        className="hero-viz-spin"
        stroke="var(--color-ink)"
        strokeOpacity="0.1"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <circle
        cx="320"
        cy="120"
        r="52"
        className="hv-exp-flash"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.28"
        strokeWidth="1"
      />

      {/* Vetores opostos Polo A ↔ Antípoda B */}
      <line
        x1="136"
        y1="172"
        x2="504"
        y2="68"
        stroke="url(#expVectorAxis)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="164"
        y1="72"
        x2="476"
        y2="168"
        stroke="var(--color-ink)"
        strokeOpacity="0.22"
        strokeWidth="1.35"
        strokeDasharray="3 3"
      />

      {/* Nós de colisão (6 slots convergindo ao centro) */}
      <circle
        cx="136"
        cy="172"
        r="5.5"
        className="hv-exp-a"
        fill="var(--color-brand-bright)"
      />
      <circle
        cx="136"
        cy="172"
        r="14"
        className="hv-exp-a"
        stroke="var(--color-brand-bright)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      <circle
        cx="504"
        cy="68"
        r="5.5"
        className="hv-exp-b"
        fill="var(--color-tier-s)"
      />
      <circle
        cx="504"
        cy="68"
        r="14"
        className="hv-exp-b"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.4"
        strokeWidth="1"
      />

      <circle
        cx="320"
        cy="120"
        r="8"
        className="hv-exp-flash"
        fill="var(--color-tier-s)"
        fillOpacity="0.24"
        stroke="var(--color-tier-s)"
        strokeWidth="1.5"
      />
      <circle cx="320" cy="120" r="2.8" fill="var(--color-ink)" />

      {/* 6 barras de fusão centralizadas na base */}
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <rect
          key={idx}
          x={268 + idx * 18}
          y={214}
          width={12}
          height={3.5}
          rx={1.75}
          fill={idx % 2 === 0 ? 'var(--color-tier-s)' : 'var(--color-ink)'}
          className="hv-exp-bar"
          style={{ animationDelay: `${idx * 90}ms` }}
          fillOpacity={idx % 2 === 0 ? 0.92 : 0.4}
        />
      ))}
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

export const ExperimentsView: React.FC<ExperimentsViewProps> = ({
  sourceLib,
  soundEnabled = true,
  onInspectItem,
  isFavorite,
  onToggleFavorite,
  onDraftsChange,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()

  const [variantMode, setVariantMode] = useState<ExperimentVariantMode>('antithesis')
  const [loadingSample, setLoadingSample] = useState(true)
  const [sampleError, setSampleError] = useState<string | null>(null)

  // Variante 1: Colisão de Antíteses
  const [poleA, setPoleA] = useState<PromptItem | null>(null)
  const [poleAPool, setPoleAPool] = useState<PromptItem[]>([])
  const [antipodes, setAntipodes] = useState<AntipodeCandidateItem[]>([])
  const [antipodeIdx, setAntipodeIdx] = useState(0)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('none')

  // Variante 2: Sonda de Deriva
  const [driftDonorA, setDriftDonorA] = useState<PromptItem | null>(null)
  const [driftDonorB, setDriftDonorB] = useState<PromptItem | null>(null)
  const [driftDonorC, setDriftDonorC] = useState<PromptItem | null>(null)
  const [driftPoolA, setDriftPoolA] = useState<PromptItem[]>([])
  const [driftPoolB, setDriftPoolB] = useState<PromptItem[]>([])
  const [driftIdxA, setDriftIdxA] = useState(0)
  const [driftIdxB, setDriftIdxB] = useState(0)
  const [lockedSlots, setLockedSlots] = useState<Partial<Record<CoreContentAttributeKey, boolean>>>(
    {}
  )

  // Síntese & Formato
  const [slotSources, setSlotSources] = useState<
    Record<CoreContentAttributeKey, ExperimentalSlotSource>
  >(defaultAntithesisSources)
  const [synthFormat, setSynthFormat] = useState<MacroFormat>('json')
  const [aspectRatio, setAspectRatio] = useState<string>('3:4')
  const [includeNegative, setIncludeNegative] = useState(true)
  const [draftText, setDraftText] = useState('')
  const [manuallyEdited, setManuallyEdited] = useState(false)

  // Telemetria ao vivo + Registro no Caderno
  const [preview, setPreview] = useState<DecomposePreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [savingExp, setSavingExp] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Refs para segmented control clip-path + navegação 0ms na lista
  const variantNavRef = useRef<HTMLDivElement | null>(null)
  const variantBtnRefs = useRef<Partial<Record<ExperimentVariantMode, HTMLButtonElement | null>>>({})
  const [variantClipInset, setVariantClipInset] = useState('inset(4px 50% 4px 4px round 9999px)')

  const formatNavRef = useRef<HTMLDivElement | null>(null)
  const formatBtnRefs = useRef<Partial<Record<MacroFormat, HTMLButtonElement | null>>>({})
  const [formatClipInset, setFormatClipInset] = useState('inset(3px 66% 3px 3px round 9999px)')

  const antipodeRefs = useRef<Array<HTMLButtonElement | null>>([])

  const loadSample = useCallback(
    async (
      mode: ExperimentVariantMode,
      opts?: { seedId?: string; playSound?: boolean; randomizeSlots?: boolean }
    ) => {
      setLoadingSample(true)
      setSampleError(null)
      try {
        const params = new URLSearchParams({ mode, sourceLib })
        if (opts?.seedId) params.set('seedId', opts.seedId)
        const res = await fetch(`/api/experiments/sample?${params.toString()}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = (await res.json()) as ExperimentSampleResponse

        if (data.mode === 'antithesis') {
          setPoleA(data.poleA)
          setPoleAPool(data.poleAPool)
          setAntipodes(data.antipodes)
          setAntipodeIdx(0)
          setSlotSources(defaultAntithesisSources())
        } else {
          setDriftDonorA(data.donorA)
          setDriftDonorB(data.donorB)
          setDriftDonorC(data.donorC)
          setDriftPoolA(data.poolA)
          setDriftPoolB(data.poolB)
          setDriftIdxA(0)
          setDriftIdxB(0)
          setSlotSources((prev) =>
            buildRandomDriftSources(
              opts?.randomizeSlots ? lockedSlots : {},
              prev,
              Boolean(data.donorC)
            )
          )
        }
        setManuallyEdited(false)
        setLoadingSample(false)
        if (opts?.playSound) {
          playGapRevealSound(soundEnabled)
        }
      } catch (err) {
        setSampleError(
          err instanceof Error ? err.message : 'Falha ao carregar amostra experimental.'
        )
        setLoadingSample(false)
      }
    },
    [sourceLib, lockedSlots, soundEnabled]
  )

  useEffect(() => {
    void loadSample(variantMode)
  }, [variantMode, sourceLib])

  const activePreset: AntithesisPreset | null = useMemo(
    () => ANTITHESIS_PRESETS.find((p) => p.id === selectedPresetId) || null,
    [selectedPresetId]
  )

  const currentAntipode: AntipodeCandidateItem | null =
    antipodes.length > 0 ? antipodes[antipodeIdx % antipodes.length] : null

  const activeDonorA = useMemo(() => {
    if (variantMode === 'antithesis') return poleA
    if (driftPoolA.length > 0) return driftPoolA[driftIdxA % driftPoolA.length]
    return driftDonorA
  }, [variantMode, poleA, driftPoolA, driftIdxA, driftDonorA])

  const activeDonorB = useMemo(() => {
    if (variantMode === 'antithesis') return currentAntipode?.item || null
    if (driftPoolB.length > 0) return driftPoolB[driftIdxB % driftPoolB.length]
    return driftDonorB
  }, [variantMode, currentAntipode, driftPoolB, driftIdxB, driftDonorB])

  const activeDonorC = variantMode === 'drift' ? driftDonorC : null

  useLayoutEffect(() => {
    const updateClip = () => {
      const nav = variantNavRef.current
      const btn = variantBtnRefs.current[variantMode]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setVariantClipInset(`inset(4px ${right}px 4px ${left}px round 9999px)`)
    }
    updateClip()
    const navEl = variantNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [variantMode])

  useLayoutEffect(() => {
    const updateFormatClip = () => {
      const nav = formatNavRef.current
      const btn = formatBtnRefs.current[synthFormat]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setFormatClipInset(`inset(3px ${right}px 3px ${left}px round 9999px)`)
    }
    updateFormatClip()
    const navEl = formatNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFormatClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [synthFormat])

  // Síntese automática quando não houver edição manual em andamento
  useEffect(() => {
    if (manuallyEdited || (!activeDonorA && !activeDonorB)) return
    const contrastTags =
      variantMode === 'antithesis' && activePreset
        ? [
            { axis: activePreset.axisA, tag: activePreset.tagA },
            { axis: activePreset.axisB, tag: activePreset.tagB },
          ]
        : []

    const modeLabel =
      variantMode === 'antithesis'
        ? activePreset
          ? `antithesis:${activePreset.id}`
          : 'antithesis:vector_24d'
        : 'drift:cross_project'

    const res = synthesizeExperimentalPrompt({
      modeLabel,
      donorA: activeDonorA,
      donorB: activeDonorB,
      donorC: activeDonorC,
      sources: slotSources,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      contrastTags,
    })
    setDraftText(res.rawPrompt)
  }, [
    variantMode,
    activePreset,
    activeDonorA,
    activeDonorB,
    activeDonorC,
    slotSources,
    synthFormat,
    aspectRatio,
    includeNegative,
    manuallyEdited,
  ])

  // Telemetria ao vivo (/api/decompose-preview)
  useEffect(() => {
    if (!draftText.trim()) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      const targetTags =
        variantMode === 'antithesis' && activePreset
          ? [activePreset.tagA, activePreset.tagB]
          : []

      const inheritedSet = new Set<string>()
      for (const slot of CORE_ATTR_SLOTS) {
        const src = slotSources[slot.key]
        const item =
          src === 'donor_c'
            ? activeDonorC
            : src === 'donor_b'
              ? activeDonorB
              : activeDonorA
        if (!item) continue
        for (const tg of item.attributes[slot.key].tags) inheritedSet.add(tg)
      }

      fetch('/api/decompose-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          rawPrompt: draftText,
          scope: 'all',
          targetTags,
          inheritedTags: Array.from(inheritedSet),
          knownGapZero: false,
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
  }, [
    draftText,
    variantMode,
    activePreset,
    activeDonorA,
    activeDonorB,
    activeDonorC,
    slotSources,
  ])

  const handleRecombineDriftSlots = () => {
    setSlotSources((prev) =>
      buildRandomDriftSources(lockedSlots, prev, Boolean(activeDonorC))
    )
    setManuallyEdited(false)
    playGapRevealSound(soundEnabled)
  }

  const handleSwapAntithesisSlots = () => {
    setSlotSources((prev) => {
      const next = { ...prev }
      for (const slot of CORE_ATTR_SLOTS) {
        if (prev[slot.key] === 'donor_a') next[slot.key] = 'donor_b'
        else if (prev[slot.key] === 'donor_b') next[slot.key] = 'donor_a'
      }
      return next
    })
    setManuallyEdited(false)
    playGapRevealSound(soundEnabled)
  }

  const handleSaveExperiment = async () => {
    if (!draftText.trim() || savingExp) return
    setSavingExp(true)
    try {
      const expTagA =
        variantMode === 'antithesis' && activePreset
          ? activePreset.tagA
          : activeDonorA?.project || 'polo_a'
      const expTagB =
        variantMode === 'antithesis' && activePreset
          ? activePreset.tagB
          : activeDonorB?.project || 'polo_b'
      const expTitle =
        variantMode === 'antithesis'
          ? `[Antítese] ${activePreset ? activePreset.title : `${activeDonorA?.project || 'Polo A'} × ${activeDonorB?.project || 'Polo B'}`}`
          : `[Deriva] ${activeDonorA?.project || 'A'} × ${activeDonorB?.project || 'B'}${activeDonorC ? ` × ${activeDonorC.project}` : ''}`

      const res = await fetch('/api/gap-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gapId: `exp:${variantMode}:${Date.now()}`,
          gapTitle: expTitle,
          scope: variantMode === 'antithesis' ? 'Colisão de Antíteses' : 'Sonda de Deriva',
          axisA: activePreset?.axisA || 'sujeito',
          tagA: expTagA,
          axisB: activePreset?.axisB || 'cenario',
          tagB: expTagB,
          donorAId: activeDonorA?.id || null,
          donorBId: activeDonorB?.id || null,
          macroFormat: preview?.attributes.estrutura.macroFormat || synthFormat,
          aspectRatio,
          attributeSources: slotSources,
          rawPrompt: draftText,
          rarityPercentile: preview?.rarity.percentile ?? 80,
          rarityTier: preview?.rarity.tier ?? 'A',
          rarityLabel: preview?.rarity.label ?? 'mais raro que 80% da coleção',
          maturityScore: preview?.maturity.score ?? 72,
          quadrant: preview?.quadrant ?? 'raro_maduro',
          filledAttributesCount: preview?.attributes.estrutura.filledAttributesCount ?? 8,
        }),
      })
      if (res.ok) {
        const payload = (await res.json().catch(() => null)) as { drafts?: GapDraftRecord[] } | null
        if (payload?.drafts && Array.isArray(payload.drafts)) {
          onDraftsChange?.(payload.drafts)
        }
        setJustSaved(true)
        playTierSChime(soundEnabled)
        window.setTimeout(() => setJustSaved(false), 1800)
      }
    } finally {
      setSavingExp(false)
    }
  }

  const handleExport = (kind: 'json' | 'md') => {
    if (!draftText.trim()) return
    const slug = `${variantMode}_${Date.now()}`
    if (kind === 'json') {
      triggerFileDownload(
        `${slug}.json`,
        JSON.stringify(
          {
            experimentalMode: variantMode,
            preset: activePreset,
            donorAId: activeDonorA?.id || null,
            donorBId: activeDonorB?.id || null,
            donorCId: activeDonorC?.id || null,
            sources: slotSources,
            rarity: preview?.rarity || null,
            maturity: preview?.maturity || null,
            rawPrompt: draftText,
          },
          null,
          2
        ),
        'application/json'
      )
    } else {
      const md = [
        `# Experimento (${variantMode === 'antithesis' ? 'Colisão de Antíteses' : 'Sonda de Deriva'})`,
        ``,
        `- **Polo / Doador A:** ${activeDonorA?.title || 'N/A'} (${activeDonorA?.project || ''})`,
        `- **Polo / Doador B:** ${activeDonorB?.title || 'N/A'} (${activeDonorB?.project || ''})`,
        `- **Simulação:** ${preview ? `Tier ${preview.rarity.tier} · ${preview.rarity.label} · MAT ${preview.maturity.score}/100` : 'Pendente'}`,
        ``,
        `## Prompt Experimental`,
        ``,
        '```',
        draftText,
        '```',
      ].join('\n')
      triggerFileDownload(`${slug}.md`, md, 'text/markdown;charset=utf-8')
    }
  }

  // Navegação por teclado ↑↓ nos candidatos antípodas: 0ms de animação (emil-design-eng)
  const handleAntipodeListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (antipodes.length === 0) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const current = antipodeIdx % antipodes.length
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const nextIdx = Math.max(0, Math.min(antipodes.length - 1, current + delta))
    if (nextIdx === current) return
    setAntipodeIdx(nextIdx)
    setManuallyEdited(false)
    antipodeRefs.current[nextIdx]?.scrollIntoView({ block: 'nearest' })
  }

  const slotCountsBySource = useMemo(() => {
    const counts: Record<ExperimentalSlotSource, number> = {
      donor_a: 0,
      donor_b: 0,
      donor_c: 0,
    }
    for (const slot of CORE_ATTR_SLOTS) {
      counts[slotSources[slot.key]] += 1
    }
    return counts
  }, [slotSources])

  const lockedCount = useMemo(
    () => Object.values(lockedSlots).filter(Boolean).length,
    [lockedSlots]
  )

  const driftDonorEntries = useMemo(
    () =>
      [
        {
          key: 'donor_a' as const,
          role: 'DOADOR A',
          item: activeDonorA,
          canCycle: driftPoolA.length > 1,
          onCycle: () => {
            setDriftIdxA((i) => i + 1)
            setManuallyEdited(false)
          },
        },
        {
          key: 'donor_b' as const,
          role: 'DOADOR B',
          item: activeDonorB,
          canCycle: driftPoolB.length > 1,
          onCycle: () => {
            setDriftIdxB((i) => i + 1)
            setManuallyEdited(false)
          },
        },
        ...(activeDonorC
          ? [
              {
                key: 'donor_c' as const,
                role: 'DOADOR C · 3º PROJETO',
                item: activeDonorC,
                canCycle: false,
                onCycle: () => {},
              },
            ]
          : []),
      ] as const,
    [activeDonorA, activeDonorB, activeDonorC, driftPoolA.length, driftPoolB.length]
  )

  const rarityPct = Math.round(preview?.rarity.percentile ?? 0)
  const maturityPct = Math.round(preview?.maturity.score ?? 0)
  const thirdMetricLabel = variantMode === 'antithesis' ? 'Tensão 24D' : 'Cobertura Slots'
  const thirdMetricPct =
    variantMode === 'antithesis' && currentAntipode
      ? Math.min(100, Math.round((currentAntipode.angularDeg / 180) * 100))
      : Math.round(((preview?.attributes.estrutura.filledAttributesCount ?? 0) / 8) * 100)

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 p-4 sm:p-6">
      {/* Hero Banner da Suíte Experimental (Texto + 2 CTAs à esquerda · Visual 24D preenchendo o card à direita) */}
      <header className="relative overflow-hidden rounded-[22px] bg-surface p-6 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-ink)_5%,transparent)] sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-5 lg:col-span-5">
            <div className="space-y-2.5">
              <span className="section-eyebrow">
                Suíte Criativa · Sondagem de Fronteiras &amp; Tensão Estética
              </span>
              <h1 className="text-[22px] font-medium tracking-[-0.025em] text-ink sm:text-[26px]">
                Laboratório Experimental de Combinações
              </h1>
              <p className="max-w-xl text-[13px] leading-relaxed text-ink-tertiary">
                Dois motores experimentais fora da matriz tradicional de Gaps: colisão vetorial de
                antíteses em 24 dimensões e sonda de deriva cross-projeto com travas individuais por
                atributo.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loadingSample}
                onClick={() =>
                  void loadSample(variantMode, {
                    playSound: true,
                    randomizeSlots: variantMode === 'drift',
                  })
                }
                className="lab-pressable inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-tier-s px-4 text-[12px] font-semibold text-canvas [@media(hover:hover)]:hover:brightness-105 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
              >
                {variantMode === 'antithesis' ? (
                  <Split className="h-3.5 w-3.5" />
                ) : (
                  <Compass className="h-3.5 w-3.5" />
                )}
                <span>
                  {loadingSample
                    ? variantMode === 'antithesis'
                      ? 'Sondando vetores...'
                      : 'Sondando acervo...'
                    : variantMode === 'antithesis'
                      ? 'Colidir novos polos 24D'
                      : 'Sondar nova deriva'}
                </span>
              </button>

              <button
                type="button"
                disabled={loadingSample || (!activeDonorA && !activeDonorB)}
                onClick={
                  variantMode === 'drift' ? handleRecombineDriftSlots : handleSwapAntithesisSlots
                }
                className="lab-pressable inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-ink/85 px-4 text-[12px] font-medium text-canvas [@media(hover:hover)]:hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>
                  {variantMode === 'drift' ? 'Recombinar slots' : 'Inverter polos A↔B'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex w-full lg:col-span-7">
            <ExperimentalSuiteHeroBannerVisual />
          </div>
        </div>
      </header>

      {sampleError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/35 bg-danger/[0.06] p-4">
          <span className="font-mono text-[12px] text-ink-secondary">{sampleError}</span>
          <button
            type="button"
            onClick={() => void loadSample(variantMode)}
            className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink [@media(hover:hover)]:hover:bg-surface-hover cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : null}

      {/* Grid Principal: 2 colunas direto sobre bg-canvas (sem caixas envoltórias) */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Coluna Esquerda: Motores de Exploração + Segmented Clip-Path + Cards com Imagem Gradiente */}
        <section className="flex flex-col gap-3.5 lg:sticky lg:top-4 lg:col-span-5 lg:max-h-[calc(100dvh-132px)]">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">
                Motores de Exploração
              </h2>
              {variantMode === 'antithesis' && antipodes.length > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-ink-muted">
                  <ArrowUpDown className="h-2.5 w-2.5" />
                  <span>↑↓ navegar</span>
                </span>
              ) : (
                <span className="tabular-mono font-mono text-[10px] text-ink-muted">
                  {lockedCount}/6 travados
                </span>
              )}
            </div>
            <p className="truncate text-[12px] text-ink-tertiary">
              {variantMode === 'antithesis'
                ? 'Variante 1 · Oposição Vetorial 24D · Polo A vs. antípodas distantes'
                : `Variante 2 · Recombinação Cross-Projeto · ${driftDonorEntries.length} doadores`}
            </p>
          </div>

          {/* Segmented control das variantes com recorte clip-path */}
          <div
            ref={variantNavRef}
            role="tablist"
            aria-label="Motores experimentais"
            className="relative grid grid-cols-2 rounded-full bg-surface p-1"
          >
            {(
              [
                { id: 'antithesis' as const, label: 'Colisão de Antíteses', Icon: Split },
                { id: 'drift' as const, label: 'Sonda de Deriva', Icon: Shuffle },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                ref={(el) => {
                  variantBtnRefs.current[id] = el
                }}
                type="button"
                role="tab"
                aria-selected={variantMode === id}
                onClick={() => setVariantMode(id)}
                className="lab-pressable flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-ink-tertiary [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}

            <div
              aria-hidden="true"
              style={{ clipPath: variantClipInset }}
              className="pointer-events-none absolute inset-0 grid grid-cols-2 p-1 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
            >
              {(
                [
                  { id: 'antithesis' as const, label: 'Colisão de Antíteses', Icon: Split },
                  { id: 'drift' as const, label: 'Sonda de Deriva', Icon: Shuffle },
                ] as const
              ).map(({ id, label, Icon }) => (
                <span
                  key={id}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-canvas"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
              ))}
            </div>
          </div>

          {variantMode === 'antithesis' ? (
            <>
              {/* Eixos contrastantes compactos */}
              <div className="space-y-2 rounded-2xl bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow">Eixos Contrastantes</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPresetId('none')
                      setManuallyEdited(false)
                    }}
                    className={[
                      'lab-pressable rounded-full px-2.5 py-0.5 font-mono text-[10px] cursor-pointer',
                      selectedPresetId === 'none'
                        ? 'bg-ink text-canvas font-semibold'
                        : 'bg-elevated text-ink-tertiary [@media(hover:hover)]:hover:text-ink',
                    ].join(' ')}
                  >
                    24D Puro
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {ANTITHESIS_PRESETS.map((preset) => {
                    const active = selectedPresetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.tensionNote}
                        onClick={() => {
                          setSelectedPresetId(active ? 'none' : preset.id)
                          setManuallyEdited(false)
                        }}
                        className={[
                          'lab-pressable-subtle truncate rounded-xl border px-2.5 py-1.5 text-left text-[10px] font-medium cursor-pointer',
                          active
                            ? 'border-tier-s/60 bg-tier-s/12 text-ink'
                            : 'border-hairline/70 bg-canvas/70 text-ink-tertiary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink',
                        ].join(' ')}
                      >
                        {preset.title}
                      </button>
                    )
                  })}
                </div>

                {activePreset ? (
                  <p className="text-[11px] leading-snug text-ink-secondary">
                    {activePreset.tensionNote}
                  </p>
                ) : null}
              </div>

              {/* Lista de Antípodas 24D com Imagem Gradiente */}
              <div
                tabIndex={0}
                role="listbox"
                aria-label="Antípodas vetoriais 24D"
                onKeyDown={handleAntipodeListKeyDown}
                className="flex-1 space-y-2.5 overflow-y-auto pr-1.5 pb-2 focus:outline-none"
              >
                {antipodes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-hairline bg-surface p-6 text-center font-mono text-[11px] text-ink-muted">
                    {loadingSample
                      ? 'Calculando antípodas nos vetores 24D...'
                      : 'Nenhum antípoda disponível.'}
                  </div>
                ) : (
                  antipodes.map((cand, idx) => {
                    const isSel = idx === antipodeIdx % antipodes.length
                    const surfaceToken = isSel ? 'var(--color-elevated)' : 'var(--color-surface)'
                    const semanticTitle = getPromptSemanticTitle(cand.item)

                    return (
                      <button
                        key={cand.item.id}
                        ref={(el) => {
                          antipodeRefs.current[idx] = el
                        }}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => {
                          setAntipodeIdx(idx)
                          setManuallyEdited(false)
                        }}
                        className={[
                          'lab-pressable-subtle group relative flex min-h-[86px] w-full flex-col justify-between overflow-hidden rounded-[18px] p-3.5 text-left cursor-pointer',
                          isSel
                            ? 'bg-elevated ring-1 ring-inset ring-ink/35'
                            : 'bg-surface [@media(hover:hover)]:hover:bg-surface-hover',
                        ].join(' ')}
                      >
                        {/* Imagem do antípoda à direita com máscara gradiente */}
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
                            src={cand.item.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            fallbackLabel="·"
                            className="h-full w-full object-cover object-center opacity-70"
                            fallbackClassName="h-full w-full bg-gradient-to-br from-transparent via-brand/15 to-tier-s/20"
                          />
                        </div>

                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background: `linear-gradient(90deg, ${surfaceToken} 0%, ${surfaceToken} 34%, color-mix(in srgb, ${surfaceToken} 68%, transparent) 66%, color-mix(in srgb, ${surfaceToken} 18%, transparent) 100%)`,
                          }}
                        />

                        <div className="relative z-10 flex w-full items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium text-ink">
                              {cand.item.project}
                            </div>
                            <div className="mt-0.5 max-w-[78%] truncate text-[11px] text-ink-secondary">
                              {semanticTitle}
                            </div>
                          </div>

                          <span className="tabular-mono shrink-0 rounded-full bg-tier-s px-2 py-0.5 text-[9px] font-semibold text-canvas">
                            TIER {cand.item.rarity.tier} · {cand.angularDeg}°
                          </span>
                        </div>

                        <div className="relative z-10 mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-ink-tertiary">
                          <span className="tabular-mono">
                            cos θ = {cand.cosineSim.toFixed(3)} · C
                            {String(cand.item.mapClusterId ?? 1).padStart(2, '0')}
                          </span>
                          <span className="tabular-mono text-ink-secondary">
                            P{cand.item.rarity.percentile}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1.5 pb-2">
              {driftDonorEntries.map((entry) => {
                const donor = entry.item
                if (!donor) return null
                const usedCount = slotCountsBySource[entry.key]
                const semanticTitle = getPromptSemanticTitle(donor)

                return (
                  <div
                    key={entry.key}
                    className={[
                      'group relative flex min-h-[92px] w-full flex-col justify-between overflow-hidden rounded-[18px] p-3.5 text-left',
                      usedCount > 0
                        ? 'bg-elevated ring-1 ring-inset ring-tier-s/45'
                        : 'bg-surface',
                    ].join(' ')}
                  >
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
                        src={donor.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        fallbackLabel="·"
                        className="h-full w-full object-cover object-center opacity-70"
                        fallbackClassName="h-full w-full bg-gradient-to-br from-transparent via-brand/15 to-tier-s/20"
                      />
                    </div>

                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: `linear-gradient(90deg, ${
                          usedCount > 0 ? 'var(--color-elevated)' : 'var(--color-surface)'
                        } 0%, ${
                          usedCount > 0 ? 'var(--color-elevated)' : 'var(--color-surface)'
                        } 34%, color-mix(in srgb, ${
                          usedCount > 0 ? 'var(--color-elevated)' : 'var(--color-surface)'
                        } 68%, transparent) 66%, color-mix(in srgb, ${
                          usedCount > 0 ? 'var(--color-elevated)' : 'var(--color-surface)'
                        } 18%, transparent) 100%)`,
                      }}
                    />

                    <div className="relative z-10 flex w-full items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
                          {entry.role}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] font-medium text-ink">
                          {donor.project}
                        </div>
                        <div className="max-w-[78%] truncate text-[11px] text-ink-secondary">
                          {semanticTitle}
                        </div>
                      </div>

                      <span
                        className={[
                          'tabular-mono shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold',
                          usedCount > 0
                            ? 'bg-tier-s text-canvas'
                            : 'bg-canvas/85 text-ink-tertiary',
                        ].join(' ')}
                      >
                        TIER {donor.rarity.tier} · {usedCount}/6 slots
                      </span>
                    </div>

                    <div className="relative z-10 mt-2.5 flex items-center justify-between gap-2">
                      <span className="tabular-mono font-mono text-[10px] text-ink-tertiary">
                        P{donor.rarity.percentile} · MAT {Math.round(donor.maturity.score)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {entry.canCycle ? (
                          <button
                            type="button"
                            onClick={entry.onCycle}
                            className="lab-pressable inline-flex items-center gap-1 rounded-full bg-canvas/85 px-2.5 py-0.5 text-[10px] font-medium text-ink-secondary [@media(hover:hover)]:hover:text-ink cursor-pointer"
                          >
                            <RefreshCw className="h-2.5 w-2.5" />
                            <span>Trocar</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onInspectItem(donor)}
                          className="lab-pressable inline-flex items-center gap-1 rounded-full bg-canvas/85 px-2.5 py-0.5 text-[10px] font-medium text-ink-secondary [@media(hover:hover)]:hover:text-ink cursor-pointer"
                        >
                          <Maximize2 className="h-2.5 w-2.5" />
                          <span>8 ATR</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              <div className="space-y-2 rounded-2xl bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular-mono font-mono text-[11px] text-ink-secondary">
                    Slots travados: {lockedCount}/6
                  </span>
                  {lockedCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setLockedSlots({})}
                      className="lab-pressable rounded-full bg-elevated px-2.5 py-0.5 font-mono text-[10px] text-ink-secondary [@media(hover:hover)]:hover:text-ink cursor-pointer"
                    >
                      Destravar todos
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] leading-relaxed text-ink-tertiary">
                  Use o cadeado nos 6 atributos da Matriz de Fusão para fixar peças promissoras ao
                  recombinar novos doadores.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Coluna Direita: Arena de Experimentação (direto no bg-canvas) */}
        <section className="flex flex-col gap-6 lg:col-span-7">
          {/* Cabeçalho da Arena */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[24px] font-normal tracking-[-0.025em] text-ink sm:text-[28px]">
                Arena de Experimentação
              </h2>

              {variantMode === 'antithesis' && currentAntipode ? (
                <span className="tabular-mono inline-flex items-center gap-1.5 rounded-full bg-tier-s px-3 py-1 text-[10px] font-semibold text-canvas">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>
                    Oposição 24D: {currentAntipode.angularDeg}° · cos θ ={' '}
                    {currentAntipode.cosineSim.toFixed(3)}
                  </span>
                </span>
              ) : (
                <span className="tabular-mono inline-flex items-center gap-1.5 rounded-full bg-tier-s px-3 py-1 text-[10px] font-semibold text-canvas">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>Deriva Cross-Projeto · {lockedCount}/6 travados</span>
                </span>
              )}
            </div>

            <p className="text-[13px] text-ink-tertiary">
              {variantMode === 'antithesis'
                ? activePreset
                  ? `Eixo ativo: ${activePreset.title} — ${activePreset.tensionNote}`
                  : currentAntipode
                    ? `Cluster ${String(poleA?.mapClusterId ?? 1).padStart(2, '0')} em colisão máxima contra Cluster ${String(currentAntipode.item.mapClusterId ?? 1).padStart(2, '0')}.`
                    : 'Selecionando pares semanticamente opostos em 24 dimensões.'
                : 'Cruzamento experimental entre projetos distintos preservando slots travados.'}
            </p>
          </div>

          {/* 3 Barras de Telemetria Limpas */}
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            <MetricCounterBar label="Raridade Estimada" targetPct={rarityPct} />
            <MetricCounterBar label="Maturidade Estrutural" targetPct={maturityPct} />
            <MetricCounterBar label={thirdMetricLabel} targetPct={thirdMetricPct} />
          </div>

          {/* Palco das 2 Cartas Verticais sem Borda/Stroke */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {(
              [
                {
                  donorKey: 'donor_a' as const,
                  role: variantMode === 'antithesis' ? 'POLO A (ÂNCORA)' : 'DOADOR A',
                  item: activeDonorA,
                  canCycle:
                    variantMode === 'antithesis' ? poleAPool.length > 1 : driftPoolA.length > 1,
                  onCycle: () => {
                    if (variantMode === 'antithesis') {
                      const nextSeed = poleAPool.find((p) => p.id !== poleA?.id)
                      if (nextSeed) void loadSample('antithesis', { seedId: nextSeed.id })
                    } else {
                      setDriftIdxA((i) => i + 1)
                      setManuallyEdited(false)
                    }
                  },
                },
                {
                  donorKey: 'donor_b' as const,
                  role: variantMode === 'antithesis' ? 'POLO B (ANTÍPODA)' : 'DOADOR B',
                  item: activeDonorB,
                  canCycle:
                    variantMode === 'antithesis' ? antipodes.length > 1 : driftPoolB.length > 1,
                  onCycle: () => {
                    if (variantMode === 'antithesis') {
                      setAntipodeIdx((i) => i + 1)
                    } else {
                      setDriftIdxB((i) => i + 1)
                    }
                    setManuallyEdited(false)
                  },
                },
              ] as const
            ).map(({ donorKey, role, item, canCycle, onCycle }) => {
              const semanticTitle = item ? getPromptSemanticTitle(item) : 'Carregando...'
              const contributedCount = slotCountsBySource[donorKey]

              return (
                <div key={role} className="flex flex-col gap-3">
                  {/* Topo da Carta: Rótulo discreto + Pílula rosa */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular-mono text-[11px] font-medium tracking-wider text-ink-tertiary">
                      {role}
                    </span>

                    {item ? (
                      <span className="tabular-mono rounded-full bg-tier-s px-2.5 py-0.5 text-[10px] font-semibold text-canvas">
                        TIER {item.rarity.tier} · P{item.rarity.percentile}
                      </span>
                    ) : (
                      <span className="tabular-mono rounded-full bg-surface px-2.5 py-0.5 text-[10px] text-ink-muted">
                        Carregando
                      </span>
                    )}
                  </div>

                  {/* Imagem vertical 3:4 limpa, SEM borda ou stroke */}
                  <div className="aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-surface">
                    <PromptThumb
                      src={item?.thumbnailUrl}
                      alt={item?.title ?? role}
                      loading="eager"
                      fallbackLabel={donorKey === 'donor_a' ? 'A' : 'B'}
                    />
                  </div>

                  {/* 6 pips horizontais de slots herdados centralizados abaixo da imagem */}
                  <div
                    className="mx-auto flex w-full max-w-[232px] items-center justify-center gap-1.5 pt-0.5"
                    aria-label={`${role}: doador de ${contributedCount} de 6 slots`}
                  >
                    {CORE_ATTR_SLOTS.map((slot) => {
                      const isUsed = slotSources[slot.key] === donorKey
                      const isFilled = Boolean(item?.attributes[slot.key].filled)
                      return (
                        <span
                          key={slot.key}
                          title={`${slot.label}: ${
                            !isFilled
                              ? 'vazio nesta carta'
                              : isUsed
                                ? 'herdado desta carta na fusão'
                                : 'disponível (herdado de outro polo)'
                          }`}
                          className={[
                            'h-1.5 flex-1 rounded-full',
                            !isFilled
                              ? 'bg-ink/[0.14]'
                              : isUsed
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
                    {item ? (
                      <>
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
                      </>
                    ) : (
                      <p className="font-mono text-[11px] text-ink-muted">
                        Hidratando atributos do SQLite...
                      </p>
                    )}

                    {contributedCount > 0 ? (
                      <div className="pt-1">
                        <span className="tabular-mono inline-flex items-center rounded-full bg-tier-s px-2.5 py-0.5 text-[10px] font-semibold text-canvas">
                          Doador de {contributedCount}/6 slots
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Ações da Carta: Inspecionar, Trocar + Favorito */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!item}
                        onClick={() => item && onInspectItem(item)}
                        className="lab-pressable inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>Inspecionar</span>
                      </button>

                      {canCycle ? (
                        <button
                          type="button"
                          onClick={onCycle}
                          className="lab-pressable inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Trocar</span>
                        </button>
                      ) : null}
                    </div>

                    {item && onToggleFavorite ? (
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

          {/* Bloco Inferior 1: Matriz de Fusão Experimental dos 6 Atributos (borda rosa sutil) */}
          <div className="space-y-4 rounded-[22px] border border-tier-s/35 bg-tier-s/[0.04] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="section-eyebrow text-tier-s-bright">
                  Fusão Experimental de Atributos
                </span>
                <p className="mt-0.5 text-[12px] text-ink-tertiary">
                  Alterne a origem de cada slot entre A, B{activeDonorC ? ' e C' : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Seletor de Formato com clip-path */}
                <div
                  ref={formatNavRef}
                  role="tablist"
                  aria-label="Formato do prompt experimental"
                  className="relative inline-grid grid-cols-3 rounded-full bg-surface p-0.5"
                >
                  {FORMAT_TABS.map((fmt) => (
                    <button
                      key={fmt.id}
                      ref={(el) => {
                        formatBtnRefs.current[fmt.id] = el
                      }}
                      type="button"
                      role="tab"
                      aria-selected={synthFormat === fmt.id}
                      onClick={() => {
                        setSynthFormat(fmt.id)
                        setManuallyEdited(false)
                      }}
                      className="lab-pressable rounded-full px-2.5 py-1 font-mono text-[10px] font-medium text-ink-tertiary [@media(hover:hover)]:hover:text-ink cursor-pointer"
                    >
                      {fmt.label}
                    </button>
                  ))}

                  <div
                    aria-hidden="true"
                    style={{ clipPath: formatClipInset }}
                    className="pointer-events-none absolute inset-0 grid grid-cols-3 p-0.5 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
                  >
                    {FORMAT_TABS.map((fmt) => (
                      <span
                        key={fmt.id}
                        className="flex items-center justify-center rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] font-semibold text-canvas"
                      >
                        {fmt.label}
                      </span>
                    ))}
                  </div>
                </div>

                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    setAspectRatio(e.target.value)
                    setManuallyEdited(false)
                  }}
                  className="rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-[10px] text-ink-secondary focus:border-border-strong focus:outline-none cursor-pointer"
                  aria-label="Proporção"
                >
                  {ASPECT_OPTIONS.map((ar) => (
                    <option key={ar} value={ar}>
                      AR {ar}
                    </option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-[10px] text-ink-secondary cursor-pointer">
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
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {CORE_ATTR_SLOTS.map((slot) => {
                const currentSource = slotSources[slot.key]
                const isLocked = Boolean(lockedSlots[slot.key])
                const selectedItem =
                  currentSource === 'donor_c'
                    ? activeDonorC
                    : currentSource === 'donor_b'
                      ? activeDonorB
                      : activeDonorA
                const snippet = selectedItem?.attributes[slot.key].text?.trim() || 'Fallback editorial'

                const options: Array<{ id: ExperimentalSlotSource; label: string }> = activeDonorC
                  ? [
                      { id: 'donor_a', label: 'A' },
                      { id: 'donor_b', label: 'B' },
                      { id: 'donor_c', label: 'C' },
                    ]
                  : [
                      { id: 'donor_a', label: 'Polo A' },
                      { id: 'donor_b', label: 'Polo B' },
                    ]

                return (
                  <div
                    key={slot.key}
                    className={[
                      'flex flex-col justify-between gap-2 rounded-2xl border p-3 transition-colors [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]',
                      isLocked
                        ? 'border-tier-s/60 bg-tier-s/[0.08]'
                        : 'border-hairline/70 bg-canvas/80',
                    ].join(' ')}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink">
                          {slot.short} · {slot.label}
                        </span>
                        {variantMode === 'drift' ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLockedSlots((prev) => ({
                                ...prev,
                                [slot.key]: !prev[slot.key],
                              }))
                            }
                            className="lab-pressable flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink-tertiary [@media(hover:hover)]:hover:text-tier-s cursor-pointer"
                            title={isLocked ? 'Destravar atributo' : 'Travar atributo na deriva'}
                            aria-label={isLocked ? `Destravar ${slot.label}` : `Travar ${slot.label}`}
                          >
                            {isLocked ? (
                              <Lock className="h-3 w-3 text-tier-s" />
                            ) : (
                              <Unlock className="h-3 w-3" />
                            )}
                          </button>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 font-mono text-[10px] leading-relaxed text-ink-tertiary">
                        {snippet}
                      </p>
                    </div>

                    <div
                      className={[
                        'grid gap-1',
                        options.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
                      ].join(' ')}
                    >
                      {options.map((opt) => {
                        const active = currentSource === opt.id
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSlotSources((prev) => ({ ...prev, [slot.key]: opt.id }))
                              setManuallyEdited(false)
                            }}
                            className={[
                              'lab-pressable rounded-full py-1 font-mono text-[10px] font-medium cursor-pointer',
                              active
                                ? 'bg-tier-s text-canvas font-semibold'
                                : 'bg-surface text-ink-tertiary [@media(hover:hover)]:hover:text-ink',
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

            {activePreset && variantMode === 'antithesis' ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-tier-s/40 bg-tier-s/[0.06] px-3 py-2 font-mono text-[10px] text-tier-s-bright">
                <span className="uppercase tracking-wider text-tier-s">Tensão injetada:</span>
                <span>
                  {formatTagPt(activePreset.tagA)} × {formatTagPt(activePreset.tagB)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Bloco Inferior 2: Editor do Prompt Experimental, Telemetria ao Vivo & Ações */}
          <div className="space-y-3.5 rounded-[22px] bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="section-eyebrow">Prompt Experimental Gerado</span>
                {manuallyEdited ? (
                  <span className="rounded-full bg-tier-s/15 px-2 py-0.5 font-mono text-[9px] font-medium text-tier-s">
                    editado manualmente
                  </span>
                ) : null}
              </div>

              <span className="tabular-mono font-mono text-[10px] text-ink-muted">
                {preview
                  ? `${preview.attributes.estrutura.filledAttributesCount}/8 atr. · ${preview.attributes.estrutura.tokenCount} tok`
                  : previewLoading
                    ? 'Analisando...'
                    : 'Aguardando fusão'}
              </span>
            </div>

            <textarea
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value)
                setManuallyEdited(true)
              }}
              rows={synthFormat === 'json' ? 11 : 8}
              spellCheck={false}
              aria-label="Prompt experimental gerado"
              className="w-full rounded-xl border border-hairline/70 bg-canvas p-3.5 font-mono text-[11px] leading-relaxed text-ink focus:border-border-strong focus:outline-none"
            />

            {/* Telemetria ao vivo */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas px-3.5 py-2.5 font-mono text-[11px]">
              {preview ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      TIER_COLOR_META[preview.rarity.tier].badgeClass,
                    ].join(' ')}
                  >
                    TIER {preview.rarity.tier}
                  </span>
                  <span className={TIER_COLOR_META[preview.rarity.tier].textClass}>
                    {preview.rarity.label}
                  </span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-ink">MAT {Math.round(preview.maturity.score)}</span>
                  <span className="text-ink-tertiary">
                    ({QUADRANT_META[preview.quadrant].label})
                  </span>
                </div>
              ) : (
                <span className="text-ink-muted">
                  {previewLoading ? 'Calculando raridade da fusão...' : 'Aguardando fusão.'}
                </span>
              )}
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManuallyEdited(false)}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Regenerar fusão</span>
                </button>

                <button
                  type="button"
                  onClick={() => void copyText(draftText, 'exp-prompt')}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                >
                  {copiedKey === 'exp-prompt' ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedKey === 'exp-prompt' ? 'Copiado' : 'Copiar prompt'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExport('md')}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-elevated px-3 font-mono text-[10px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>.MD</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-elevated px-3 font-mono text-[10px] font-medium text-ink-secondary [@media(hover:hover)]:hover:bg-surface-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>.JSON</span>
                </button>

                <button
                  type="button"
                  disabled={savingExp || !draftText.trim()}
                  onClick={() => void handleSaveExperiment()}
                  className="lab-pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-tier-s px-4 text-[12px] font-semibold text-canvas [@media(hover:hover)]:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                >
                  {justSaved ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  <span>
                    {savingExp
                      ? 'Registrando...'
                      : justSaved
                        ? 'Registrado no Caderno'
                        : 'Registrar experimento'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
