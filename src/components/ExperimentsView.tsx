import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Compass,
  Copy,
  Download,
  FlaskConical,
  Lock,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Split,
  Unlock,
} from 'lucide-react'
import {
  ANTITHESIS_PRESETS,
  buildRandomDriftSources,
  defaultAntithesisSources,
  synthesizeExperimentalPrompt,
  type AntithesisPreset,
} from '../core/experimentalFusion'
import { formatTagPt } from '../core/promptTagsPt'
import { QUADRANT_META, TIER_COLOR_META } from '../core/rarityEngine'
import { playGapRevealSound, playTierSChime } from '../core/soundFeedback'
import { useCopyFeedback } from '../hooks/useCopyFeedback'
import type {
  AntipodeCandidateItem,
  CoreContentAttributeKey,
  DecomposePreviewResponse,
  ExperimentalSlotSource,
  ExperimentSampleResponse,
  ExperimentVariantMode,
  MacroFormat,
  PromptItem,
  SourceLibFilter,
} from '../types/promptEngine'
import { PromptThumb } from './PromptThumb'

interface ExperimentsViewProps {
  sourceLib: SourceLibFilter
  soundEnabled?: boolean
  onInspectItem: (item: PromptItem) => void
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
  { id: 'single_paragraph', label: 'Parágrafo Único' },
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

export const ExperimentsView: React.FC<ExperimentsViewProps> = ({
  sourceLib,
  soundEnabled = true,
  onInspectItem,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()

  const [variantMode, setVariantMode] = useState<ExperimentVariantMode>('antithesis')
  const [loadingSample, setLoadingSample] = useState(true)
  const [sampleError, setSampleError] = useState<string | null>(null)

  // Estado Variante 1: Colisão de Antíteses
  const [poleA, setPoleA] = useState<PromptItem | null>(null)
  const [poleAPool, setPoleAPool] = useState<PromptItem[]>([])
  const [antipodes, setAntipodes] = useState<AntipodeCandidateItem[]>([])
  const [antipodeIdx, setAntipodeIdx] = useState(0)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('none')

  // Estado Variante 2: Sonda de Deriva
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

  const isDonorAActive = Object.values(slotSources).includes('donor_a')
  const isDonorBActive = Object.values(slotSources).includes('donor_b')
  const isDonorCActive = Object.values(slotSources).includes('donor_c')

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-purple-400/50 bg-purple-500/10 px-2 py-0.5 text-[9px] font-medium tracking-wider text-purple-300">
              <FlaskConical className="h-3 w-3" />
              EXPERIMENTAL · ISOLADO DO GAPS
            </span>
            <span className="section-eyebrow">
              Sondagem de Fronteiras &amp; Tensão Estética
            </span>
          </div>
          <h1 className="mt-1.5 text-xl font-medium tracking-tight text-zinc-100">
            Laboratório Experimental de Combinações
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Dois motores experimentais para explorar territórios fora da matriz tradicional de Gaps, sem alterar o fluxo principal.
          </p>
        </div>

        {/* Seletor entre as 2 novas variantes */}
        <nav
          className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#0c0c0f] p-1"
          aria-label="Variantes experimentais"
        >
          <button
            type="button"
            data-active={variantMode === 'antithesis'}
            onClick={() => setVariantMode('antithesis')}
            className="btn-ghost text-[12px]"
          >
            <Split className="h-3.5 w-3.5" />
            <span>Colisão de Antíteses</span>
          </button>
          <button
            type="button"
            data-active={variantMode === 'drift'}
            onClick={() => setVariantMode('drift')}
            className="btn-ghost text-[12px]"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span>Sonda de Deriva</span>
          </button>
        </nav>
      </header>

      {sampleError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.1] bg-[#101013] p-4">
          <span className="font-mono text-[12px] text-zinc-300">{sampleError}</span>
          <button
            type="button"
            onClick={() => void loadSample(variantMode)}
            className="btn-secondary text-[12px]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Coluna Esquerda: Controles específicos da Variante */}
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 lg:col-span-4">
          {variantMode === 'antithesis' ? (
            <>
              <div className="space-y-1 border-b border-white/[0.07] pb-3">
                <span className="section-eyebrow">Variante 1 · Oposição Vetorial 24D</span>
                <h2 className="text-[15px] font-medium text-zinc-100">Colisão de Antíteses</h2>
                <p className="text-[12px] text-zinc-400">
                  Localiza o prompt maduro semanticamente mais distante do Polo A nos vetores de 24 dimensões e cruza atributos opostos.
                </p>
              </div>

              <button
                type="button"
                disabled={loadingSample}
                onClick={() =>
                  void loadSample('antithesis', { playSound: true })
                }
                className="btn-secondary w-full text-[12px]"
              >
                <Split className="h-3.5 w-3.5" />
                <span>{loadingSample ? 'Sondando vetores...' : 'Colidir novos polos 24D'}</span>
              </button>

              {currentAntipode ? (
                <div className="rounded-xl border border-[#e8b84b]/35 bg-[#e8b84b]/[0.06] p-3">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="uppercase tracking-wider text-[#e8b84b]/85">
                      Divergência Vetorial 24D
                    </span>
                    <span className="tabular-mono text-[#e8b84b]">
                      cos θ = {currentAntipode.cosineSim.toFixed(3)}
                    </span>
                  </div>
                  <div className="tabular-mono mt-1 text-xl font-medium text-[#e8b84b]">
                    {currentAntipode.angularDeg}° de oposição
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-400">
                    Cluster {String(poleA?.mapClusterId ?? 1).padStart(2, '0')} vs. Cluster{' '}
                    {String(currentAntipode.item.mapClusterId ?? 1).padStart(2, '0')}
                  </div>
                </div>
              ) : null}

              {/* Presets de tensão estética */}
              <div className="space-y-2 border-t border-white/[0.07] pt-3">
                <span className="section-eyebrow">Eixos Contrastantes (Opcional)</span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    data-active={selectedPresetId === 'none'}
                    onClick={() => {
                      setSelectedPresetId('none')
                      setManuallyEdited(false)
                    }}
                    className="btn-ghost w-full justify-start text-left text-[11px]"
                  >
                    Oposição vetorial pura (24D sem filtro)
                  </button>
                  {ANTITHESIS_PRESETS.map((preset) => {
                    const active = selectedPresetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedPresetId(active ? 'none' : preset.id)
                          setManuallyEdited(false)
                        }}
                        className={[
                          'flex w-full flex-col gap-0.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-[#e8b84b]/55 bg-[#e8b84b]/[0.07] text-zinc-100'
                            : 'border-white/[0.06] bg-[#0b0b0e] text-zinc-300 hover:border-white/[0.16]',
                        ].join(' ')}
                      >
                        <span className="text-[11px] font-medium">{preset.title}</span>
                        <span className="text-[10px] text-zinc-500">{preset.tensionNote}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Candidatos Antípodas */}
              {antipodes.length > 0 ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-3">
                  <span className="section-eyebrow">Antípodas Mais Distantes ({antipodes.length})</span>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {antipodes.map((cand, idx) => {
                      const isSel = idx === antipodeIdx % antipodes.length
                      return (
                        <button
                          key={cand.item.id}
                          type="button"
                          onClick={() => {
                            setAntipodeIdx(idx)
                            setManuallyEdited(false)
                          }}
                          className={[
                            'flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer',
                            isSel
                              ? 'border-[#e8b84b]/60 bg-[#15151a]'
                              : 'border-white/[0.06] bg-[#0b0b0e] hover:border-white/[0.16]',
                          ].join(' ')}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-medium text-zinc-200">
                              {cand.item.title}
                            </div>
                            <div className="tabular-mono truncate text-[10px] text-zinc-500">
                              {cand.item.project} · TIER {cand.item.rarity.tier}
                            </div>
                          </div>
                          <span className="tabular-mono shrink-0 text-[10px] text-[#e8b84b]">
                            {cand.angularDeg}°
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-1 border-b border-white/[0.07] pb-3">
                <span className="section-eyebrow">Variante 2 · Recombinação Cross-Projeto</span>
                <h2 className="text-[15px] font-medium text-zinc-100">Sonda de Deriva</h2>
                <p className="text-[12px] text-zinc-400">
                  Combina aleatoriamente doadores de projetos e clusters distintos com travas individuais para fixar atributos promissores.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={loadingSample}
                  onClick={() =>
                    void loadSample('drift', { playSound: true, randomizeSlots: true })
                  }
                  className="btn-secondary w-full text-[12px]"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>{loadingSample ? 'Sondando acervo...' : 'Sondar nova deriva'}</span>
                </button>

                <button
                  type="button"
                  disabled={loadingSample || (!activeDonorA && !activeDonorB)}
                  onClick={handleRecombineDriftSlots}
                  className="btn-ghost w-full border border-white/[0.08] text-[11px]"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>Recombinar atributos destravados</span>
                </button>
              </div>

              {activeDonorC ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="section-eyebrow">Doador C (Terceiro Projeto)</span>
                    <span
                      className={[
                        'tabular-mono rounded-full border px-1.5 py-0.5 text-[9px]',
                        isDonorCActive ? TIER_COLOR_META.S.badgeClass : 'border-white/10 text-zinc-400',
                      ].join(' ')}
                    >
                      {isDonorCActive ? 'ATIVO NA SÍNTESE' : 'DISPONÍVEL'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                    <div
                      className={[
                        'h-16 w-12 shrink-0 overflow-hidden rounded-lg border bg-[#121217]',
                        isDonorCActive ? 'border-[#e8b84b] ring-1 ring-[#e8b84b]/75' : 'border-white/10',
                      ].join(' ')}
                    >
                      <PromptThumb src={activeDonorC.thumbnailUrl} alt={activeDonorC.title} fallbackLabel="·" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-zinc-200">
                        {activeDonorC.title}
                      </div>
                      <div className="tabular-mono truncate text-[10px] text-zinc-500">
                        {activeDonorC.project} · TIER {activeDonorC.rarity.tier}
                      </div>
                      <button
                        type="button"
                        onClick={() => onInspectItem(activeDonorC)}
                        className="btn-ghost mt-1 min-h-[24px] px-1.5 text-[10px]"
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>Ver 8 atributos</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5 border-t border-white/[0.07] pt-3 font-mono text-[10px] text-zinc-500">
                <div>
                  Slots travados: {Object.values(lockedSlots).filter(Boolean).length}/6
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  Trave qualquer atributo à direita com o ícone de cadeado para preservá-lo ao recombinar.
                </p>
              </div>
            </>
          )}
        </section>

        {/* Coluna Direita: Polos / Doadores Hero + Matriz de Fusão + Telemetria */}
        <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5 lg:col-span-8">
          {/* Bloco de Doadores / Polos */}
          <div className="space-y-3 border-b border-white/[0.07] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="section-eyebrow tracking-[0.16em]">
                {variantMode === 'antithesis'
                  ? 'POLOS EM COLISÃO · A VS. ANTÍPODA B'
                  : 'DOADORES EM DERIVA · ORIGENS CRUZADAS'}
              </span>
              {loadingSample ? (
                <span className="tabular-mono text-[10px] text-zinc-500">
                  Hidratando doadores do SQLite...
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    role: variantMode === 'antithesis' ? 'POLO A (ÂNCORA)' : 'DOADOR A',
                    item: activeDonorA,
                    isActive: isDonorAActive,
                    canCycle: variantMode === 'antithesis' ? poleAPool.length > 1 : driftPoolA.length > 1,
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
                    role: variantMode === 'antithesis' ? 'POLO B (ANTÍPODA)' : 'DOADOR B',
                    item: activeDonorB,
                    isActive: isDonorBActive,
                    canCycle: variantMode === 'antithesis' ? antipodes.length > 1 : driftPoolB.length > 1,
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
              ).map(({ role, item, isActive, canCycle, onCycle }) => {
                const tierMeta = item ? TIER_COLOR_META[item.rarity.tier] : null
                return (
                  <div
                    key={role}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-3"
                  >
                    <div
                      className={[
                        'relative h-[116px] aspect-[3/4] shrink-0 overflow-hidden rounded-[10px] border bg-[#121217]',
                        isActive ? 'border-[#e8b84b] ring-1 ring-[#e8b84b]/75' : 'border-white/10',
                      ].join(' ')}
                    >
                      <PromptThumb
                        src={item?.thumbnailUrl}
                        alt={item?.title ?? role}
                        fallbackLabel="Sem img"
                      />
                      {canCycle ? (
                        <button
                          type="button"
                          onClick={onCycle}
                          className="btn-secondary absolute right-1.5 bottom-1.5 min-h-[26px] rounded-lg border-white/20 bg-black/65 px-2 py-1 text-[10px] text-zinc-100 backdrop-blur-sm hover:border-white/40 hover:bg-black/80"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          <span>Trocar</span>
                        </button>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                      <div>
                        <span className="tabular-mono text-[9px] uppercase tracking-[0.12em] text-zinc-400">
                          {role}
                        </span>
                        <div className="mt-1 truncate text-[12px] font-medium text-zinc-100">
                          {item ? item.title : 'Carregando...'}
                        </div>
                        {item && tierMeta ? (
                          <>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                              {item.project}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                              <span
                                className={[
                                  'rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                                  tierMeta.badgeClass,
                                ].join(' ')}
                              >
                                TIER {item.rarity.tier}
                              </span>
                              <span className="text-zinc-400">
                                P{item.rarity.percentile} · MAT {Math.round(item.maturity.score)}
                              </span>
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="pt-2">
                        <button
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
                )
              })}
            </div>
          </div>

          {/* Matriz de Fusão dos 6 Atributos */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="section-eyebrow tracking-[0.16em]">
                  FUSÃO EXPERIMENTAL DE ATRIBUTOS
                </span>
                <p className="text-[11px] text-zinc-500">
                  Alterne a origem de cada slot entre A, B{activeDonorC ? ' e C' : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {FORMAT_TABS.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    data-active={synthFormat === fmt.id}
                    onClick={() => {
                      setSynthFormat(fmt.id)
                      setManuallyEdited(false)
                    }}
                    className="btn-ghost font-mono text-[10px]"
                  >
                    {fmt.label}
                  </button>
                ))}

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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CORE_ATTR_SLOTS.map((slot) => {
                const currentSource = slotSources[slot.key]
                const isLocked = Boolean(lockedSlots[slot.key])
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
                      'flex flex-col gap-1.5 rounded-xl border p-2',
                      isLocked
                        ? 'border-[#e8b84b]/45 bg-[#e8b84b]/[0.04]'
                        : 'border-white/[0.06] bg-[#0b0b0e]',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] font-medium text-zinc-300">
                        {slot.short} · {slot.label}
                      </span>
                      {variantMode === 'drift' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLockedSlots((prev) => ({ ...prev, [slot.key]: !prev[slot.key] }))
                          }
                          className="text-zinc-400 hover:text-[#e8b84b] cursor-pointer"
                          title={isLocked ? 'Destravar atributo' : 'Travar atributo na deriva'}
                          aria-label={isLocked ? `Destravar ${slot.label}` : `Travar ${slot.label}`}
                        >
                          {isLocked ? (
                            <Lock className="h-3 w-3 text-[#e8b84b]" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                        </button>
                      ) : null}
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

            {activePreset && variantMode === 'antithesis' ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#e8b84b]/40 bg-[#e8b84b]/[0.05] px-3 py-2 font-mono text-[10px] text-[#e8b84b]">
                <span>Tensão injetada:</span>
                <span>
                  {formatTagPt(activePreset.tagA)} × {formatTagPt(activePreset.tagB)}
                </span>
              </div>
            ) : null}

            {/* Editor do Prompt Experimental */}
            <div className="relative">
              <textarea
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value)
                  setManuallyEdited(true)
                }}
                rows={synthFormat === 'json' ? 11 : 8}
                spellCheck={false}
                aria-label="Prompt experimental gerado"
                className="w-full rounded-2xl border border-white/[0.08] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-200 focus:border-white/25 focus:outline-none"
              />
              {manuallyEdited ? (
                <span className="pointer-events-none absolute top-2.5 right-3 rounded-md border border-white/10 bg-[#141418] px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                  editado manualmente
                </span>
              ) : null}
            </div>

            {/* Telemetria ao vivo */}
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
                  <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                    <span>{preview.attributes.estrutura.filledAttributesCount}/8 atr.</span>
                    <span>{preview.attributes.estrutura.tokenCount} tok</span>
                  </div>
                </>
              ) : (
                <span className="text-zinc-500">
                  {previewLoading ? 'Calculando raridade da fusão...' : 'Aguardando fusão.'}
                </span>
              )}
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManuallyEdited(false)}
                  className="btn-ghost text-[11px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Regenerar fusão</span>
                </button>

                <button
                  type="button"
                  onClick={() => void copyText(draftText, 'exp-prompt')}
                  className="btn-secondary text-[11px]"
                >
                  {copiedKey === 'exp-prompt' ? (
                    <Check className="h-3.5 w-3.5" />
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
                  className="btn-secondary font-mono text-[10px]"
                >
                  <Download className="h-3 w-3" />
                  <span>Exportar .MD</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className="btn-secondary font-mono text-[10px]"
                >
                  <Download className="h-3 w-3" />
                  <span>Exportar .JSON</span>
                </button>

                <button
                  type="button"
                  disabled={savingExp || !draftText.trim()}
                  onClick={() => void handleSaveExperiment()}
                  className="btn-primary text-[12px]"
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
