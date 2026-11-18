import { useEffect, useState, type FC } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { QUADRANT_META, TIER_THRESHOLDS } from '../core/rarityEngine'
import type {
  CorpusOverviewStats,
  MacroFormat,
  PromptItem,
  PromptsQueryResponse,
  RarityQuadrant,
  RarityTier,
  SourceLibFilter,
} from '../types/promptEngine'
import { PromptCollectionCard } from './PromptCollectionCard'

interface CollectionViewProps {
  sourceLib: SourceLibFilter
  stats: CorpusOverviewStats | null
  selectedItem: PromptItem | null
  activeProjectFilter?: string | 'all'
  onProjectFilterChange?: (project: string | 'all') => void
  onSelectItem: (item: PromptItem) => void
  onOpenSchemaModal: () => void
}

type SortMode = 'rarity_desc' | 'maturity_desc' | 'rarity_asc' | 'attributes_desc'

const PAGE_LIMIT = 48

const FORMAT_FILTER_OPTIONS: ReadonlyArray<{ value: 'all' | MacroFormat; label: string }> = [
  { value: 'all', label: 'Todos os formatos' },
  { value: 'json', label: 'JSON' },
  { value: 'sections', label: 'Seções' },
  { value: 'single_paragraph', label: 'Parágrafo Único' },
]

const QUADRANT_ORDER: RarityQuadrant[] = [
  'raro_maduro',
  'raro_imaturo',
  'comum_maduro',
  'comum_imaturo',
]

function describeSourceScope(sourceLib: SourceLibFilter, stats: CorpusOverviewStats | null) {
  if (sourceLib === 'gemini_kimi') {
    return {
      name: 'Gemini Kimi + Antigravity.library',
      total: stats?.geminiKimiSize ?? 3055,
    }
  }
  if (sourceLib === 'all') {
    return {
      name: 'Google Flow + Gemini Kimi (Corpus Unificado)',
      total: stats?.totalCorpusSize ?? 22282,
    }
  }
  return {
    name: stats?.primaryLibraryName ?? 'Google Flow + Prompts.library',
    total: stats?.googleFlowSize ?? 19227,
  }
}

export const CollectionView: FC<CollectionViewProps> = ({
  sourceLib,
  stats,
  selectedItem,
  activeProjectFilter = 'all',
  onProjectFilterChange,
  onSelectItem,
  onOpenSchemaModal,
}) => {
  const [queryInput, setQueryInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | RarityTier>('all')
  const [quadrantFilter, setQuadrantFilter] = useState<'all' | RarityQuadrant>('all')
  const [formatFilter, setFormatFilter] = useState<'all' | MacroFormat>('all')
  const [projectFilter, setProjectFilter] = useState<string>(activeProjectFilter)
  const [sortMode, setSortMode] = useState<SortMode>('rarity_desc')
  const [offset, setOffset] = useState(0)

  const [response, setResponse] = useState<PromptsQueryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    setProjectFilter(activeProjectFilter)
    setOffset(0)
  }, [activeProjectFilter])

  useEffect(() => {
    setOffset(0)
  }, [sourceLib])

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
    const controller = new AbortController()
    setLoading(true)
    setFetchError(null)

    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('sourceLib', sourceLib)
    if (tierFilter !== 'all') params.set('tier', tierFilter)
    if (quadrantFilter !== 'all') params.set('quadrant', quadrantFilter)
    if (formatFilter !== 'all') params.set('format', formatFilter)
    if (projectFilter !== 'all') params.set('project', projectFilter)
    params.set('sort', sortMode)
    params.set('offset', String(offset))
    params.set('limit', String(PAGE_LIMIT))

    fetch(`/api/prompts?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as PromptsQueryResponse
      })
      .then((payload) => {
        setResponse(payload)
        setLoading(false)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setFetchError(String(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [debouncedQuery, sourceLib, tierFilter, quadrantFilter, formatFilter, projectFilter, sortMode, offset])

  const hasActiveFilters =
    Boolean(queryInput.trim()) ||
    tierFilter !== 'all' ||
    quadrantFilter !== 'all' ||
    formatFilter !== 'all' ||
    projectFilter !== 'all'

  const resetFilters = () => {
    setQueryInput('')
    setDebouncedQuery('')
    setTierFilter('all')
    setQuadrantFilter('all')
    setFormatFilter('all')
    setProjectFilter('all')
    setOffset(0)
    onProjectFilterChange?.('all')
  }

  const changePage = (nextOffset: number) => {
    setOffset(Math.max(0, nextOffset))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scopeMeta = describeSourceScope(sourceLib, stats)
  const items = response?.items ?? []
  const totalMatching = response?.totalMatching ?? 0
  const projects = response?.projects ?? []
  const tierCounts = response?.tierCounts ?? { S: 0, A: 0, B: 0, C: 0, D: 0 }
  const quadrantCounts = response?.quadrantCounts ?? {
    raro_maduro: 0,
    raro_imaturo: 0,
    comum_maduro: 0,
    comum_imaturo: 0,
  }
  const formatCounts = response?.formatCounts

  const startIdx = totalMatching === 0 ? 0 : offset + 1
  const endIdx = Math.min(offset + items.length, totalMatching)
  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_LIMIT))
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <span className="section-eyebrow">
            Coleção · SQLite FTS5 (Acervo Completo)
          </span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-zinc-100">
            Inventário de Prompts & Escala de Raridade
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Consulta direta em{' '}
            <span className="tabular-mono text-zinc-200">
              {scopeMeta.total.toLocaleString('pt-BR')}
            </span>{' '}
            prompts reais de <span className="text-zinc-200">{scopeMeta.name}</span> (corpus total{' '}
            <span className="tabular-mono text-zinc-300">
              {(stats?.totalCorpusSize ?? 22282).toLocaleString('pt-BR')}
            </span>
            ).
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSchemaModal}
          className="rounded-xl border border-white/[0.09] bg-[#111115] px-3 py-2 text-[12px] text-zinc-300 hover:border-white/[0.2] hover:text-zinc-100 cursor-pointer"
        >
          Esquema & Definição de Gap
        </button>
      </header>

      {/* Tiers S–D + Matriz Raridade × Maturidade */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <span className="section-eyebrow">Distribuição por Tier (Percentil Inverso)</span>
            <span className="tabular-mono text-[10px] text-zinc-500">S ≥ P95 · A ≥ P80</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {TIER_THRESHOLDS.map((t) => {
              const count = tierCounts[t.tier] ?? 0
              const active = tierFilter === t.tier
              const isS = t.tier === 'S'
              return (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => {
                    setTierFilter(active ? 'all' : t.tier)
                    setOffset(0)
                  }}
                  className={[
                    'flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                    active
                      ? isS
                        ? 'border-[#e5a93c]/70 bg-[#e5a93c]/10'
                        : 'border-white/30 bg-white/[0.06]'
                      : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.16]',
                  ].join(' ')}
                  title={t.description}
                >
                  <span
                    className={[
                      'tabular-mono text-[11px] font-medium',
                      isS ? 'text-[#e5a93c]' : 'text-zinc-300',
                    ].join(' ')}
                  >
                    TIER {t.tier}
                  </span>
                  <span className="mt-2 tabular-mono text-lg font-medium text-zinc-100">
                    {count.toLocaleString('pt-BR')}
                  </span>
                  <span className="tabular-mono text-[10px] text-zinc-500">
                    P≥{t.minPercentile}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <span className="section-eyebrow">
              Raridade × Maturidade — Onde está o valor vs. território virgem?
            </span>
            <span className="tabular-mono text-[10px] text-zinc-500">Corte P70 × MAT 60</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUADRANT_ORDER.map((qKey) => {
              const meta = QUADRANT_META[qKey]
              const count = quadrantCounts[qKey] ?? 0
              const active = quadrantFilter === qKey
              return (
                <button
                  key={qKey}
                  type="button"
                  onClick={() => {
                    setQuadrantFilter(active ? 'all' : qKey)
                    setOffset(0)
                  }}
                  className={[
                    'flex flex-col justify-between rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                    active
                      ? 'border-white/30 bg-white/[0.06]'
                      : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.16]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="tabular-mono text-[10px] font-medium text-zinc-300">
                      {meta.shortLabel}
                    </span>
                    <span className="tabular-mono text-[13px] font-medium text-zinc-100">
                      {count.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                    {meta.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Barra de Busca e Filtros */}
      <section className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-[#101013] p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Busca FTS5 instantânea (lente, tecido, luz, tag, arquivo, sujeito)..."
            className="w-full rounded-xl border border-white/[0.07] bg-[#09090b] py-2 pr-3 pl-9 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
          />
        </div>

        <select
          value={formatFilter}
          onChange={(e) => {
            setFormatFilter(e.target.value as 'all' | MacroFormat)
            setOffset(0)
          }}
          className="rounded-xl border border-white/[0.08] bg-[#09090b] px-3 py-2 text-[12px] text-zinc-300 focus:border-white/25 focus:outline-none"
          aria-label="Filtrar por formato"
        >
          {FORMAT_FILTER_OPTIONS.map((opt) => {
            const cnt =
              opt.value === 'all' || !formatCounts
                ? null
                : formatCounts[opt.value]?.toLocaleString('pt-BR')
            return (
              <option key={opt.value} value={opt.value}>
                {cnt ? `${opt.label} (${cnt})` : opt.label}
              </option>
            )
          })}
        </select>

        <select
          value={projectFilter}
          onChange={(e) => {
            const val = e.target.value
            setProjectFilter(val)
            setOffset(0)
            onProjectFilterChange?.(val)
          }}
          className="max-w-[240px] rounded-xl border border-white/[0.08] bg-[#09090b] px-3 py-2 text-[12px] text-zinc-300 focus:border-white/25 focus:outline-none"
          aria-label="Filtrar por projeto"
        >
          <option value="all">
            Todos os projetos ({scopeMeta.total.toLocaleString('pt-BR')})
          </option>
          {projects.map((proj) => (
            <option key={proj.name} value={proj.name}>
              {proj.name} ({proj.count.toLocaleString('pt-BR')})
            </option>
          ))}
        </select>

        <select
          value={sortMode}
          onChange={(e) => {
            setSortMode(e.target.value as SortMode)
            setOffset(0)
          }}
          className="rounded-xl border border-white/[0.08] bg-[#09090b] px-3 py-2 text-[12px] text-zinc-300 focus:border-white/25 focus:outline-none"
          aria-label="Ordenar coleção"
        >
          <option value="rarity_desc">Mais raros primeiro</option>
          <option value="maturity_desc">Mais maduros primeiro</option>
          <option value="attributes_desc">Mais completos (8/8)</option>
          <option value="rarity_asc">Mais comuns primeiro</option>
        </select>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#16161b] px-3 py-2 text-[12px] text-zinc-300 hover:border-white/[0.2] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpar</span>
          </button>
        ) : null}

        <span className="tabular-mono ml-auto px-1 text-[11px] text-zinc-500">
          {loading && !response
            ? 'Buscando...'
            : `${totalMatching.toLocaleString('pt-BR')} / ${scopeMeta.total.toLocaleString('pt-BR')}`}
        </span>
      </section>

      {/* Grade de Cards */}
      {fetchError ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-8 text-center">
          <p className="font-mono text-[12px] text-zinc-300">
            Falha ao consultar SQLite FTS5: {fetchError}
          </p>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-[#101013]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-10 text-center">
          <p className="text-[13px] text-zinc-400">
            Nenhum prompt encontrado no índice FTS5 com os filtros atuais.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 rounded-xl border border-white/[0.1] px-3 py-1.5 text-[12px] text-zinc-200 hover:border-white/25 cursor-pointer"
          >
            Redefinir filtros
          </button>
        </div>
      ) : (
        <>
          <section
            className={[
              'grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
              loading ? 'opacity-70' : 'opacity-100',
            ].join(' ')}
          >
            {items.map((item) => (
              <PromptCollectionCard
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onSelect={onSelectItem}
              />
            ))}
          </section>

          {/* Paginação */}
          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-[#101013] px-4 py-3">
            <span className="tabular-mono text-[11px] text-zinc-400">
              Exibindo {startIdx.toLocaleString('pt-BR')}–{endIdx.toLocaleString('pt-BR')} de{' '}
              {totalMatching.toLocaleString('pt-BR')} resultados
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => changePage(offset - PAGE_LIMIT)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#0b0b0e] px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>

              <span className="tabular-mono px-2 text-[11px] text-zinc-400">
                Página {currentPage.toLocaleString('pt-BR')} / {totalPages.toLocaleString('pt-BR')}
              </span>

              <button
                type="button"
                disabled={offset + PAGE_LIMIT >= totalMatching || loading}
                onClick={() => changePage(offset + PAGE_LIMIT)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/[0.09] bg-[#0b0b0e] px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <span>Próxima</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
