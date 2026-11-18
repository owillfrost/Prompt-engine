import React from 'react'
import {
  Compass,
  Database,
  FolderKanban,
  GitCompare,
  Grid2x2,
  Layers,
  Lock,
  X,
} from 'lucide-react'
import type { CorpusOverviewStats, SourceLibFilter, SuitePayload } from '../types/promptEngine'

export type NavSectionId = 'mapa' | 'colecao' | 'pares' | 'gaps' | 'projetos'

interface AppSidebarProps {
  activeSection: NavSectionId
  onSelectSection: (section: NavSectionId) => void
  sourceLib: SourceLibFilter
  onChangeSourceLib: (lib: SourceLibFilter) => void
  stats: CorpusOverviewStats | null
  suite: SuitePayload | null
  activeProjectFilter: string | 'all'
  onClearProjectFilter: () => void
  onOpenSchemaModal: () => void
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeSection,
  onSelectSection,
  sourceLib,
  onChangeSourceLib,
  stats,
  suite,
  activeProjectFilter,
  onClearProjectFilter,
  onOpenSchemaModal,
}) => {
  const totalPairs = suite
    ? suite.pairsData.sameSkeletonDiffSubject.length +
      suite.pairsData.sameSubjectDiffSkeleton.length +
      suite.pairsData.nearDuplicates.length
    : 0
  const totalGaps = suite
    ? suite.gapsData.projectGaps.length + suite.gapsData.globalTriadGaps.length
    : 0

  const activeCount = !stats
    ? 19227
    : sourceLib === 'google_flow'
      ? stats.googleFlowSize
      : sourceLib === 'gemini_kimi'
        ? stats.geminiKimiSize
        : stats.totalCorpusSize

  const formatCompact = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n)

  const navItems: ReadonlyArray<{
    id: NavSectionId
    label: string
    icon: React.ComponentType<{ className?: string }>
    badge: string | number
  }> = [
    { id: 'mapa', label: 'Mapa', icon: Compass, badge: formatCompact(activeCount) },
    { id: 'colecao', label: 'Coleção', icon: Layers, badge: activeCount.toLocaleString('pt-BR') },
    { id: 'pares', label: 'Pares', icon: GitCompare, badge: totalPairs },
    { id: 'gaps', label: 'Gaps', icon: Grid2x2, badge: totalGaps },
    { id: 'projetos', label: 'Projetos', icon: FolderKanban, badge: suite ? suite.projectsData.length : 8 },
  ]

  return (
    <aside className="flex w-full shrink-0 flex-col justify-between border-b border-white/[0.07] bg-[#0b0b0e] lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-r lg:border-b-0">
      <div className="flex flex-col gap-5 p-4">
        {/* Identidade sóbria */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium tracking-tight text-zinc-100">
              Prompt Engine
            </span>
            <span className="tabular-mono text-[10px] text-zinc-500">
              FTS5 · ESCALA 22K
            </span>
          </div>
          <span className="tabular-mono rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
            RO
          </span>
        </div>

        {/* Seletor de Biblioteca */}
        <div className="flex flex-col gap-1.5">
          <span className="section-eyebrow px-1">Biblioteca Ativa</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-[#09090b] p-1">
            {(
              [
                { id: 'google_flow', label: 'Flow', count: stats?.googleFlowSize ?? 19227 },
                { id: 'gemini_kimi', label: 'Kimi', count: stats?.geminiKimiSize ?? 3055 },
                { id: 'all', label: 'Tudo', count: stats?.totalCorpusSize ?? 22282 },
              ] as const
            ).map((opt) => {
              const active = sourceLib === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSourceLib(opt.id)}
                  className={[
                    'flex flex-col items-center rounded-lg px-1.5 py-1.5 text-center transition-colors cursor-pointer',
                    active
                      ? 'bg-[#17171d] text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                  title={`${opt.label}: ${opt.count.toLocaleString('pt-BR')} prompts`}
                >
                  <span className="text-[11px] font-medium">{opt.label}</span>
                  <span className="tabular-mono text-[9px] opacity-75">
                    {formatCompact(opt.count)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Navegação principal */}
        <div className="flex flex-col gap-1.5">
          <span className="section-eyebrow px-1 pb-0.5">Navegação</span>
          <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col" aria-label="Navegação principal">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  className={[
                    'flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer shrink-0',
                    isActive
                      ? 'border border-white/[0.14] bg-[#15151a] font-medium text-zinc-100'
                      : 'border border-transparent text-zinc-400 hover:border-white/[0.07] hover:bg-white/[0.02] hover:text-zinc-200',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  <span
                    className={[
                      'tabular-mono text-[10px]',
                      isActive ? 'text-zinc-300' : 'text-zinc-500',
                    ].join(' ')}
                  >
                    {item.badge}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Filtro ativo de projeto (se houver) */}
        {activeProjectFilter !== 'all' ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-white/[0.1] bg-[#121217] p-2.5">
            <span className="section-eyebrow">Projeto Ativo</span>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-zinc-200">
                {activeProjectFilter}
              </span>
              <button
                type="button"
                onClick={onClearProjectFilter}
                className="rounded-md border border-white/[0.08] p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                title="Limpar filtro de projeto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Modelo de dados & Esquema */}
        <div className="flex flex-col gap-2">
          <span className="section-eyebrow px-1">Arquitetura</span>
          <button
            type="button"
            onClick={onOpenSchemaModal}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#111115] px-3 py-2.5 text-left text-[12px] text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-zinc-100 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-zinc-400" />
              <span>Modelo & Schema</span>
            </span>
            <span className="tabular-mono text-[10px] text-zinc-500">8 ATR</span>
          </button>
        </div>
      </div>

      {/* Rodapé: Fontes Read-Only */}
      <div className="hidden flex-col gap-2 border-t border-white/[0.07] p-4 lg:flex">
        <div className="flex items-center justify-between">
          <span className="section-eyebrow">Fontes Read-Only</span>
          <Lock className="h-3 w-3 text-zinc-600" />
        </div>
        <div className="flex flex-col gap-1.5">
          {(stats?.sourcesReadOnly || []).map((src) => (
            <div
              key={src.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-2.5 py-1.5"
            >
              <span className="truncate text-[11px] text-zinc-400" title={src.path}>
                {src.name}
              </span>
              <span className="tabular-mono shrink-0 text-[10px] text-zinc-500">
                {src.count.toLocaleString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
