import React, { useState } from 'react'
import {
  ArrowUpRight,
  Compass,
  Database,
  FlaskConical,
  FolderKanban,
  GitCompare,
  Grid2x2,
  Layers,
  Lock,
  RefreshCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { CartographerRankMark } from './CartographerRankMark'
import type { CartographerRank } from '../hooks/useCartographerProfile'
import type {
  CorpusOverviewStats,
  SourceLibFilter,
  SuitePayload,
  SyncStatusResponse,
} from '../types/promptEngine'

export type NavSectionId = 'mapa' | 'colecao' | 'pares' | 'gaps' | 'experimentos' | 'projetos'

export interface SidebarCartographerSummary {
  discoveredGapsCount: number
  todayCount: number
  exploredPromptsCount: number
  collectedTierSCount: number
  rank: CartographerRank
  soundEnabled: boolean
}

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
  cartographer?: SidebarCartographerSummary
  onToggleSound?: () => void
  syncStatus?: SyncStatusResponse | null
  isSyncing?: boolean
  onTriggerSync?: () => void
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
  cartographer,
  onToggleSound,
  syncStatus,
  isSyncing = false,
  onTriggerSync,
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
    ? 0
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
    { id: 'experimentos', label: 'Experimentos', icon: FlaskConical, badge: 'EXP' },
    { id: 'projetos', label: 'Projetos', icon: FolderKanban, badge: suite ? suite.projectsData.length : 8 },
  ]

  const [mobileMetaOpen, setMobileMetaOpen] = useState(false)

  let totalMatrixCells = 0
  let occupiedMatrixCells = 0
  if (suite?.gapsData?.matrices) {
    for (const m of suite.gapsData.matrices) {
      totalMatrixCells += m.cells.length
      for (const c of m.cells) {
        if (c.observed > 0) occupiedMatrixCells++
      }
    }
  }
  const discoveredGapsCount = cartographer?.discoveredGapsCount ?? 0
  const tierSInCorpus = stats?.tierDistribution.S ?? 0
  const territoryMappedPct =
    totalMatrixCells > 0
      ? Math.min(100, ((occupiedMatrixCells + discoveredGapsCount) / totalMatrixCells) * 100)
      : stats && stats.totalCorpusSize > 0
        ? Math.min(100, (tierSInCorpus / stats.totalCorpusSize) * 100)
        : 0

  return (
    <aside className="flex w-full shrink-0 flex-col justify-between border-b border-white/[0.07] bg-[#0b0b0e] lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-r lg:border-b-0">
      <div className="flex flex-col gap-5 p-4">
        {/* Identidade sóbria + Toggle de Som/Haptic */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium tracking-tight text-zinc-100">
                Prompt Engine
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-1.5 py-px font-mono text-[8px] uppercase tracking-wider text-zinc-400">
                Legacy
              </span>
            </div>
            <span className="tabular-mono text-[10px] text-zinc-500">
              {stats ? `FTS5 · ESCALA ${formatCompact(stats.totalCorpusSize).toUpperCase()}` : 'FTS5 · CARREGANDO'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {cartographer ? (
              <button
                type="button"
                onClick={() => setMobileMetaOpen((v) => !v)}
                className="btn-ghost min-h-[26px] px-2 text-[10px] lg:hidden"
                aria-expanded={mobileMetaOpen}
              >
                <CartographerRankMark
                  roman={cartographer.rank.roman}
                  title={cartographer.rank.title}
                />
                <span>{mobileMetaOpen ? 'Ocultar' : 'Cartógrafo'}</span>
              </button>
            ) : null}
            {cartographer && onToggleSound ? (
              <button
                type="button"
                onClick={onToggleSound}
                className="press-scale flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100 cursor-pointer"
                title={cartographer.soundEnabled ? 'Feedback sonoro ativo' : 'Feedback sonoro silenciado'}
                aria-label={cartographer.soundEnabled ? 'Silenciar feedback sonoro' : 'Ativar feedback sonoro'}
              >
                {cartographer.soundEnabled ? (
                  <Volume2 className="h-3 w-3 text-[#e8b84b]" />
                ) : (
                  <VolumeX className="h-3 w-3 text-zinc-500" />
                )}
              </button>
            ) : null}
            <span className="tabular-mono rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
              RO
            </span>
          </div>
        </div>

        {/* Seletor de Biblioteca (exibido apenas quando há mais de uma biblioteca ativa) */}
        {(stats?.geminiKimiSize ?? 0) > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="section-eyebrow px-1">Biblioteca Ativa</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-[#09090b] p-1">
              {(
                [
                  { id: 'google_flow', label: 'Flow', count: stats?.googleFlowSize ?? 0 },
                  { id: 'gemini_kimi', label: 'Kimi', count: stats?.geminiKimiSize ?? 0 },
                  { id: 'all', label: 'Tudo', count: stats?.totalCorpusSize ?? 0 },
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
        ) : null}

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

        <a
          href="/"
          className="flex items-center justify-between gap-2 rounded-xl border border-[#e8b84b]/35 bg-[#e8b84b]/[0.06] px-3 py-2 text-[11px] font-medium text-[#e8b84b] transition-colors hover:bg-[#e8b84b]/12"
        >
          <span>Abrir Versão Principal</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </a>

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
        <div className={[mobileMetaOpen ? 'flex' : 'hidden lg:flex', 'flex-col gap-2'].join(' ')}>
          <span className="section-eyebrow px-1">Arquitetura</span>
          <button
            type="button"
            onClick={onOpenSchemaModal}
            className="btn-secondary w-full justify-between px-3 text-[12px]"
          >
            <span className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-zinc-400" />
              <span>Inspecionar schema</span>
            </span>
            <span className="tabular-mono text-[10px] text-zinc-500">8 ATR</span>
          </button>
        </div>

        {/* Perfil de Cartógrafo & Progresso Global */}
        {cartographer ? (
          <div
            className={[
              mobileMetaOpen ? 'flex' : 'hidden lg:flex',
              'flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#101014] p-3',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <CartographerRankMark
                  roman={cartographer.rank.roman}
                  title={cartographer.rank.title}
                />
                <span className="tabular-mono text-[10px] font-medium tracking-wider text-[#e8b84b]">
                  {cartographer.rank.badge}
                </span>
              </span>
              <span className="tabular-mono text-[10px] text-zinc-400">
                {cartographer.todayCount} {cartographer.todayCount === 1 ? 'gap' : 'gaps'} hoje
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-zinc-200">
                {cartographer.rank.title}
              </span>
              <span className="tabular-mono text-[10px] text-zinc-500">
                {cartographer.discoveredGapsCount} gaps mapeados · {tierSInCorpus.toLocaleString('pt-BR')} Tier S no acervo
              </span>
            </div>

            <div className="space-y-1 pt-0.5">
              <div className="flex items-center justify-between text-[9px]">
                <span className="section-eyebrow">Território Semântico Ocupado</span>
                <span className="tabular-mono text-zinc-300">
                  {territoryMappedPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#e8b84b] transition-transform duration-300"
                  style={{
                    transform: `scaleX(${territoryMappedPct === 0 ? 0 : Math.max(0.02, Math.min(1, territoryMappedPct / 100))})`,
                    transitionTimingFunction: 'var(--ease-out)',
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Rodapé: Fontes Read-Only & Sincronização Eagle */}
      <div
        className={[
          mobileMetaOpen ? 'flex' : 'hidden lg:flex',
          'flex-col gap-2 border-t border-white/[0.07] p-4',
        ].join(' ')}
      >
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

        {onTriggerSync ? (
          <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-white/[0.07] bg-[#0e0e12] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span
                className={[
                  'tabular-mono truncate text-[10px]',
                  isSyncing
                    ? 'text-[#e8b84b]'
                    : syncStatus?.state === 'error'
                      ? 'text-red-400'
                      : syncStatus && !syncStatus.inSync
                        ? 'text-[#e8b84b]'
                        : 'text-zinc-400',
                ].join(' ')}
                title={syncStatus?.lastError || syncStatus?.lastLogLines?.slice(-1)[0] || undefined}
              >
                {isSyncing
                  ? 'Sincronizando...'
                  : syncStatus?.state === 'error'
                    ? 'Erro no sync'
                    : syncStatus && !syncStatus.inSync
                      ? `+${syncStatus.totalPendingChanges.toLocaleString('pt-BR')} alterações no Eagle`
                      : syncStatus
                        ? 'Sincronizado'
                        : 'Verificando...'}
              </span>
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className={[
                  'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60',
                  syncStatus && !syncStatus.inSync
                    ? 'border-[#e8b84b]/40 bg-[#e8b84b]/10 text-[#e8b84b] hover:bg-[#e8b84b]/20'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-zinc-100',
                ].join(' ')}
              >
                <RefreshCw className={['h-3 w-3', isSyncing ? 'animate-spin' : ''].join(' ')} />
                <span>{isSyncing ? 'Sync' : syncStatus && !syncStatus.inSync ? 'Sincronizar' : 'Atualizar'}</span>
              </button>
            </div>
            {isSyncing && syncStatus?.lastLogLines?.length ? (
              <p className="truncate font-mono text-[9.5px] text-zinc-500">
                {syncStatus.lastLogLines[syncStatus.lastLogLines.length - 1]}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
