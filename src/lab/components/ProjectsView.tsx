import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Clock3, Compass, FolderKanban, Grid2x2, Layers, Sparkles } from 'lucide-react'
import { formatTagPt } from '../../core/promptTagsPt'
import type { ProjectSummaryRecord, PromptItem, SourceLibFilter } from '../../types/promptEngine'
import GlassFolder, { type ArtPreset, type FolderFile, hashString } from './GlassFolder'
import { LabTooltip } from './LabTooltip'
import { RefinementStudioPanel } from './RefinementStudioPanel'
import { TimelineEvolutionPanel } from './TimelineEvolutionPanel'

const FOLDER_ART_CYCLE: readonly ArtPreset[] = ['ember', 'dusk', 'aurora', 'verdant', 'glacier']

export type ProjectsSubTab = 'projects' | 'refinement' | 'timeline'

const ProjectTerritoryRing: React.FC<{ pct: number; label: string }> = ({ pct, label }) => {
  const [entered, setEntered] = useState(false)
  const clamped = Math.max(0, Math.min(100, pct))
  const r = 13
  const c = 2 * Math.PI * r
  const offset = entered ? c * (1 - clamped / 100) : c

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <LabTooltip label={`${label}: ${Math.round(clamped)}%`} placement="top">
      <div
        className="flex items-center gap-1.5 rounded-xl border border-hairline bg-canvas px-2.5 py-1.5"
        aria-label={`${label}: ${Math.round(clamped)}%`}
      >
        <svg className="h-7 w-7 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
          <circle
            cx="16"
            cy="16"
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-hairline"
            strokeWidth="2.5"
          />
          <circle
            cx="16"
            cy="16"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="text-tier-s transition-[stroke-dashoffset] [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
          />
        </svg>
        <div className="text-right font-mono">
          <div className="text-[9px] uppercase tracking-wider text-ink-muted">TERRIT.</div>
          <div className="tabular-mono text-[11px] text-tier-s">{Math.round(clamped)}%</div>
        </div>
      </div>
    </LabTooltip>
  )
}

interface ProjectsViewProps {
  projects: ProjectSummaryRecord[]
  items: PromptItem[]
  sourceLib: SourceLibFilter
  immatureCount?: number
  activeSubTab?: ProjectsSubTab
  onSubTabChange?: (tab: ProjectsSubTab) => void
  refinementTargetItem?: PromptItem | null
  discoveredGapIds?: string[]
  onOpenCollectionForProject: (projectName: string, sourceLib: 'google_flow' | 'gemini_kimi') => void
  onOpenMapForProject: (projectName: string, sourceLib: 'google_flow' | 'gemini_kimi') => void
  onOpenGapsForProject: (projectName: string, gapId?: string) => void
  onInspectItem: (item: PromptItem) => void
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  items,
  sourceLib,
  immatureCount = 1426,
  activeSubTab = 'projects',
  onSubTabChange,
  refinementTargetItem = null,
  discoveredGapIds = [],
  onOpenCollectionForProject,
  onOpenMapForProject,
  onOpenGapsForProject,
  onInspectItem,
}) => {
  const [subTab, setSubTab] = useState<ProjectsSubTab>(activeSubTab)
  const [timelinePeriodFilter, setTimelinePeriodFilter] = useState<string | 'all'>('all')
  const [expandedSubfolders, setExpandedSubfolders] = useState<Record<string, boolean>>({})

  const tabNavRef = useRef<HTMLElement | null>(null)
  const tabBtnRefs = useRef<Partial<Record<ProjectsSubTab, HTMLButtonElement | null>>>({})
  const [clipInset, setClipInset] = useState<string>('inset(0 100% 0 0 round 9999px)')

  useEffect(() => {
    setSubTab(activeSubTab)
  }, [activeSubTab])

  useLayoutEffect(() => {
    const updateClip = () => {
      const nav = tabNavRef.current
      const btn = tabBtnRefs.current[subTab]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setClipInset(`inset(4px ${right}px 4px ${left}px round 9999px)`)
    }
    updateClip()
    const navEl = tabNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [subTab, projects.length, immatureCount])

  const discoveredSet = useMemo(() => new Set(discoveredGapIds), [discoveredGapIds])

  const selectTab = (tab: ProjectsSubTab) => {
    setSubTab(tab)
    onSubTabChange?.(tab)
  }

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline/80 pb-4">
        <div>
          <span className="section-eyebrow">
            Google Flow + Gemini Kimi ({projects.length} coleções)
          </span>
          <h1 className="mt-1 text-[20px] font-medium tracking-[-0.025em] text-ink">
            Projetos, Forja de Upgrade &amp; Linha do Tempo
          </h1>
          <p className="mt-1 text-[13px] text-ink-tertiary">
            Explore pastas de vidro por projeto, eleve cartas raras e imaturas na bancada de upgrade (de Raro + Imaturo para Raro + Maduro) e acompanhe safras.
          </p>
        </div>

        <nav
          ref={tabNavRef}
          className="relative flex flex-wrap items-center gap-1 rounded-full border border-hairline bg-surface p-1"
          aria-label="Modos de Projetos e Evolução"
        >
          <button
            ref={(el) => {
              tabBtnRefs.current.projects = el
            }}
            type="button"
            onClick={() => selectTab('projects')}
            className="lab-pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink-tertiary hover:text-ink cursor-pointer"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Projetos ({projects.length})</span>
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.refinement = el
            }}
            type="button"
            onClick={() => selectTab('refinement')}
            className="lab-pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-tier-s/90 hover:text-tier-s-bright cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Território Virgem ({immatureCount.toLocaleString('pt-BR')})</span>
          </button>

          <button
            ref={(el) => {
              tabBtnRefs.current.timeline = el
            }}
            type="button"
            onClick={() => selectTab('timeline')}
            className="lab-pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink-tertiary hover:text-ink cursor-pointer"
          >
            <Clock3 className="h-3.5 w-3.5" />
            <span>Evolução Temporal</span>
          </button>

          {/* Camada ativa recortada via clip-path para transição perfeita de cor entre tabs */}
          <div
            aria-hidden="true"
            style={{ clipPath: clipInset }}
            className="pointer-events-none absolute inset-0 flex flex-wrap items-center gap-1 p-1 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas">
              <FolderKanban className="h-3.5 w-3.5" />
              <span>Projetos ({projects.length})</span>
            </span>

            <span className="club-btn-gold inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Território Virgem ({immatureCount.toLocaleString('pt-BR')})</span>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas">
              <Clock3 className="h-3.5 w-3.5" />
              <span>Evolução Temporal</span>
            </span>
          </div>
        </nav>
      </header>

      {subTab === 'refinement' ? (
        <RefinementStudioPanel
          sourceLib={sourceLib}
          initialTargetItem={refinementTargetItem}
          initialPeriodFilter={timelinePeriodFilter}
          onClearPeriodFilter={() => setTimelinePeriodFilter('all')}
          onInspectItem={onInspectItem}
        />
      ) : subTab === 'timeline' ? (
        <TimelineEvolutionPanel
          onRefinePeriod={(period) => {
            setTimelinePeriodFilter(period)
            selectTab('refinement')
          }}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          {projects.map((proj, projIdx) => {
            const exemplars = proj.exemplarIds
              .map((id) => itemMap.get(id))
              .filter((x): x is PromptItem => Boolean(x))

            const preset = FOLDER_ART_CYCLE[projIdx % FOLDER_ART_CYCLE.length]
            const folderFiles: FolderFile[] = exemplars.slice(0, 4).map((ex, idx) => ({
              name: ex.title,
              meta: `TIER ${ex.rarity.tier}`,
              image: ex.thumbnailUrl ?? undefined,
              art: FOLDER_ART_CYCLE[(projIdx + idx + 1) % FOLDER_ART_CYCLE.length],
            }))

            const totalFmt =
              proj.formatDistribution.json +
              proj.formatDistribution.sections +
              proj.formatDistribution.single_paragraph

            const totalProjectGaps = proj.topGaps.length
            const discoveredInProject = proj.topGaps.filter((g) => discoveredSet.has(g.id)).length
            const territoryPct =
              totalProjectGaps > 0
                ? (discoveredInProject / totalProjectGaps) * 100
                : proj.totalPrompts > 0
                  ? Math.min(100, (proj.tierDistribution.S / proj.totalPrompts) * 100)
                  : 0
            const hasMoreSubfolders = proj.subfolders.length > 4
            const isSubOpen = Boolean(expandedSubfolders[proj.id])

            return (
              <article
                key={proj.id}
                className="club-card club-card-interactive flex flex-col justify-between gap-4 p-5"
              >
                <div className="space-y-4">
                  {/* Topo do projeto */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="section-eyebrow">Projeto</span>
                        <span className="tabular-mono rounded border border-hairline bg-canvas px-1.5 py-0.5 text-[9px] text-ink-tertiary">
                          {proj.sourceLib === 'gemini_kimi' ? 'Gemini Kimi' : 'Google Flow'}
                        </span>
                        <span className="tabular-mono text-[10px] text-ink-muted">
                          {proj.corpusSharePct}% do acervo
                        </span>
                      </div>
                      <h2 className="mt-0.5 text-[16px] font-medium text-ink">{proj.name}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      <div className="rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-right">
                        <div className="text-[9px] text-ink-muted">TOTAL</div>
                        <div className="tabular-mono text-ink">
                          {proj.totalPrompts.toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-right">
                        <div className="text-[9px] text-ink-muted">RARIDADE MÉDIA</div>
                        <div className="tabular-mono text-ink">
                          P{Math.round(proj.avgRarityPercentile)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-right">
                        <div className="text-[9px] text-ink-muted">TIER S</div>
                        <div className="tabular-mono text-tier-s">
                          {proj.tierDistribution.S.toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <ProjectTerritoryRing
                        pct={territoryPct}
                        label={
                          totalProjectGaps > 0
                            ? `Gaps mapeados (${discoveredInProject}/${totalProjectGaps})`
                            : 'Concentração Tier S'
                        }
                      />
                    </div>
                  </div>

                  {/* Corpo híbrido: Pasta de vidro tátil + Telemetria do projeto */}
                  <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
                    <div className="flex flex-col items-center gap-1.5">
                      <GlassFolder
                        label={proj.name}
                        meta={`${proj.totalPrompts.toLocaleString('pt-BR')} prompts · Tier S ${proj.tierDistribution.S}`}
                        tone="dark"
                        art={preset}
                        seed={(hashString(proj.id) % 997) + 1}
                        image={exemplars[0]?.thumbnailUrl ?? undefined}
                        files={folderFiles}
                        action="more"
                        width={264}
                        appear
                        appearDelay={Math.min(180, projIdx * 40)}
                        onFileSelect={(_file, idx) => {
                          const target = exemplars[idx]
                          if (target) onInspectItem(target)
                        }}
                        menu={[
                          {
                            label: 'Ver no Mapa',
                            onSelect: () => onOpenMapForProject(proj.name, proj.sourceLib),
                          },
                          {
                            label: `Filtrar Coleção (${proj.totalPrompts.toLocaleString('pt-BR')})`,
                            onSelect: () => onOpenCollectionForProject(proj.name, proj.sourceLib),
                          },
                          {
                            label: 'Matriz de Gaps',
                            onSelect: () => onOpenGapsForProject(proj.name),
                          },
                        ]}
                      />
                      <span className="font-mono text-[10px] text-ink-muted">
                        {exemplars.length > 0
                          ? `Clique na pasta para abrir ${Math.min(4, exemplars.length)} exemplares`
                          : 'Pasta sem miniaturas indexadas'}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-3">
                      {/* Formatos */}
                      <div className="rounded-xl border border-hairline bg-canvas p-3">
                        <span className="section-eyebrow">Formatos no Projeto</span>
                        <div className="mt-2 space-y-1.5 font-mono text-[11px]">
                          {(
                            [
                              ['JSON', proj.formatDistribution.json],
                              ['Seções', proj.formatDistribution.sections],
                              ['Parágrafo', proj.formatDistribution.single_paragraph],
                            ] as const
                          ).map(([label, cnt]) => {
                            const pct = totalFmt > 0 ? Math.round((cnt / totalFmt) * 100) : 0
                            return (
                              <div key={label} className="flex items-center justify-between gap-2">
                                <span className="text-ink-tertiary">{label}</span>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-hairline">
                                    <div
                                      className="h-full w-full origin-left bg-ink-tertiary transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]"
                                      style={{
                                        transform: `scaleX(${Math.max(0.02, pct / 100)})`,
                                      }}
                                    />
                                  </div>
                                  <span className="tabular-mono w-10 text-right text-ink-secondary">
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Hábitos dominantes */}
                      <div className="rounded-xl border border-hairline bg-canvas p-3">
                        <span className="section-eyebrow">Hábitos Dominantes</span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {proj.dominantTags.slice(0, 5).map((dt) => (
                            <span
                              key={`${dt.axis}:${dt.tag}`}
                              className="tabular-mono rounded-lg border border-hairline bg-elevated px-2 py-0.5 text-[10px] text-ink-secondary"
                            >
                              {formatTagPt(dt.tag)} · {dt.pct}%
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Subpastas colapsáveis se existirem (> 1) */}
                      {proj.subfolders.length > 1 ? (
                        <div className="rounded-xl border border-hairline bg-canvas p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="section-eyebrow">
                              Subpastas / Estúdios ({proj.subfolders.length})
                            </span>
                            {hasMoreSubfolders ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSubfolders((prev) => ({
                                    ...prev,
                                    [proj.id]: !prev[proj.id],
                                  }))
                                }
                                aria-expanded={isSubOpen}
                                className="btn-ghost min-h-[22px] gap-1 px-2 py-0.5 font-mono text-[10px] text-ink-secondary"
                              >
                                <span>
                                  {isSubOpen ? 'Recolher' : `+${proj.subfolders.length - 4}`}
                                </span>
                                <ChevronDown
                                  className={[
                                    'h-3 w-3 transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]',
                                    isSubOpen ? 'rotate-180' : '',
                                  ].join(' ')}
                                />
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {proj.subfolders.slice(0, 4).map((sf) => (
                              <span
                                key={sf.name}
                                className="tabular-mono rounded-lg border border-hairline px-2 py-0.5 text-[10px] text-ink-tertiary"
                              >
                                {sf.name.replace(`${proj.name}/`, '')} ({sf.count})
                              </span>
                            ))}
                          </div>

                          {hasMoreSubfolders ? (
                            <div className="subfolders-collapse" data-open={isSubOpen ? 'true' : 'false'}>
                              <div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {proj.subfolders.slice(4, 12).map((sf) => (
                                    <span
                                      key={sf.name}
                                      className="tabular-mono rounded-lg border border-hairline px-2 py-0.5 text-[10px] text-ink-tertiary"
                                    >
                                      {sf.name.replace(`${proj.name}/`, '')} ({sf.count})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Top Gaps exclusivos do projeto */}
                  {proj.topGaps.length > 0 ? (
                    <div className="space-y-1.5">
                      <span className="section-eyebrow">Gaps Exclusivos do Projeto (O = 0)</span>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {proj.topGaps.slice(0, 4).map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => onOpenGapsForProject(proj.name, g.id)}
                            className="press-scale flex items-center justify-between gap-2 rounded-xl border border-dashed border-hairline bg-canvas px-2.5 py-2 text-left transition-[border-color,transform] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] hover:border-tier-s/60 cursor-pointer"
                          >
                            <span className="truncate text-[11px] text-ink-secondary">{g.title}</span>
                            <span className="tabular-mono shrink-0 text-[10px] text-tier-s">
                              E={g.expectedCount}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Ações rápidas alinhadas em grid uniforme */}
                <div className="grid grid-cols-1 gap-2 border-t border-hairline pt-3.5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => onOpenMapForProject(proj.name, proj.sourceLib)}
                    className="club-btn-primary min-h-[34px] w-full cursor-pointer whitespace-nowrap px-3 text-[11px]"
                  >
                    <Compass className="h-3.5 w-3.5 shrink-0" />
                    <span>Ver no Mapa</span>
                  </button>
                  <LabTooltip
                    label={`Filtrar ${proj.totalPrompts.toLocaleString('pt-BR')} prompts na Coleção`}
                    placement="top"
                    className="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenCollectionForProject(proj.name, proj.sourceLib)}
                      className="club-btn-ghost min-h-[34px] w-full cursor-pointer whitespace-nowrap px-3 text-[11px]"
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span>Coleção ({proj.totalPrompts.toLocaleString('pt-BR')})</span>
                    </button>
                  </LabTooltip>
                  <button
                    type="button"
                    onClick={() => onOpenGapsForProject(proj.name)}
                    className="club-btn-ghost min-h-[34px] w-full cursor-pointer whitespace-nowrap px-3 text-[11px]"
                  >
                    <Grid2x2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Matriz de Gaps</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
