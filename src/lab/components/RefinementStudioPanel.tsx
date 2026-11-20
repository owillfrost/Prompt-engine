import { type FC, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpDown,
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
} from '../../core/promptRefiner'
import { QUADRANT_META } from '../../core/rarityEngine'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import {
  ATTRIBUTE_META,
  type ImmatureQueueResponse,
  type MatureMoldId,
  type PromptItem,
  type SourceLibFilter,
} from '../../types/promptEngine'
import { getPromptSemanticTitle } from '../utils/promptDisplay'
import { TIER_COLOR_META } from '../utils/themeTokens'
import { PromptThumb } from './PromptThumb'

interface RefinementStudioPanelProps {
  sourceLib: SourceLibFilter
  initialTargetItem?: PromptItem | null
  initialPeriodFilter?: string | 'all'
  onClearPeriodFilter?: () => void
  onInspectItem: (item: PromptItem) => void
}

const PAGE_LIMIT = 24
const ASPECT_RATIOS = ['3:4', '4:5', '1:1', '16:9'] as const

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

  const queueItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

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

  // Navegação por teclado na fila: instantânea (0ms de animação)
  const handleQueueKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = queueData?.items ?? []
    if (list.length === 0) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const currentIndex = activeItem ? list.findIndex((x) => x.id === activeItem.id) : -1
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.max(0, Math.min(list.length - 1, currentIndex + delta))

    const nextItem = list[nextIndex]
    if (!nextItem || nextItem.id === activeItem?.id) return

    handleSelectQueueItem(nextItem)
    const node = queueItemRefs.current.get(nextItem.id)
    node?.scrollIntoView({ block: 'nearest' })
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
  const queueItems = queueData?.items ?? []

  return (
    <div className="space-y-3">
      {/* Barra de Telemetria & Filtros Globais da Fila */}
      <section
        aria-label="Telemetria e filtros do Território Virgem"
        className="club-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="section-eyebrow">Fila Raro + Imaturo</span>
            <span className="tabular-mono text-[14px] font-medium text-ink">
              {totalMatching.toLocaleString('pt-BR')}
            </span>
          </div>

          <span className="hidden h-3.5 w-px bg-hairline sm:inline-block" aria-hidden="true" />

          <div className="flex items-baseline gap-2">
            <span className="section-eyebrow">Tier S</span>
            <span className="tabular-mono text-[14px] font-medium text-tier-s">
              {(queueData?.tierSCount ?? 0).toLocaleString('pt-BR')}
            </span>
          </div>

          <span className="hidden h-3.5 w-px bg-hairline sm:inline-block" aria-hidden="true" />

          <div className="flex items-baseline gap-2">
            <span className="section-eyebrow">Raridade Média</span>
            <span className="tabular-mono text-[13px] font-medium text-ink">
              P{queueData?.avgPercentile ?? 0}
            </span>
          </div>

          <span className="hidden h-3.5 w-px bg-hairline sm:inline-block" aria-hidden="true" />

          <div className="flex items-baseline gap-2">
            <span className="section-eyebrow">MAT Média</span>
            <span className="tabular-mono text-[13px] font-medium text-ink">
              {queueData?.avgMaturity ?? 0}
              <span className="text-[11px] text-ink-muted">/100</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOnlyTierS((v) => !v)
              setOffset(0)
            }}
            className={[
              'cursor-pointer px-3 py-1 font-mono text-[11px]',
              onlyTierS ? 'club-btn-gold' : 'club-btn-ghost',
            ].join(' ')}
          >
            Só Tier S
          </button>

          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value)
              setOffset(0)
            }}
            className="max-w-[210px] rounded-xl border border-hairline bg-canvas px-2.5 py-1 text-[11px] text-ink-secondary focus:border-border-hover focus:outline-none"
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
              className="lab-pressable lab-hover-surface inline-flex cursor-pointer items-center gap-1 rounded-xl border border-hairline bg-elevated px-2.5 py-1 font-mono text-[10px] text-ink-secondary"
            >
              <span>Safra: {periodFilter}</span>
              <span className="text-ink-muted">×</span>
            </button>
          ) : null}
        </div>
      </section>

      {/* Workbench Master-Detail unificado */}
      <div className="club-card grid grid-cols-1 overflow-hidden lg:grid-cols-12">
        {/* Painel Mestre: Fila Raro + Imaturo */}
        <section
          aria-label="Fila de resgate Raro e Imaturo"
          className="flex flex-col border-b border-hairline lg:col-span-5 lg:border-r lg:border-b-0"
        >
          <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Buscar na fila (título, tag, projeto)..."
                className="w-full rounded-xl border border-hairline bg-canvas py-1.5 pr-3 pl-8 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:border-border-hover focus:outline-none"
              />
            </div>
            <span
              className="hidden shrink-0 rounded-lg border border-hairline bg-canvas px-1.5 py-1 font-mono text-[9px] text-ink-muted sm:inline-flex"
              aria-label="Use as setas para navegar na fila"
            >
              <ArrowUpDown className="h-3 w-3" />
            </span>
          </div>

          <div
            tabIndex={0}
            onKeyDown={handleQueueKeyDown}
            role="listbox"
            aria-label="Prompts candidatos à lapidação"
            className="h-[460px] flex-1 divide-y divide-border-subtle overflow-y-auto focus:outline-none lg:h-[650px]"
          >
            {loading && !queueData ? (
              <div className="flex h-full items-center justify-center font-mono text-[11px] text-ink-muted">
                Consultando SQLite...
              </div>
            ) : queueItems.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[11px] text-ink-muted">
                Nenhum prompt Raro + Imaturo neste recorte.
              </div>
            ) : (
              queueItems.map((it) => {
                const isSel = activeItem?.id === it.id
                const isS = it.rarity.tier === 'S'
                return (
                  <button
                    key={it.id}
                    ref={(el) => {
                      if (el) queueItemRefs.current.set(it.id, el)
                      else queueItemRefs.current.delete(it.id)
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => handleSelectQueueItem(it)}
                    className={[
                      'lab-pressable-subtle relative flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left',
                      isSel
                        ? 'bg-elevated'
                        : 'lab-hover-surface bg-transparent',
                    ].join(' ')}
                  >
                    {isSel ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-tier-s"
                      />
                    ) : null}

                    <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-hairline">
                      <PromptThumb
                        src={it.thumbnailUrl}
                        alt={it.title}
                        loading="eager"
                        fallbackLabel="·"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={[
                            'truncate text-[12px] font-medium',
                            isSel ? 'text-ink' : 'text-ink-secondary',
                          ].join(' ')}
                        >
                          {getPromptSemanticTitle(it)}
                        </span>
                        <span
                          className={[
                            'tabular-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[9px]',
                            isS
                              ? 'border-tier-s/60 bg-tier-s/10 text-tier-s'
                              : 'border-hairline text-ink-tertiary',
                          ].join(' ')}
                        >
                          {it.rarity.tier} · P{it.rarity.percentile}
                        </span>
                      </div>

                      <p className="mt-0.5 line-clamp-1 font-mono text-[10px] text-ink-muted">
                        {it.excerpt}
                      </p>

                      <div className="tabular-mono mt-1 flex items-center justify-between text-[9px] text-ink-muted">
                        <span className="truncate">{it.project}</span>
                        <span className="shrink-0">
                          MAT {Math.round(it.maturity.score)} · {it.maturity.skeletonReuseCount}×
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-hairline bg-surface px-3.5 py-2.5 font-mono text-[10px] text-ink-tertiary">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_LIMIT))}
              className="club-btn-ghost cursor-pointer px-3 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>Anterior</span>
            </button>
            <span className="tabular-mono">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_LIMIT >= totalMatching || loading}
              onClick={() => setOffset((o) => o + PAGE_LIMIT)}
              className="club-btn-ghost cursor-pointer px-3 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span>Próxima</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </section>

        {/* Painel Detalhe: Estúdio de Transplante de Esqueleto */}
        <section
          aria-label="Estúdio de lapidação"
          className="flex flex-col lg:col-span-7"
        >
          {!activeItem || !refinement ? (
            <div className="flex flex-1 items-center justify-center p-12 text-[13px] text-ink-muted">
              Nenhum prompt selecionado na fila Raro + Imaturo.
            </div>
          ) : (
            <div className="flex flex-1 flex-col divide-y divide-border-subtle">
              {/* Zona 1: Alvo & Diagnóstico condensado */}
              <div className="space-y-3 p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="h-14 w-12 shrink-0 overflow-hidden rounded-xl border border-hairline">
                      <PromptThumb
                        src={activeItem.thumbnailUrl}
                        alt={activeItem.title}
                        loading="eager"
                        fallbackLabel="·"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'tabular-mono rounded-full border px-2 py-0.5 text-[10px]',
                            activeItem.rarity.tier === 'S'
                              ? 'border-tier-s/60 bg-tier-s/10 text-tier-s'
                              : 'border-hairline bg-white/[0.04] text-ink',
                          ].join(' ')}
                        >
                          TIER {activeItem.rarity.tier}
                        </span>
                        <span className="tabular-mono text-[11px] text-ink-secondary">
                          {activeItem.rarity.label}
                        </span>
                      </div>
                      <h2 className="mt-1 truncate text-[14px] font-medium text-ink">
                        {getPromptSemanticTitle(activeItem)}
                      </h2>
                      <div className="tabular-mono text-[10px] text-ink-muted">
                        {activeItem.project} · {activeItem.attributes.estrutura.kernelDialect} · reuso{' '}
                        {activeItem.maturity.skeletonReuseCount}×
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectItem(activeItem)}
                    className="club-btn-ghost cursor-pointer px-3 py-1.5 text-[11px]"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Ver original</span>
                  </button>
                </div>

                {/* Diagnóstico compacto em linha/grade */}
                <div className="space-y-1.5">
                  <span className="section-eyebrow">Diagnóstico de Gargalos</span>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {diagnostics.map((d) => (
                      <div
                        key={d.kind}
                        className="flex items-start justify-between gap-2 rounded-xl border border-hairline bg-canvas px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="tabular-mono rounded border border-hairline bg-elevated px-1.5 py-0.5 text-[9px] text-ink-secondary">
                              {d.tag}
                            </span>
                            <span className="truncate text-[11px] font-medium text-ink">
                              {d.title}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-muted">{d.detail}</p>
                        </div>
                        <span className="tabular-mono shrink-0 text-[10px] text-tier-s">
                          +{d.estimatedGainPts}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Zona 2: Molde de Destino + Segmented Control de Aspect Ratio */}
              <div className="space-y-2.5 p-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="section-eyebrow">
                    Molde de Destino (Esqueletos Consolidados)
                  </span>

                  <div
                    role="group"
                    aria-label="Proporção de refino"
                    className="inline-flex items-center rounded-xl border border-hairline bg-canvas p-0.5"
                  >
                    {ASPECT_RATIOS.map((ar) => {
                      const activeAr = aspectRatio === ar
                      return (
                        <button
                          key={ar}
                          type="button"
                          onClick={() => {
                            setAspectRatio(ar)
                            setManuallyEdited(false)
                          }}
                          className={[
                            'lab-pressable cursor-pointer rounded-lg px-2 py-0.5 font-mono text-[10px]',
                            activeAr
                              ? 'bg-elevated font-medium text-ink'
                              : 'text-ink-muted hover:text-ink-secondary',
                          ].join(' ')}
                        >
                          {ar}
                        </button>
                      )
                    })}
                  </div>
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
                          'lab-pressable-subtle flex cursor-pointer flex-col items-start rounded-xl border p-2.5 text-left',
                          active
                            ? 'border-border-hover bg-elevated'
                            : 'lab-hover-surface border-hairline bg-canvas',
                        ].join(' ')}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-ink">{m.label}</span>
                          <span className="tabular-mono text-[10px] text-ink-tertiary">
                            {m.skeletonReuseCount}× · MAT ~{m.avgMaturityInCorpus}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[10px] text-ink-muted">
                          {m.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Zona 3: Card Upgrade & Enhancement Bench (Before Card -> After Upgraded Card) */}
              <div className="flex flex-1 flex-col gap-3 p-4 sm:px-5">
                {/* Comparador Visual: Carta Base vs Carta Lapidada */}
                <div className="grid grid-cols-1 items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-hairline bg-canvas p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="section-eyebrow">Carta Base</span>
                      <span className="tabular-mono rounded-full border border-hairline bg-surface px-2 py-0.5 text-[10px] text-ink-tertiary">
                        {QUADRANT_META[refinement.beforeQuadrant].shortLabel}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <span className="tabular-mono text-[14px] font-semibold text-ink-secondary">
                        MAT {Math.round(refinement.beforeMaturity.score)}/100
                      </span>
                      <span className="tabular-mono text-[10px] text-ink-muted">
                        {refinement.beforeAttributes.estrutura.filledAttributesCount}/8 atr.
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-8 gap-1">
                      {ATTRIBUTE_META.map((attr) => {
                        const filled = refinement.beforeAttributes[attr.key].filled
                        return (
                          <span
                            key={attr.key}
                            aria-label={attr.label}
                            className={[
                              'h-1 rounded-full',
                              filled ? 'bg-ink-tertiary' : 'bg-hairline',
                            ].join(' ')}
                          />
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-tier-s/60 bg-tier-s/12 text-tier-s">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                    <span className="tabular-mono text-[10px] font-semibold text-tier-s">
                      +{refinement.deltaMaturity}
                    </span>
                  </div>

                  <div
                    className={[
                      'rounded-2xl border p-3',
                      activeItem.rarity.tier === 'S'
                        ? 'border-tier-s/60 bg-tier-s/10'
                        : 'border-brand-2/55 bg-brand-2/10',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="section-eyebrow text-tier-s">Carta Lapidada</span>
                      <span
                        className={[
                          'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          TIER_COLOR_META[activeItem.rarity.tier].badgeClass,
                        ].join(' ')}
                      >
                        {QUADRANT_META[refinement.afterQuadrant].shortLabel}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <span className="tabular-mono text-[14px] font-semibold text-ink">
                        MAT {Math.round(refinement.afterMaturity.score)}/100
                      </span>
                      <span className="tabular-mono text-[10px] text-tier-s">
                        {refinement.afterAttributes.estrutura.filledAttributesCount}/8 atr.
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-8 gap-1">
                      {ATTRIBUTE_META.map((attr) => {
                        const filled = refinement.afterAttributes[attr.key].filled
                        return (
                          <span
                            key={attr.key}
                            aria-label={attr.label}
                            className={['h-1 rounded-full', filled ? '' : 'bg-hairline'].join(' ')}
                            style={
                              filled
                                ? { backgroundColor: TIER_COLOR_META[activeItem.rarity.tier].barColor }
                                : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Barra de Delta Antes -> Depois */}
                <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-2 text-ink-tertiary">
                      <span>{QUADRANT_META[refinement.beforeQuadrant].shortLabel}</span>
                      <span className="tabular-mono text-ink-secondary">
                        {refinement.beforeMaturity.score}/100
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
                      <span className="text-tier-s">
                        {QUADRANT_META[refinement.afterQuadrant].shortLabel}
                      </span>
                    </div>
                    <span className="tabular-mono font-medium text-tier-s">
                      {refinement.afterMaturity.score}/100 (+{refinement.deltaMaturity} pts)
                    </span>
                  </div>

                  {/* Barra proporcional GPU-composited */}
                  <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                    <div
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-tier-s/75 transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]"
                      style={{
                        transform: `scaleX(${Math.max(0.02, Math.min(1, refinement.afterMaturity.score / 100))})`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-ink-tertiary/70 transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]"
                      style={{
                        transform: `scaleX(${Math.max(0.02, Math.min(1, refinement.beforeMaturity.score / 100))})`,
                      }}
                    />
                  </div>

                  <div className="tabular-mono mt-2 grid grid-cols-4 gap-2 text-[10px]">
                    <div className="flex items-center justify-between text-ink-tertiary">
                      <span className="text-ink-muted">REUSO</span>
                      <span className="inline-flex items-center gap-0.5">
                        {refinement.beforeMaturity.skeletonReuseScore}
                        <ArrowRight className="h-2.5 w-2.5 text-ink-muted" />
                        <strong className="font-medium text-ink">
                          {refinement.afterMaturity.skeletonReuseScore}%
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ink-tertiary">
                      <span className="text-ink-muted">ATRIB</span>
                      <span className="inline-flex items-center gap-0.5">
                        {refinement.beforeMaturity.completenessScore}
                        <ArrowRight className="h-2.5 w-2.5 text-ink-muted" />
                        <strong className="font-medium text-ink">
                          {refinement.afterMaturity.completenessScore}%
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ink-tertiary">
                      <span className="text-ink-muted">TÉCN</span>
                      <span className="inline-flex items-center gap-0.5">
                        {refinement.beforeMaturity.technicalPrecisionScore}
                        <ArrowRight className="h-2.5 w-2.5 text-ink-muted" />
                        <strong className="font-medium text-ink">
                          {refinement.afterMaturity.technicalPrecisionScore}%
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ink-tertiary">
                      <span className="text-ink-muted">CURAD</span>
                      <span className="inline-flex items-center gap-0.5">
                        {refinement.beforeMaturity.curationScore}
                        <ArrowRight className="h-2.5 w-2.5 text-ink-muted" />
                        <strong className="font-medium text-ink">
                          {refinement.afterMaturity.curationScore}%
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Correções injetadas */}
                {refinement.injectedFixes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {refinement.injectedFixes.map((fx) => (
                      <span
                        key={fx}
                        className="tabular-mono inline-flex items-center gap-1 rounded-lg border border-hairline bg-canvas px-2 py-0.5 text-[10px] text-ink-secondary"
                      >
                        <Sparkles className="h-2.5 w-2.5 text-tier-s" />
                        <span>{fx}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Editor Protagonista */}
                <textarea
                  value={refinedEditorText}
                  onChange={(e) => {
                    setRefinedEditorText(e.target.value)
                    setManuallyEdited(true)
                  }}
                  rows={9}
                  spellCheck={false}
                  aria-label="Prompt lapidado para Raro + Maduro"
                  className="club-prompt-well min-h-[180px] w-full flex-1 p-3.5 font-mono text-[11px] leading-relaxed text-ink focus:border-border-hover focus:outline-none"
                />

                {/* Barra de Ações */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setManuallyEdited(false)
                        setRefinedEditorText(refinement.refinedPrompt)
                      }}
                      className="club-btn-ghost cursor-pointer px-3.5 py-1.5 text-[11px]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restaurar molde</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyText(refinedEditorText, 'refine-copy')}
                      className="club-btn-primary cursor-pointer px-4 py-1.5 text-[11px]"
                    >
                      <span
                        key={copiedKey === 'refine-copy' ? 'copied' : 'copy'}
                        className="lab-state-swap inline-flex items-center gap-1.5"
                      >
                        {copiedKey === 'refine-copy' ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedKey === 'refine-copy' ? 'Copiado' : 'Copiar lapidado'}</span>
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveRefinementToNotebook()}
                    className="club-btn-gold cursor-pointer px-4 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      key={savedNotice ? 'saved' : saving ? 'saving' : 'idle'}
                      className="lab-state-swap inline-flex items-center gap-1.5"
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
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
