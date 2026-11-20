import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FC,
} from 'react'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  LayoutGrid,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { QUADRANT_META, TIER_THRESHOLDS } from '../../core/rarityEngine'
import type {
  CorpusOverviewStats,
  MacroFormat,
  PromptItem,
  PromptsQueryResponse,
  RarityQuadrant,
  RarityTier,
  SourceLibFilter,
} from '../../types/promptEngine'
import { TIER_COLOR_META } from '../utils/themeTokens'
import { PromptCollectionCard } from './PromptCollectionCard'
import { PromptThumb } from './PromptThumb'

interface CollectionViewProps {
  sourceLib: SourceLibFilter
  stats: CorpusOverviewStats | null
  selectedItem: PromptItem | null
  initialSearchQuery?: string
  activeProjectFilter?: string | 'all'
  onProjectFilterChange?: (project: string | 'all') => void
  onSelectItem: (item: PromptItem) => void
  onOpenSchemaModal: () => void
  exploredPromptIds?: string[]
  collectedTierSIds?: string[]
  isFavorite?: (promptId: string) => boolean
  onToggleFavorite?: (item: PromptItem) => void
  gridColumns?: number
  gridGap?: number
  cardRadius?: number
  albumMode?: 'masonry' | 'binder'
  onChangeAlbumMode?: (mode: 'masonry' | 'binder') => void
  onOpenGridCustomizer?: () => void
}

type SortMode = 'rarity_desc' | 'maturity_desc' | 'rarity_asc' | 'attributes_desc'

const PAGE_LIMIT = 48

const QUADRANT_ORDER: RarityQuadrant[] = [
  'raro_maduro',
  'raro_imaturo',
  'comum_maduro',
  'comum_imaturo',
]

const FOLDER_TONE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['#24293d', '#3a2a47'],
  ['#2a3a33', '#273545'],
  ['#3c2c38', '#252b3b'],
  ['#2c3144', '#40283d'],
  ['#26383a', '#352e45'],
  ['#332d42', '#263937'],
]

function getFolderTones(name: string): readonly [string, string] {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return FOLDER_TONE_PAIRS[hash % FOLDER_TONE_PAIRS.length]
}

function getFolderMonogram(name: string): string {
  const parts = name
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'PE'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function estimateCardHeightPct(arStr: string | undefined): number {
  if (!arStr) return 133.3
  const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(arStr.trim())
  if (!match) return 133.3
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 133.3
  const ratio = Math.max(0.55, Math.min(1.55, w / h))
  return (1 / ratio) * 100
}

function describeSourceScope(sourceLib: SourceLibFilter, stats: CorpusOverviewStats | null) {
  if (sourceLib === 'gemini_kimi') {
    return {
      name: 'Gemini Kimi + Antigravity.library',
      total: stats?.geminiKimiSize ?? 0,
    }
  }
  if (sourceLib === 'all') {
    return {
      name: 'Google Flow + Gemini Kimi (Corpus Unificado)',
      total: stats?.totalCorpusSize ?? 0,
    }
  }
  return {
    name: stats?.primaryLibraryName ?? 'Google Flow + Prompts.library',
    total: stats?.googleFlowSize ?? 0,
  }
}

export const CollectionView: FC<CollectionViewProps> = ({
  sourceLib,
  stats,
  selectedItem,
  initialSearchQuery = '',
  activeProjectFilter = 'all',
  onProjectFilterChange,
  onSelectItem,
  onOpenSchemaModal,
  exploredPromptIds = [],
  isFavorite,
  onToggleFavorite,
  gridColumns = 5,
  gridGap = 16,
  cardRadius = 8,
  albumMode = 'masonry',
  onChangeAlbumMode,
  onOpenGridCustomizer,
}) => {
  const [queryInput, setQueryInput] = useState(initialSearchQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearchQuery.trim())
  const [searchFocused, setSearchFocused] = useState(false)
  const [tierFilter, setTierFilter] = useState<'all' | RarityTier>('all')
  const [quadrantFilter, setQuadrantFilter] = useState<'all' | RarityQuadrant>('all')
  const [formatFilter, setFormatFilter] = useState<'all' | MacroFormat>('all')
  const [projectFilter, setProjectFilter] = useState<string>(activeProjectFilter)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('rarity_desc')
  const [offset, setOffset] = useState(0)
  const [metricsOpen, setMetricsOpen] = useState(false)

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  )

  const [response, setResponse] = useState<PromptsQueryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [cachedProjectThumbs, setCachedProjectThumbs] = useState<Record<string, string[]>>({})

  const exploredSet = useMemo(() => new Set(exploredPromptIds), [exploredPromptIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    setProjectFilter(activeProjectFilter)
    setOffset(0)
  }, [activeProjectFilter])

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setQueryInput(initialSearchQuery)
      setDebouncedQuery(initialSearchQuery.trim())
      setOffset(0)
    }
  }, [initialSearchQuery])

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
    params.set('offset', String(favoritesOnly ? 0 : offset))
    params.set('limit', String(favoritesOnly ? 120 : PAGE_LIMIT))

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
  }, [
    debouncedQuery,
    sourceLib,
    tierFilter,
    quadrantFilter,
    formatFilter,
    projectFilter,
    sortMode,
    offset,
    favoritesOnly,
  ])

  const rawItems = response?.items ?? []

  // Cacheia até 2 thumbs reais por pasta para manter os cards de "Pastas em destaque" sempre visuais
  useEffect(() => {
    if (rawItems.length === 0) return
    setCachedProjectThumbs((prev) => {
      let changed = false
      const next = { ...prev }
      for (const it of rawItems) {
        if (!it.thumbnailUrl || !it.project) continue
        const cur = next[it.project] ?? []
        if (cur.length >= 2 || cur.includes(it.thumbnailUrl)) continue
        next[it.project] = [...cur, it.thumbnailUrl]
        changed = true
      }
      return changed ? next : prev
    })
  }, [rawItems])

  const hasActiveFilters =
    Boolean(queryInput.trim()) ||
    tierFilter !== 'all' ||
    quadrantFilter !== 'all' ||
    formatFilter !== 'all' ||
    projectFilter !== 'all' ||
    favoritesOnly

  const resetFilters = () => {
    setQueryInput('')
    setDebouncedQuery('')
    setTierFilter('all')
    setQuadrantFilter('all')
    setFormatFilter('all')
    setProjectFilter('all')
    setFavoritesOnly(false)
    setOffset(0)
    onProjectFilterChange?.('all')
  }

  const changePage = (nextOffset: number) => {
    setOffset(Math.max(0, nextOffset))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scopeMeta = describeSourceScope(sourceLib, stats)
  const items = useMemo(() => {
    if (!favoritesOnly || !isFavorite) return rawItems
    return rawItems.filter((it) => isFavorite(it.id))
  }, [rawItems, favoritesOnly, isFavorite])

  const totalMatching = response?.totalMatching ?? 0
  const projects = response?.projects ?? []
  const tierCounts = response?.tierCounts ?? { S: 0, A: 0, B: 0, C: 0, D: 0 }
  const quadrantCounts = response?.quadrantCounts ?? {
    raro_maduro: 0,
    raro_imaturo: 0,
    comum_maduro: 0,
    comum_imaturo: 0,
  }

  const startIdx = totalMatching === 0 ? 0 : offset + 1
  const endIdx = Math.min(offset + rawItems.length, totalMatching)
  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_LIMIT))
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1

  const tierSumFromCounts =
    tierCounts.S + tierCounts.A + tierCounts.B + tierCounts.C + tierCounts.D
  const activeTierCounts =
    tierSumFromCounts > 0 ? tierCounts : (stats?.tierDistribution ?? tierCounts)
  const activeTierTotal =
    activeTierCounts.S +
    activeTierCounts.A +
    activeTierCounts.B +
    activeTierCounts.C +
    activeTierCounts.D

  const tierSInScope = activeTierCounts.S
  const corpusTotalTierS = Math.max(tierSInScope, stats?.tierDistribution.S ?? tierSInScope)
  const isSubsetView =
    sourceLib !== 'all' ||
    projectFilter !== 'all' ||
    Boolean(debouncedQuery) ||
    tierFilter !== 'all' ||
    quadrantFilter !== 'all' ||
    formatFilter !== 'all'

  const rareMatureCount = quadrantCounts.raro_maduro
  const rareImmatureCount = quadrantCounts.raro_imaturo
  const totalRareCount = rareMatureCount + rareImmatureCount
  const rareMaturePct =
    totalRareCount > 0 ? Math.round((rareMatureCount / totalRareCount) * 100) : 0
  const tierSSharePct =
    corpusTotalTierS > 0 ? Math.round((tierSInScope / corpusTotalTierS) * 100) : 0

  const completenessPct = totalRareCount > 0 ? rareMaturePct : tierSSharePct
  const completenessBarWidth =
    completenessPct === 0 ? 0 : Math.max(2, Math.min(100, completenessPct))

  type PillKey =
    | 'all'
    | 'tier_S'
    | 'tier_A'
    | 'tier_B'
    | 'tier_C'
    | 'tier_D'
    | 'favorites'
    | 'quad_raro_maduro'
    | 'quad_raro_imaturo'
    | 'fmt_json'
    | 'fmt_sections'
    | 'fmt_single_paragraph'

  const isPillActive = (key: PillKey): boolean => {
    if (key === 'all') {
      return (
        !favoritesOnly &&
        tierFilter === 'all' &&
        quadrantFilter === 'all' &&
        formatFilter === 'all'
      )
    }
    if (key === 'favorites') return favoritesOnly
    if (key.startsWith('tier_')) return tierFilter === key.replace('tier_', '')
    if (key === 'quad_raro_maduro') return quadrantFilter === 'raro_maduro'
    if (key === 'quad_raro_imaturo') return quadrantFilter === 'raro_imaturo'
    if (key === 'fmt_json') return formatFilter === 'json'
    if (key === 'fmt_sections') return formatFilter === 'sections'
    if (key === 'fmt_single_paragraph') return formatFilter === 'single_paragraph'
    return false
  }

  const selectFilterPill = (key: PillKey) => {
    setOffset(0)
    if (key === 'all') {
      setTierFilter('all')
      setQuadrantFilter('all')
      setFormatFilter('all')
      setFavoritesOnly(false)
      return
    }
    if (key === 'favorites') {
      setFavoritesOnly((v) => !v)
      return
    }
    if (key.startsWith('tier_')) {
      const t = key.replace('tier_', '') as RarityTier
      setFavoritesOnly(false)
      setTierFilter(tierFilter === t ? 'all' : t)
      return
    }
    if (key === 'quad_raro_maduro') {
      setFavoritesOnly(false)
      setQuadrantFilter(quadrantFilter === 'raro_maduro' ? 'all' : 'raro_maduro')
      return
    }
    if (key === 'quad_raro_imaturo') {
      setFavoritesOnly(false)
      setQuadrantFilter(quadrantFilter === 'raro_imaturo' ? 'all' : 'raro_imaturo')
      return
    }
    if (key.startsWith('fmt_')) {
      const fmt = key.replace('fmt_', '') as MacroFormat
      setFavoritesOnly(false)
      setFormatFilter(formatFilter === fmt ? 'all' : fmt)
    }
  }

  const filterPills: ReadonlyArray<{ key: PillKey; label: string; dotColor?: string }> = [
    { key: 'all', label: 'Popular' },
    { key: 'tier_S', label: 'Tier S', dotColor: TIER_COLOR_META.S.barColor },
    { key: 'tier_A', label: 'Tier A', dotColor: TIER_COLOR_META.A.barColor },
    { key: 'tier_B', label: 'Tier B', dotColor: TIER_COLOR_META.B.barColor },
    { key: 'tier_C', label: 'Tier C', dotColor: TIER_COLOR_META.C.barColor },
    { key: 'tier_D', label: 'Tier D', dotColor: TIER_COLOR_META.D.barColor },
    { key: 'favorites', label: 'Salvos' },
    { key: 'quad_raro_maduro', label: 'Raro + Maduro' },
    { key: 'quad_raro_imaturo', label: 'Raro + Imaturo' },
    { key: 'fmt_json', label: 'JSON' },
    { key: 'fmt_sections', label: 'Seções' },
    { key: 'fmt_single_paragraph', label: 'Parágrafo' },
  ]

  // Balanceamento de colunas Masonry estilo Savee (esquerda→direita pela menor coluna)
  const effectiveCols =
    viewportWidth < 640
      ? Math.min(2, gridColumns)
      : viewportWidth < 1024
        ? Math.min(3, gridColumns)
        : gridColumns

  const balancedColumns = useMemo(() => {
    const out: Array<Array<{ item: PromptItem; catalogIndex: number }>> = Array.from(
      { length: effectiveCols },
      () => []
    )
    const heights = new Array<number>(effectiveCols).fill(0)
    items.forEach((it, idx) => {
      let minIdx = 0
      for (let c = 1; c < effectiveCols; c++) {
        if (heights[c] < heights[minIdx]) minIdx = c
      }
      out[minIdx].push({ item: it, catalogIndex: offset + idx + 1 })
      heights[minIdx] += estimateCardHeightPct(it.attributes.estrutura.aspectRatio) + 12
    })
    return out
  }, [items, effectiveCols, offset])

  const binderGridStyle = {
    '--album-cols': String(gridColumns),
    gap: `${gridGap}px`,
  } as CSSProperties

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 p-4 sm:px-6 sm:pt-6">
      {/* ───── 1. Savee Filter Pill Strip ───── */}
      <div
        role="region"
        aria-label="Filtros rápidos do códice"
        className="savee-chip-scroller savee-noscroll -mx-1 gap-2 px-1 py-0.5"
      >
        {filterPills.map((pill) => {
          const isOn = isPillActive(pill.key)
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => selectFilterPill(pill.key)}
              className={[
                'lab-pressable inline-flex shrink-0 items-center gap-2 rounded-full border px-5 py-2 text-[14px] font-medium leading-[1.4] transition-colors [transition-duration:var(--dur-fast)] cursor-pointer',
                isOn
                  ? 'border-transparent bg-ink text-canvas'
                  : 'border-hairline bg-transparent text-ink-secondary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink',
              ].join(' ')}
            >
              {pill.dotColor ? (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: pill.dotColor }}
                  aria-hidden="true"
                />
              ) : pill.key === 'favorites' ? (
                <Star className="h-3.5 w-3.5 text-tier-s" />
              ) : null}
              <span>{pill.label}</span>
            </button>
          )
        })}
      </div>

      {/* ───── 2. Faixa "Pastas em destaque" (Réplica 1:1 Savee Trending Cards) ───── */}
      {projects.length > 0 ? (
        <section aria-label="Pastas em destaque">
          <div className="pb-2 text-[14px] font-normal text-ink-muted">
            Pastas em destaque
          </div>
          <div className="savee-noscroll flex gap-2 overflow-x-auto py-1">
            {projects.slice(0, 14).map((proj) => {
              const isSel = projectFilter === proj.name
              const thumbs = cachedProjectThumbs[proj.name] ?? []
              const [toneA, toneB] = getFolderTones(proj.name)
              const monogram = getFolderMonogram(proj.name)

              return (
                <button
                  key={proj.name}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => {
                    const next = isSel ? 'all' : proj.name
                    setProjectFilter(next)
                    setOffset(0)
                    onProjectFilterChange?.(next)
                  }}
                  className={[
                    'lab-pressable-subtle group flex w-[196px] shrink-0 flex-col items-center rounded-[12px] p-2 pb-2.5 text-center transition-colors [transition-duration:var(--dur-fast)] cursor-pointer',
                    isSel
                      ? 'bg-elevated ring-1 ring-inset ring-ink/45'
                      : 'bg-surface [@media(hover:hover)]:hover:bg-elevated',
                  ].join(' ')}
                >
                  {/* 2 miniaturas lado a lado */}
                  <div className="flex w-full gap-[2px] overflow-hidden rounded-[8px]">
                    {[0, 1].map((slotIdx) => {
                      const thumbUrl = thumbs[slotIdx]
                      const fallbackTone = slotIdx === 0 ? toneA : toneB
                      return (
                        <div
                          key={slotIdx}
                          className="h-[76px] flex-1 overflow-hidden"
                          style={{ backgroundColor: fallbackTone }}
                        >
                          {thumbUrl ? (
                            <PromptThumb
                              src={thumbUrl}
                              alt=""
                              loading="lazy"
                              fallbackLabel="·"
                              fallbackClassName="h-full w-full"
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>

                  {/* Avatar circular sobreposto */}
                  <span
                    className={[
                      'relative z-10 -mt-5 flex h-10 w-10 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-ink ring-[3px]',
                      isSel ? 'ring-elevated' : 'ring-surface',
                    ].join(' ')}
                    style={{
                      background: `linear-gradient(135deg, ${toneA}, ${toneB})`,
                      boxShadow: 'inset 0 0 0 1px rgba(253,253,253,0.12)',
                    }}
                  >
                    {monogram}
                  </span>

                  {/* @pasta */}
                  <span className="mt-1.5 flex max-w-full items-center justify-center gap-1 text-[13px] font-medium leading-tight text-ink-secondary">
                    <span className="truncate">@{proj.name}</span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink/75"
                      aria-hidden="true"
                    />
                  </span>

                  {/* Contagem */}
                  <span className="tabular-mono mt-1 text-[11px] leading-none text-ink-muted">
                    {proj.count.toLocaleString('pt-BR')} saves
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ───── 3. Barra de Busca Savee Pill + Controles Compactos ───── */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={[
            'flex h-[48px] min-w-[260px] flex-1 items-center gap-2.5 rounded-full border bg-surface/90 px-3.5 transition-colors [transition-duration:var(--dur-fast)]',
            searchFocused ? 'border-border-strong' : 'border-hairline',
          ].join(' ')}
        >
          {projectFilter !== 'all' ? (
            <span className="inline-flex h-[32px] shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.1] pr-3 pl-1.5">
              <button
                type="button"
                aria-label={`Remover filtro da pasta ${projectFilter}`}
                onClick={() => {
                  setProjectFilter('all')
                  setOffset(0)
                  onProjectFilterChange?.('all')
                }}
                className="group/chip relative h-6 w-6 shrink-0 overflow-hidden rounded-full cursor-pointer"
                style={{ background: 'linear-gradient(135deg, var(--color-brand), var(--color-tier-s))' }}
              >
                <span className="absolute inset-0 flex items-center justify-center bg-ink text-canvas opacity-0 transition-opacity [@media(hover:hover)]:group-hover/chip:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </span>
              </button>
              <span className="max-w-[150px] truncate text-[13px] font-medium text-ink">
                @{projectFilter}
              </span>
            </span>
          ) : (
            <Search className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
          )}

          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={
              projectFilter !== 'all'
                ? `Buscar em @${projectFilter} (lente, tecido, luz...)`
                : 'Buscar inspiração FTS5 (lente, tecido, luz, sujeito...)'
            }
            aria-label="Buscar no códice"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-muted focus:outline-none"
          />

          {queryInput ? (
            <button
              type="button"
              onClick={() => setQueryInput('')}
              aria-label="Limpar busca"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Controles compactos à direita */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as SortMode)
              setOffset(0)
            }}
            className="h-[40px] rounded-full border border-hairline bg-surface px-3.5 text-[12px] text-ink-secondary focus:border-border-hover focus:outline-none cursor-pointer"
            aria-label="Ordenar coleção"
          >
            <option value="rarity_desc">Mais raros</option>
            <option value="maturity_desc">Mais maduros</option>
            <option value="attributes_desc">Mais completos</option>
            <option value="rarity_asc">Mais comuns</option>
          </select>

          {onChangeAlbumMode ? (
            <div className="inline-flex h-[40px] items-center rounded-full border border-hairline bg-surface p-0.5">
              <button
                type="button"
                onClick={() => onChangeAlbumMode('masonry')}
                className={[
                  'lab-pressable inline-flex h-full items-center gap-1.5 rounded-full px-3 text-[12px] font-medium cursor-pointer',
                  albumMode === 'masonry'
                    ? 'bg-ink text-canvas'
                    : 'text-ink-tertiary [@media(hover:hover)]:hover:text-ink',
                ].join(' ')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Masonry</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeAlbumMode('binder')}
                className={[
                  'lab-pressable inline-flex h-full items-center gap-1.5 rounded-full px-3 text-[12px] font-medium cursor-pointer',
                  albumMode === 'binder'
                    ? 'bg-ink text-canvas'
                    : 'text-ink-tertiary [@media(hover:hover)]:hover:text-ink',
                ].join(' ')}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
                <span>Binder</span>
              </button>
            </div>
          ) : null}

          {onOpenGridCustomizer ? (
            <button
              type="button"
              onClick={onOpenGridCustomizer}
              className="lab-pressable inline-flex h-[40px] items-center gap-1.5 rounded-full border border-hairline bg-surface px-3.5 text-[12px] font-medium text-ink-secondary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{gridColumns} col</span>
            </button>
          ) : null}

          <button
            type="button"
            aria-expanded={metricsOpen}
            onClick={() => setMetricsOpen((v) => !v)}
            className={[
              'lab-pressable inline-flex h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium cursor-pointer',
              metricsOpen
                ? 'border-border-strong bg-elevated text-ink'
                : 'border-hairline bg-surface text-ink-secondary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink',
            ].join(' ')}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Métricas</span>
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              aria-label="Limpar filtros"
              className="lab-pressable inline-flex h-[40px] items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 text-[12px] text-ink-secondary [@media(hover:hover)]:hover:text-ink cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          ) : null}

          <span className="tabular-mono px-1 text-[11px] text-ink-muted">
            {loading && !response
              ? 'Buscando...'
              : favoritesOnly
                ? `${items.length} salvos`
                : `${totalMatching.toLocaleString('pt-BR')} / ${scopeMeta.total.toLocaleString('pt-BR')}`}
          </span>
        </div>
      </div>

      {/* ───── 4. Painel Colapsável de Métricas do Códice & Schema (sob demanda) ───── */}
      {metricsOpen ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="section-eyebrow">Códice do Colecionador · {scopeMeta.name}</span>
              <span className="tabular-mono text-[11px] font-medium text-tier-s">
                {isSubsetView
                  ? `${tierSInScope.toLocaleString('pt-BR')} de ${corpusTotalTierS.toLocaleString('pt-BR')} Tier S (${tierSSharePct}%)`
                  : `${tierSInScope.toLocaleString('pt-BR')} Tier S no acervo`}
                {totalRareCount > 0
                  ? ` · ${rareMatureCount.toLocaleString('pt-BR')} de ${totalRareCount.toLocaleString('pt-BR')} Raros Maduros (${rareMaturePct}%)`
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="tabular-mono text-[11px] text-ink-tertiary">
                {activeTierTotal.toLocaleString('pt-BR')} cartas no escopo
                {exploredPromptIds.length > 0
                  ? ` · ${exploredPromptIds.length.toLocaleString('pt-BR')} inspecionadas`
                  : ''}
              </span>
              <button
                type="button"
                onClick={onOpenSchemaModal}
                className="lab-pressable rounded-full border border-hairline bg-elevated px-3 py-1 text-[11px] font-medium text-ink-secondary [@media(hover:hover)]:hover:border-border-hover [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                Inspecionar schema
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="tabular-mono inline-flex flex-wrap items-center gap-1 text-ink-muted">
                  <span>Lapidação dos Raros</span>
                  {rareImmatureCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFavoritesOnly(false)
                        setTierFilter('all')
                        setQuadrantFilter('raro_imaturo')
                        setOffset(0)
                      }}
                      className="inline-flex items-center gap-1 text-[10px] text-tier-s underline-offset-2 hover:underline cursor-pointer"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      <span>({rareImmatureCount.toLocaleString('pt-BR')} para forjar)</span>
                    </button>
                  ) : (
                    <span>(100% maduros)</span>
                  )}
                </span>
                <span className="tabular-mono text-tier-s">{completenessPct}%</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-hairline"
                role="progressbar"
                aria-label="Maturação dos prompts raros coletados"
                aria-valuenow={completenessPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                  style={{
                    transform: `scaleX(${completenessBarWidth / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="tabular-mono text-ink-muted">Distribuição por Raridade (S a D)</span>
                <div className="flex items-center gap-2">
                  {TIER_THRESHOLDS.map((t) => (
                    <span
                      key={t.tier}
                      className={['tabular-mono text-[9px]', TIER_COLOR_META[t.tier].textClass].join(' ')}
                    >
                      {t.tier}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-hairline"
                aria-label="Distribuição proporcional dos tiers S a D no escopo ativo"
              >
                {TIER_THRESHOLDS.map((t) => {
                  const segCount = activeTierCounts[t.tier] ?? 0
                  if (segCount <= 0 || activeTierTotal <= 0) return null
                  const segPct = (segCount / activeTierTotal) * 100
                  return (
                    <div
                      key={t.tier}
                      className="h-full"
                      style={{
                        width: `${segPct}%`,
                        backgroundColor: TIER_COLOR_META[t.tier].barColor,
                      }}
                      aria-label={`Tier ${t.tier}: ${segCount.toLocaleString('pt-BR')} (${segPct.toFixed(1)}%)`}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="rounded-xl bg-canvas p-3 xl:col-span-5">
              <div className="flex items-center justify-between gap-2">
                <span className="section-eyebrow">Distribuição por Tier</span>
                <span className="tabular-mono text-[10px] text-ink-muted">S ≥ P95 · A ≥ P80</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {TIER_THRESHOLDS.map((t) => {
                  const count = tierCounts[t.tier] ?? 0
                  const active = tierFilter === t.tier
                  const meta = TIER_COLOR_META[t.tier]
                  return (
                    <button
                      key={t.tier}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFavoritesOnly(false)
                        setTierFilter(active ? 'all' : t.tier)
                        setOffset(0)
                      }}
                      className={[
                        'press-scale relative flex flex-col items-start justify-between overflow-hidden rounded-xl border p-2 text-left transition-colors cursor-pointer',
                        active
                          ? `${meta.borderClass} ${meta.bgSubtleClass}`
                          : 'border-hairline bg-surface [@media(hover:hover)]:hover:border-border-hover',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-[2px]"
                        style={{ backgroundColor: meta.barColor }}
                      />
                      <span className={['tabular-mono text-[10px] font-medium', meta.textClass].join(' ')}>
                        TIER {t.tier}
                      </span>
                      <span className="mt-1.5 tabular-mono text-base font-medium text-ink">
                        {count.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl bg-canvas p-3 xl:col-span-7">
              <div className="flex items-center justify-between gap-2">
                <span className="section-eyebrow">Raridade × Maturidade</span>
                <span className="tabular-mono text-[10px] text-ink-muted">Corte P70 × MAT 60</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUADRANT_ORDER.map((qKey) => {
                  const meta = QUADRANT_META[qKey]
                  const count = quadrantCounts[qKey] ?? 0
                  const active = quadrantFilter === qKey
                  return (
                    <button
                      key={qKey}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFavoritesOnly(false)
                        setQuadrantFilter(active ? 'all' : qKey)
                        setOffset(0)
                      }}
                      className={[
                        'press-scale flex flex-col justify-between rounded-xl border p-2 text-left transition-colors cursor-pointer',
                        active
                          ? 'border-border-strong bg-elevated'
                          : 'border-hairline bg-surface [@media(hover:hover)]:hover:border-border-hover',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="tabular-mono text-[9px] font-medium text-ink-secondary">
                          {meta.shortLabel}
                        </span>
                        <span className="tabular-mono text-[12px] font-medium text-ink">
                          {count.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-muted">
                        {meta.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ───── 5. Grade de Cartas (Savee Balanced Columns Masonry vs. Codex Binder 3:4) ───── */}
      {fetchError ? (
        <div className="rounded-2xl bg-surface p-8 text-center">
          <p className="font-mono text-[12px] text-ink-secondary">
            Falha ao consultar SQLite FTS5: {fetchError}
          </p>
        </div>
      ) : loading && rawItems.length === 0 ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--album-cols),minmax(0,1fr))]"
          style={binderGridStyle}
        >
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              style={{ borderRadius: `${cardRadius}px` }}
              className="lab-skeleton-shimmer aspect-[3/4]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-surface p-10 text-center">
          <p className="text-[13px] text-ink-tertiary">
            {favoritesOnly
              ? 'Nenhuma carta marcada como favorita neste recorte.'
              : 'Nenhum prompt encontrado no índice FTS5 com os filtros atuais.'}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="lab-pressable mt-3 rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-canvas cursor-pointer"
          >
            Redefinir filtros
          </button>
        </div>
      ) : (
        <>
          {albumMode === 'binder' ? (
            <section
              style={binderGridStyle}
              className={[
                'grid grid-cols-2 transition-opacity sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--album-cols),minmax(0,1fr))]',
                loading ? 'opacity-70' : 'opacity-100',
              ].join(' ')}
            >
              {items.map((item, idx) => (
                <PromptCollectionCard
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  isFavorite={isFavorite?.(item.id) ?? false}
                  onToggleFavorite={onToggleFavorite}
                  onSelect={onSelectItem}
                  cornerRadius={cardRadius}
                  binderMode
                  catalogNumber={offset + idx + 1}
                  isExplored={exploredSet.has(item.id)}
                />
              ))}
            </section>
          ) : (
            <section
              className={[
                'flex items-start transition-opacity',
                loading ? 'opacity-70' : 'opacity-100',
              ].join(' ')}
              style={{ gap: `${gridGap}px` }}
            >
              {balancedColumns.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className="flex min-w-0 flex-1 flex-col"
                  style={{ gap: `${gridGap}px` }}
                >
                  {col.map(({ item, catalogIndex }) => (
                    <PromptCollectionCard
                      key={item.id}
                      item={item}
                      selected={selectedItem?.id === item.id}
                      isFavorite={isFavorite?.(item.id) ?? false}
                      onToggleFavorite={onToggleFavorite}
                      onSelect={onSelectItem}
                      cornerRadius={cardRadius}
                      binderMode={false}
                      catalogNumber={catalogIndex}
                      isExplored={exploredSet.has(item.id)}
                    />
                  ))}
                </div>
              ))}
            </section>
          )}

          {/* Paginação limpa */}
          {!favoritesOnly ? (
            <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="tabular-mono text-[11px] text-ink-tertiary">
                Exibindo {startIdx.toLocaleString('pt-BR')} a {endIdx.toLocaleString('pt-BR')} de{' '}
                {totalMatching.toLocaleString('pt-BR')} cartas
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={offset === 0 || loading}
                  onClick={() => changePage(offset - PAGE_LIMIT)}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-surface px-3.5 font-mono text-[11px] text-ink-secondary [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>

                <span className="tabular-mono px-2 text-[11px] text-ink-tertiary">
                  Página {currentPage.toLocaleString('pt-BR')} / {totalPages.toLocaleString('pt-BR')}
                </span>

                <button
                  type="button"
                  disabled={offset + PAGE_LIMIT >= totalMatching || loading}
                  onClick={() => changePage(offset + PAGE_LIMIT)}
                  className="lab-pressable inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-surface px-3.5 font-mono text-[11px] text-ink-secondary [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <span>Próxima</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          ) : null}
        </>
      )}
    </div>
  )
}
