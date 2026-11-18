import { type FC, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  MATURE_MOLDS,
  diagnosePromptImmaturity,
  refineImmaturePrompt,
} from '../core/promptRefiner'
import { QUADRANT_META } from '../core/rarityEngine'
import { useCopyFeedback } from '../hooks/useCopyFeedback'
import type {
  ImmatureQueueResponse,
  MatureMoldId,
  PromptItem,
  SourceLibFilter,
} from '../types/promptEngine'

interface RefinementStudioPanelProps {
  sourceLib: SourceLibFilter
  initialTargetItem?: PromptItem | null
  initialPeriodFilter?: string | 'all'
  onClearPeriodFilter?: () => void
  onInspectItem: (item: PromptItem) => void
}

const PAGE_LIMIT = 24

export const RefinementStudioPanel: FC<RefinementStudioPanelProps> = ({
  sourceLib,
  initialTargetItem = null,
  initialPeriodFilter = 'all',
  onClearPeriodFilter,
  onInspectItem,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()

  const [queryInput, setQueryInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [onlyTierS, setOnlyTierS] = useState(false)
  const [projectFilter, setProjectFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState<string>(initialPeriodFilter)
  const [offset, setOffset] = useState(0)

  const [queueData, setQueueData] = useState<ImmatureQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<PromptItem | null>(initialTargetItem)

  const [moldId, setMoldId] = useState<MatureMoldId>('studio_editorial_v5')
  const [aspectRatio, setAspectRatio] = useState<string>('3:4')
  const [refinedEditorText, setRefinedEditorText] = useState('')
  const [manuallyEdited, setManuallyEdited] = useState(false)

  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

  useEffect(() => {
    setPeriodFilter(initialPeriodFilter)
    setOffset(0)
  }, [initialPeriodFilter])

  useEffect(() => {
    if (initialTargetItem) {
      setSelectedItem(initialTargetItem)
      setManuallyEdited(false)
    }
  }, [initialTargetItem])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery((prev) => {
        const next = queryInput.trim()
        if (prev !== next) setOffset(0)
        return next
      })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    setOffset(0)
  }, [sourceLib])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    const params = new URLSearchParams()
    params.set('sourceLib', sourceLib)
    if (onlyTierS) params.set('tier', 'S')
    if (projectFilter !== 'all') params.set('project', projectFilter)
    if (periodFilter !== 'all') params.set('period', periodFilter)
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('offset', String(offset))
    params.set('limit', String(PAGE_LIMIT))

    fetch(`/api/immature-queue?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as ImmatureQueueResponse
      })
      .then((payload) => {
        setQueueData(payload)
        setSelectedItem((curr) => {
          if (initialTargetItem && curr?.id === initialTargetItem.id) return curr
          if (curr && payload.items.some((x) => x.id === curr.id)) return curr
          return payload.items[0] || initialTargetItem || null
        })
        setLoading(false)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setLoading(false)
      })

    return () => controller.abort()
  }, [sourceLib, onlyTierS, projectFilter, periodFilter, debouncedQuery, offset, initialTargetItem])

  const activeItem = selectedItem

  const diagnostics = useMemo(
    () => (activeItem ? diagnosePromptImmaturity(activeItem) : []),
    [activeItem]
  )

  const refinement = useMemo(
    () => (activeItem ? refineImmaturePrompt(activeItem, moldId, aspectRatio) : null),
    [activeItem, moldId, aspectRatio]
  )

  useEffect(() => {
    if (refinement && !manuallyEdited) {
      setRefinedEditorText(refinement.refinedPrompt)
    }
  }, [refinement, manuallyEdited])

  const handleSelectQueueItem = (it: PromptItem) => {
    setSelectedItem(it)
    setManuallyEdited(false)
    setAspectRatio(it.attributes.estrutura.aspectRatio || '3:4')
  }

  const handleSaveRefinementToNotebook = async () => {
    if (!activeItem || !refinement || !refinedEditorText.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/gap-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gapId: `refine:${activeItem.id}:${moldId}`,
          gapTitle: `Lapidação (${refinement.mold.label}) · ${activeItem.title}`,
          scope: activeItem.project,
          axisA: 'rarity',
          tagA: `tier_${activeItem.rarity.tier.toLowerCase()}`,
          axisB: 'mold',
          tagB: moldId,
          donorAId: activeItem.id,
          donorBId: null,
          macroFormat: refinement.mold.macroFormat,
          aspectRatio,
          attributeSources: {
            sujeito: 'donor_a',
            cenario: 'donor_a',
            luz: 'donor_a',
            camera: 'donor_a',
            textura_material: 'donor_a',
            estilo: 'donor_a',
          },
          rawPrompt: refinedEditorText,
          rarityPercentile: activeItem.rarity.percentile,
          rarityTier: activeItem.rarity.tier,
          rarityLabel: activeItem.rarity.label,
          maturityScore: refinement.afterMaturity.score,
          quadrant: refinement.afterQuadrant,
          filledAttributesCount: refinement.afterAttributes.estrutura.filledAttributesCount,
        }),
      })
      if (res.ok) {
        setSavedNotice(true)
        window.setTimeout(() => setSavedNotice(false), 1800)
      }
    } finally {
      setSaving(false)
    }
  }

  const totalMatching = queueData?.totalMatching ?? 0
  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_LIMIT))
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1

  return (
    <div className="space-y-4">
      {/* Métricas do Território Virgem */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-3.5">
          <div className="section-eyebrow">Fila Raro + Imaturo</div>
          <div className="tabular-mono mt-1 text-xl font-medium text-zinc-100">
            {totalMatching.toLocaleString('pt-BR')}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">P ≥ 70 · MAT &lt; 60</div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-3.5">
          <div className="section-eyebrow">Prioridade Tier S</div>
          <div className="tabular-mono mt-1 text-xl font-medium text-[#e5a93c]">
            {(queueData?.tierSCount ?? 0).toLocaleString('pt-BR')}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">Top 5% raridade sem lapidação</div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-3.5">
          <div className="section-eyebrow">Raridade Média da Fila</div>
          <div className="tabular-mono mt-1 text-xl font-medium text-zinc-100">
            P{queueData?.avgPercentile ?? 0}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">Ideias pouco exploradas</div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-3.5">
          <div className="section-eyebrow">Maturidade Média Atual</div>
          <div className="tabular-mono mt-1 text-xl font-medium text-zinc-100">
            {queueData?.avgMaturity ?? 0}
            <span className="text-[12px] text-zinc-500">/100</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">Meta de resgate: MAT ≥ 60</div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Coluna Esquerda: Fila filtrável + paginação */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Buscar na fila Raro + Imaturo..."
                className="w-full rounded-xl border border-white/[0.07] bg-[#09090b] py-1.5 pr-3 pl-8 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setOnlyTierS((v) => !v)
                setOffset(0)
              }}
              className={[
                'rounded-xl border px-2.5 py-1.5 font-mono text-[11px] transition-colors cursor-pointer',
                onlyTierS
                  ? 'border-[#e5a93c]/60 bg-[#e5a93c]/10 text-[#e5a93c]'
                  : 'border-white/[0.08] bg-[#0b0b0e] text-zinc-400 hover:border-white/20',
              ].join(' ')}
            >
              Só Tier S
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value)
                setOffset(0)
              }}
              className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#09090b] px-2.5 py-1.5 text-[11px] text-zinc-300 focus:outline-none"
              aria-label="Filtrar fila por projeto"
            >
              <option value="all">Todos os projetos</option>
              {(queueData?.projects ?? []).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.count.toLocaleString('pt-BR')})
                </option>
              ))}
            </select>

            {periodFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setPeriodFilter('all')
                  setOffset(0)
                  onClearPeriodFilter?.()
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-[#15151a] px-2.5 py-1 font-mono text-[10px] text-zinc-300 hover:border-white/30 cursor-pointer"
              >
                <span>Safra: {periodFilter}</span>
                <span className="text-zinc-500">×</span>
              </button>
            ) : null}
          </div>

          <div className="max-h-[700px] flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && !queueData ? (
              <div className="py-12 text-center font-mono text-[11px] text-zinc-500">
                Consultando SQLite...
              </div>
            ) : (queueData?.items ?? []).length === 0 ? (
              <div className="py-12 text-center font-mono text-[11px] text-zinc-500">
                Nenhum prompt Raro + Imaturo neste recorte.
              </div>
            ) : (
              (queueData?.items ?? []).map((it) => {
                const isSel = activeItem?.id === it.id
                const isS = it.rarity.tier === 'S'
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleSelectQueueItem(it)}
                    className={[
                      'flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                      isSel
                        ? 'border-white/30 bg-[#16161c]'
                        : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.16]',
                    ].join(' ')}
                  >
                    {it.thumbnailUrl ? (
                      <img
                        src={it.thumbnailUrl}
                        alt={it.title}
                        loading="lazy"
                        className="h-14 w-11 shrink-0 rounded-lg border border-white/[0.07] object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-medium text-zinc-100">
                          {it.title}
                        </span>
                        <span
                          className={[
                            'tabular-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[9px]',
                            isS
                              ? 'border-[#e5a93c]/60 text-[#e5a93c]'
                              : 'border-white/10 text-zinc-300',
                          ].join(' ')}
                        >
                          TIER {it.rarity.tier} · P{it.rarity.percentile}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-zinc-400">
                        {it.excerpt}
                      </p>
                      <div className="tabular-mono mt-1 flex items-center justify-between text-[9px] text-zinc-500">
                        <span>{it.project}</span>
                        <span>
                          MAT {Math.round(it.maturity.score)} · reuso {it.maturity.skeletonReuseCount}×
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5 font-mono text-[10px] text-zinc-400">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_LIMIT))}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1 text-zinc-300 hover:border-white/25 disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>Anterior</span>
            </button>
            <span>
              Página {currentPage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_LIMIT >= totalMatching || loading}
              onClick={() => setOffset((o) => o + PAGE_LIMIT)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1 text-zinc-300 hover:border-white/25 disabled:opacity-35 cursor-pointer"
            >
              <span>Próxima</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </section>

        {/* Coluna Direita: Estúdio de Transplante de Esqueleto */}
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5 lg:col-span-7">
          {!activeItem || !refinement ? (
            <div className="flex h-64 items-center justify-center text-[13px] text-zinc-500">
              Selecione um prompt na Fila Raro + Imaturo ao lado.
            </div>
          ) : (
            <>
              {/* Cabeçalho do Prompt Alvo */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] pb-3.5">
                <div className="flex items-start gap-3">
                  {activeItem.thumbnailUrl ? (
                    <img
                      src={activeItem.thumbnailUrl}
                      alt={activeItem.title}
                      className="h-16 w-14 shrink-0 rounded-xl border border-white/[0.08] object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'tabular-mono rounded-full border px-2 py-0.5 text-[10px]',
                          activeItem.rarity.tier === 'S'
                            ? 'border-[#e5a93c]/60 bg-[#e5a93c]/10 text-[#e5a93c]'
                            : 'border-white/15 bg-white/[0.04] text-zinc-200',
                        ].join(' ')}
                      >
                        TIER {activeItem.rarity.tier}
                      </span>
                      <span className="tabular-mono text-[11px] text-zinc-300">
                        {activeItem.rarity.label}
                      </span>
                    </div>
                    <h2 className="mt-1 truncate text-[15px] font-medium text-zinc-100">
                      {activeItem.title}
                    </h2>
                    <div className="tabular-mono text-[10px] text-zinc-500">
                      {activeItem.project} · {activeItem.attributes.estrutura.kernelDialect} · reuso atual{' '}
                      {activeItem.maturity.skeletonReuseCount}×
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onInspectItem(activeItem)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/25 cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Ver original</span>
                </button>
              </div>

              {/* Diagnóstico de Gargalos */}
              <div className="space-y-2">
                <span className="section-eyebrow">Diagnóstico de Maturidade (Por que está Imaturo?)</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {diagnostics.map((d) => (
                    <div
                      key={d.kind}
                      className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular-mono rounded border border-white/10 bg-[#141418] px-1.5 py-0.5 text-[9px] text-zinc-300">
                          {d.tag}
                        </span>
                        <span className="tabular-mono text-[10px] text-zinc-400">
                          +{d.estimatedGainPts} pts MAT
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-zinc-200">{d.title}</div>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{d.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seletor dos 4 Moldes Consolidados */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow">
                    Molde de Destino (Esqueletos Consolidados do Acervo)
                  </span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => {
                      setAspectRatio(e.target.value)
                      setManuallyEdited(false)
                    }}
                    className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2 py-1 font-mono text-[10px] text-zinc-300 focus:outline-none"
                    aria-label="Proporção de refino"
                  >
                    {['3:4', '4:5', '1:1', '16:9'].map((ar) => (
                      <option key={ar} value={ar}>
                        AR {ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MATURE_MOLDS.map((m) => {
                    const active = moldId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMoldId(m.id)
                          setManuallyEdited(false)
                        }}
                        className={[
                          'flex flex-col items-start rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-white/30 bg-[#16161d]'
                            : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.18]',
                        ].join(' ')}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-zinc-100">{m.label}</span>
                          <span className="tabular-mono text-[10px] text-zinc-400">
                            {m.skeletonReuseCount}× · MAT ~{m.avgMaturityInCorpus}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                          {m.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Comparativo Antes -> Depois */}
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.07] bg-[#0b0b0e] p-3.5 sm:grid-cols-11">
                <div className="sm:col-span-5">
                  <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                    <span>ANTES · {QUADRANT_META[refinement.beforeQuadrant].shortLabel}</span>
                    <span className="text-zinc-200">{refinement.beforeMaturity.score}/100</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                    <div className="rounded bg-[#121216] p-1.5">
                      <div className="text-[8px] text-zinc-500">REUSO</div>
                      <div className="text-zinc-300">{refinement.beforeMaturity.skeletonReuseScore}%</div>
                    </div>
                    <div className="rounded bg-[#121216] p-1.5">
                      <div className="text-[8px] text-zinc-500">ATRIB</div>
                      <div className="text-zinc-300">{refinement.beforeMaturity.completenessScore}%</div>
                    </div>
                    <div className="rounded bg-[#121216] p-1.5">
                      <div className="text-[8px] text-zinc-500">TÉCN</div>
                      <div className="text-zinc-300">{refinement.beforeMaturity.technicalPrecisionScore}%</div>
                    </div>
                    <div className="rounded bg-[#121216] p-1.5">
                      <div className="text-[8px] text-zinc-500">CURAD</div>
                      <div className="text-zinc-300">{refinement.beforeMaturity.curationScore}%</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:col-span-1">
                  <ArrowRight className="h-4 w-4 text-zinc-500" />
                </div>

                <div className="sm:col-span-5">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-[#e5a93c]">
                      DEPOIS · {QUADRANT_META[refinement.afterQuadrant].shortLabel}
                    </span>
                    <span className="text-[#e5a93c]">
                      {refinement.afterMaturity.score}/100 (+{refinement.deltaMaturity})
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                    <div className="rounded bg-[#141418] p-1.5">
                      <div className="text-[8px] text-zinc-500">REUSO</div>
                      <div className="text-zinc-100">{refinement.afterMaturity.skeletonReuseScore}%</div>
                    </div>
                    <div className="rounded bg-[#141418] p-1.5">
                      <div className="text-[8px] text-zinc-500">ATRIB</div>
                      <div className="text-zinc-100">{refinement.afterMaturity.completenessScore}%</div>
                    </div>
                    <div className="rounded bg-[#141418] p-1.5">
                      <div className="text-[8px] text-zinc-500">TÉCN</div>
                      <div className="text-zinc-100">{refinement.afterMaturity.technicalPrecisionScore}%</div>
                    </div>
                    <div className="rounded bg-[#141418] p-1.5">
                      <div className="text-[8px] text-zinc-500">CURAD</div>
                      <div className="text-zinc-100">{refinement.afterMaturity.curationScore}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Correções injetadas */}
              <div className="flex flex-wrap gap-1.5">
                {refinement.injectedFixes.map((fx) => (
                  <span
                    key={fx}
                    className="tabular-mono inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2 py-0.5 text-[10px] text-zinc-300"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-[#e5a93c]" />
                    <span>{fx}</span>
                  </span>
                ))}
              </div>

              {/* Prompt Lapidado */}
              <textarea
                value={refinedEditorText}
                onChange={(e) => {
                  setRefinedEditorText(e.target.value)
                  setManuallyEdited(true)
                }}
                rows={10}
                spellCheck={false}
                aria-label="Prompt lapidado para Raro + Maduro"
                className="w-full rounded-2xl border border-white/[0.08] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-200 focus:border-white/25 focus:outline-none"
              />

              {/* Ações finais */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManuallyEdited(false)
                      setRefinedEditorText(refinement.refinedPrompt)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/25 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restaurar molde</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void copyText(refinedEditorText, 'refine-copy')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#15151a] px-3 py-1.5 text-[11px] text-zinc-100 hover:border-white/25 cursor-pointer"
                  >
                    {copiedKey === 'refine-copy' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedKey === 'refine-copy' ? 'Copiado' : 'Copiar lapidado'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveRefinementToNotebook()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5a93c]/50 bg-[#e5a93c]/10 px-3 py-1.5 text-[11px] font-medium text-[#e5a93c] hover:border-[#e5a93c] disabled:opacity-50 cursor-pointer"
                >
                  {savedNotice ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                  ) : (
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {saving
                      ? 'Salvando...'
                      : savedNotice
                        ? 'Salvo no Caderno Local'
                        : 'Salvar no Caderno Local'}
                  </span>
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
