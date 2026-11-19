import React, { useEffect, useMemo, useState } from 'react'
import { Clock3, Compass, FolderKanban, Grid2x2, Layers, Sparkles } from 'lucide-react'
import { formatTagPt } from '../core/promptTagsPt'
import type { ProjectSummaryRecord, PromptItem, SourceLibFilter } from '../types/promptEngine'
import { PromptThumb } from './PromptThumb'
import { RefinementStudioPanel } from './RefinementStudioPanel'
import { TimelineEvolutionPanel } from './TimelineEvolutionPanel'

export type ProjectsSubTab = 'projects' | 'refinement' | 'timeline'

interface ProjectsViewProps {
  projects: ProjectSummaryRecord[]
  items: PromptItem[]
  sourceLib: SourceLibFilter
  immatureCount?: number
  activeSubTab?: ProjectsSubTab
  onSubTabChange?: (tab: ProjectsSubTab) => void
  refinementTargetItem?: PromptItem | null
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
  onOpenCollectionForProject,
  onOpenMapForProject,
  onOpenGapsForProject,
  onInspectItem,
}) => {
  const [subTab, setSubTab] = useState<ProjectsSubTab>(activeSubTab)
  const [timelinePeriodFilter, setTimelinePeriodFilter] = useState<string | 'all'>('all')

  useEffect(() => {
    setSubTab(activeSubTab)
  }, [activeSubTab])

  const selectTab = (tab: ProjectsSubTab) => {
    setSubTab(tab)
    onSubTabChange?.(tab)
  }

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <span className="section-eyebrow">
            Google Flow + Gemini Kimi · {projects.length} Coleções · Território Virgem &amp; Evolução
          </span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-zinc-100">
            Projetos, Lapidação Raro + Imaturo &amp; Linha do Tempo
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Explore padrões por pasta, resgate ideias raras ainda sem molde consolidado (Raro + Imaturo para Raro + Maduro) e identifique ingredientes adormecidos por safra.
          </p>
        </div>

        <nav
          className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-[#0c0c0f] p-1"
          aria-label="Modos de Projetos e Evolução"
        >
          <button
            type="button"
            onClick={() => selectTab('projects')}
            className={[
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] transition-colors cursor-pointer',
              subTab === 'projects'
                ? 'bg-[#18181f] font-medium text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Projetos ({projects.length})</span>
          </button>

          <button
            type="button"
            onClick={() => selectTab('refinement')}
            className={[
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] transition-colors cursor-pointer',
              subTab === 'refinement'
                ? 'bg-[#18181f] font-medium text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#e5a93c]" />
            <span>Território Virgem ({immatureCount.toLocaleString('pt-BR')})</span>
          </button>

          <button
            type="button"
            onClick={() => selectTab('timeline')}
            className={[
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] transition-colors cursor-pointer',
              subTab === 'timeline'
                ? 'bg-[#18181f] font-medium text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200',
            ].join(' ')}
          >
            <Clock3 className="h-3.5 w-3.5" />
            <span>Evolução Temporal</span>
          </button>
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {projects.map((proj) => {
            const exemplars = proj.exemplarIds
              .map((id) => itemMap.get(id))
            .filter((x): x is PromptItem => Boolean(x))

          const totalFmt =
            proj.formatDistribution.json +
            proj.formatDistribution.sections +
            proj.formatDistribution.single_paragraph

          return (
            <article
              key={proj.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.07] bg-[#101013] p-5"
            >
              <div className="space-y-4">
                {/* Topo do projeto */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="section-eyebrow">Projeto</span>
                      <span className="tabular-mono rounded border border-white/[0.08] bg-[#0b0b0e] px-1.5 py-0.5 text-[9px] text-zinc-400">
                        {proj.sourceLib === 'gemini_kimi' ? 'Gemini Kimi' : 'Google Flow'}
                      </span>
                      <span className="tabular-mono text-[10px] text-zinc-500">
                        {proj.corpusSharePct}% do acervo
                      </span>
                    </div>
                    <h2 className="mt-0.5 text-[16px] font-medium text-zinc-100">{proj.name}</h2>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-3 py-1.5 text-right">
                      <div className="text-[9px] text-zinc-500">TOTAL</div>
                      <div className="text-zinc-100">{proj.totalPrompts.toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-3 py-1.5 text-right">
                      <div className="text-[9px] text-zinc-500">RARIDADE MÉDIA</div>
                      <div className="text-zinc-100">P{Math.round(proj.avgRarityPercentile)}</div>
                    </div>
                    <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-3 py-1.5 text-right">
                      <div className="text-[9px] text-zinc-500">TIER S</div>
                      <div className="text-[#e5a93c]">
                        {proj.tierDistribution.S.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formatos & Tiers */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-3">
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
                            <span className="text-zinc-400">{label}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className="h-full bg-zinc-400"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-zinc-300">{pct}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Hábitos dominantes */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-3">
                    <span className="section-eyebrow">Hábitos Dominantes</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {proj.dominantTags.slice(0, 5).map((dt) => (
                        <span
                          key={`${dt.axis}:${dt.tag}`}
                          className="tabular-mono rounded-lg border border-white/[0.07] bg-[#121217] px-2 py-0.5 text-[10px] text-zinc-300"
                        >
                          {formatTagPt(dt.tag)} · {dt.pct}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subpastas se existirem (> 1) */}
                {proj.subfolders.length > 1 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-3">
                    <span className="section-eyebrow">Subpastas / Estúdios</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {proj.subfolders.slice(0, 8).map((sf) => (
                        <span
                          key={sf.name}
                          className="tabular-mono rounded-lg border border-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400"
                        >
                          {sf.name.replace(`${proj.name}/`, '')} ({sf.count})
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                          className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/[0.12] bg-[#0b0b0e] px-2.5 py-2 text-left hover:border-[#e5a93c]/60 cursor-pointer"
                        >
                          <span className="truncate text-[11px] text-zinc-300">{g.title}</span>
                          <span className="tabular-mono shrink-0 text-[10px] text-[#e5a93c]">
                            E={g.expectedCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Miniaturas exemplares */}
                {exemplars.length > 0 ? (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {exemplars.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => onInspectItem(ex)}
                        className="group relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#09090b] hover:border-white/30 cursor-pointer"
                        title={`${ex.title} · ${ex.rarity.label}`}
                      >
                        {ex.thumbnailUrl ? (
                          <PromptThumb src={ex.thumbnailUrl} alt={ex.title} fallbackLabel="·" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Ações */}
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => onOpenMapForProject(proj.name, proj.sourceLib)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#15151a] px-3 py-1.5 text-[11px] text-zinc-200 hover:border-white/25 cursor-pointer"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Ver no Mapa</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCollectionForProject(proj.name, proj.sourceLib)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-1.5 text-[11px] text-zinc-300 hover:border-white/20 cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Filtrar Coleção ({proj.totalPrompts.toLocaleString('pt-BR')})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGapsForProject(proj.name)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-1.5 text-[11px] text-zinc-300 hover:border-white/20 cursor-pointer"
                >
                  <Grid2x2 className="h-3.5 w-3.5" />
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
