import { useEffect, useMemo, useRef, useState, type FC, type KeyboardEvent } from 'react'
import {
  ArrowUpDown,
  ArrowUpRight,
  Clock3,
  Compass,
  CornerDownLeft,
  FlaskConical,
  FolderKanban,
  GitCompare,
  Grid2x2,
  Layers,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  User,
} from 'lucide-react'
import type { NavSectionId } from './AppSidebar'
import type { ProjectsSubTab } from './ProjectsView'

export interface ClubCommandTarget {
  section: NavSectionId
  projectsSubTab?: ProjectsSubTab
  searchQuery?: string
}

interface ClubCommandModalProps {
  open: boolean
  openSource?: 'keyboard' | 'click'
  onClose: () => void
  onNavigate: (target: ClubCommandTarget) => void
}

interface CommandEntry {
  id: string
  group: 'goto' | 'trending'
  label: string
  hint?: string
  accent?: 'gold'
  icon: FC<{ className?: string }>
  target: ClubCommandTarget
}

const STATIC_ENTRIES: readonly CommandEntry[] = [
  {
    id: 'goto-virgem',
    group: 'goto',
    label: 'Território Virgem',
    hint: 'Lapidar Raro + Imaturo',
    accent: 'gold',
    icon: Sparkles,
    target: { section: 'projetos', projectsSubTab: 'refinement' },
  },
  {
    id: 'goto-projetos',
    group: 'goto',
    label: 'Projetos & Coleções',
    hint: 'Pastas de vidro e métricas',
    icon: FolderKanban,
    target: { section: 'projetos', projectsSubTab: 'projects' },
  },
  {
    id: 'goto-timeline',
    group: 'goto',
    label: 'Evolução Temporal',
    hint: 'Safras e deriva criativa',
    icon: Clock3,
    target: { section: 'projetos', projectsSubTab: 'timeline' },
  },
  {
    id: 'goto-colecao',
    group: 'goto',
    label: 'Explorar Coleção',
    hint: 'Filtros por Tier e Quadrante',
    icon: Layers,
    target: { section: 'colecao' },
  },
  {
    id: 'goto-mapa',
    group: 'goto',
    label: 'Mapa Semântico 2D',
    hint: 'Clusters e manchas vazias',
    icon: Compass,
    target: { section: 'mapa' },
  },
  {
    id: 'goto-gaps',
    group: 'goto',
    label: 'Matriz de Gaps',
    hint: 'Cruzamentos virgens O = 0',
    icon: Grid2x2,
    target: { section: 'gaps' },
  },
  {
    id: 'goto-experimentos',
    group: 'goto',
    label: 'Laboratório Experimental',
    hint: 'Colisão 24D & Sonda de Deriva',
    icon: FlaskConical,
    target: { section: 'experimentos' },
  },
  {
    id: 'goto-pares',
    group: 'goto',
    label: 'Pares & Contrastes',
    hint: 'Mesmo esqueleto / assunto',
    icon: GitCompare,
    target: { section: 'pares' },
  },
  {
    id: 'goto-perfil',
    group: 'goto',
    label: 'Perfil do Cartógrafo',
    hint: 'Caderno, favoritos e patente',
    icon: User,
    target: { section: 'perfil' },
  },
  {
    id: 'goto-config',
    group: 'goto',
    label: 'Configurações',
    hint: 'Aparência, feedback e dados',
    icon: Settings,
    target: { section: 'configuracoes' },
  },
  {
    id: 'trend-editorial',
    group: 'trending',
    label: 'editorial',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: 'editorial' },
  },
  {
    id: 'trend-studio',
    group: 'trending',
    label: 'studio',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: 'studio' },
  },
  {
    id: 'trend-35mm',
    group: 'trending',
    label: '35mm',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: '35mm' },
  },
  {
    id: 'trend-portrait',
    group: 'trending',
    label: 'portrait',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: 'portrait' },
  },
  {
    id: 'trend-minimal',
    group: 'trending',
    label: 'minimal',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: 'minimal' },
  },
  {
    id: 'trend-cinematic',
    group: 'trending',
    label: 'cinematic',
    icon: TrendingUp,
    target: { section: 'colecao', searchQuery: 'cinematic' },
  },
]

export const ClubCommandModal: FC<ClubCommandModalProps> = ({
  open,
  openSource = 'keyboard',
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const id = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(id)
  }, [open])

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? STATIC_ENTRIES.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            (item.hint?.toLowerCase().includes(q) ?? false)
        )
      : STATIC_ENTRIES

    if (q) {
      const searchEntry: CommandEntry = {
        id: `search:${q}`,
        group: 'goto',
        label: `Buscar "${query.trim()}" na Coleção`,
        hint: 'FTS5 · Pesquisa completa',
        accent: 'gold',
        icon: Search,
        target: { section: 'colecao', searchQuery: query.trim() },
      }
      return [searchEntry, ...filtered]
    }

    return [...filtered]
  }, [query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const executeEntry = (entry: CommandEntry) => {
    onNavigate(entry.target)
    onClose()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((idx) => (entries.length === 0 ? 0 : (idx + 1) % entries.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((idx) =>
        entries.length === 0 ? 0 : (idx - 1 + entries.length) % entries.length
      )
      return
    }
    if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault()
      executeEntry(entries[activeIndex])
    }
  }

  if (!open) return null

  const gotoEntries = entries.filter((e) => e.group === 'goto')
  const trendingEntries = entries.filter((e) => e.group === 'trending')

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-4 pt-[12vh] backdrop-blur-md',
        openSource === 'click' ? 'club-command-click-enter' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos e busca rápida"
    >
      <div
        className="club-card w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de busca */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar prompts, projetos, ou ir para uma área..."
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-md border border-hairline bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-ink-tertiary hover:text-ink"
          >
            esc
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-[60vh] overflow-y-auto p-2.5">
          {trendingEntries.length > 0 && !query.trim() ? (
            <div className="mb-3">
              <div className="section-eyebrow px-2.5 py-1.5">Buscas em Alta</div>
              <div className="flex flex-wrap gap-1.5 px-2 pt-1">
                {trendingEntries.map((entry) => {
                  const globalIdx = entries.indexOf(entry)
                  const isActive = globalIdx === activeIndex
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => executeEntry(entry)}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={[
                        'lab-pressable inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]',
                        isActive
                          ? 'border-border-strong bg-ink font-medium text-canvas'
                          : 'border-hairline bg-white/[0.03] text-ink-secondary',
                      ].join(' ')}
                    >
                      <Icon className="h-3 w-3 opacity-70" />
                      <span>{entry.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {gotoEntries.length > 0 ? (
            <div>
              <div className="section-eyebrow px-2.5 py-1.5">Ir para</div>
              <div className="space-y-0.5">
                {gotoEntries.map((entry) => {
                  const globalIdx = entries.indexOf(entry)
                  const isActive = globalIdx === activeIndex
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => executeEntry(entry)}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={[
                        'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left',
                        isActive ? 'bg-elevated text-ink' : 'text-ink-secondary',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={[
                            'h-4 w-4 shrink-0',
                            entry.accent === 'gold' ? 'text-tier-s' : 'text-ink-tertiary',
                          ].join(' ')}
                        />
                        <span className="truncate text-[13px] font-medium">{entry.label}</span>
                        {entry.hint ? (
                          <span className="hidden truncate font-mono text-[10px] text-ink-muted sm:inline">
                            {entry.hint}
                          </span>
                        ) : null}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Rodapé de atalhos */}
        <div className="flex items-center justify-between border-t border-border-subtle bg-canvas px-4 py-2 font-mono text-[10px] text-ink-muted">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" />
              <span>navegar</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" />
              <span>abrir</span>
            </span>
          </div>
          <span>Prompt Engine V1 · ⌘K</span>
        </div>
      </div>
    </div>
  )
}
