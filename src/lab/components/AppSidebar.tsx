import React, { useEffect, useRef, useState } from 'react'
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
  Menu,
  Palette,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { CartographerRankMark } from './CartographerRankMark'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import type { CartographerRank } from '../../hooks/useCartographerProfile'
import type {
  CorpusOverviewStats,
  SourceLibFilter,
  SuitePayload,
  SyncStatusResponse,
} from '../../types/promptEngine'

export type NavSectionId =
  | 'mapa'
  | 'colecao'
  | 'pares'
  | 'gaps'
  | 'experimentos'
  | 'projetos'
  | 'perfil'
  | 'design_system'
  | 'configuracoes'

export interface SidebarCartographerSummary {
  displayName?: string
  discoveredGapsCount: number
  todayCount: number
  activeDaysCount?: number
  favoritesCount?: number
  newSinceLastVisit?: number
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
  gridCustomizerOpen?: boolean
  onToggleGridCustomizer?: () => void
  onOpenCommandPalette?: () => void
}

interface RailTooltipState {
  id: string
  label: string
  badge?: string | number
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
  gridCustomizerOpen = false,
  onToggleGridCustomizer,
  onOpenCommandPalette,
}) => {
  const [hoveredTip, setHoveredTip] = useState<RailTooltipState | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-rail-drawer]')) {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [drawerOpen])

  const totalPairs = suite
    ? suite.pairsData.sameSkeletonDiffSubject.length +
      suite.pairsData.sameSubjectDiffSkeleton.length +
      suite.pairsData.nearDuplicates.length
    : 0
  const totalGaps = suite
    ? (suite.gapsData.creativeFrontierGaps?.length ?? 0) +
      suite.gapsData.projectGaps.length +
      suite.gapsData.globalTriadGaps.length
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

  const newSinceLastVisit = cartographer?.newSinceLastVisit ?? 0
  const profileBadgeCount =
    (cartographer?.favoritesCount ?? 0) + (cartographer?.discoveredGapsCount ?? 0)

  const navItems: ReadonlyArray<{
    id: NavSectionId
    label: string
    hint: string
    icon?: React.ComponentType<{ className?: string }>
    badge: string | number
    highlightBadge?: boolean
  }> = [
    {
      id: 'mapa',
      label: 'Mapa',
      hint: 'Atlas Semântico 2D',
      icon: Compass,
      badge: formatCompact(activeCount),
    },
    {
      id: 'colecao',
      label: 'Coleção',
      hint: 'Álbum & Códice de Cartas',
      icon: Layers,
      badge: activeCount.toLocaleString('pt-BR'),
    },
    {
      id: 'pares',
      label: 'Pares',
      hint: 'Comparador & DNA',
      icon: GitCompare,
      badge: totalPairs,
    },
    {
      id: 'gaps',
      label: 'Gaps',
      hint: 'Quest Board & Forja O=0',
      icon: Grid2x2,
      badge: totalGaps,
    },
    {
      id: 'experimentos',
      label: 'Experimentos',
      hint: 'Colisão 24D & Sonda de Deriva',
      icon: FlaskConical,
      badge: 'EXP',
    },
    {
      id: 'projetos',
      label: 'Projetos',
      hint: 'Decks & Estação de Upgrade',
      icon: FolderKanban,
      badge: suite ? suite.projectsData.length : 8,
    },
    {
      id: 'perfil',
      label: 'Perfil',
      hint: 'Maestria & Fichário',
      badge: newSinceLastVisit > 0 ? `${newSinceLastVisit} novos` : profileBadgeCount,
      highlightBadge: newSinceLastVisit > 0,
    },
  ]

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
  const animatedDiscoveredCount = useAnimatedNumber(discoveredGapsCount, {
    durationMs: 260,
    decimals: 0,
    enabled: true,
  })
  const tierSInCorpus = stats?.tierDistribution.S ?? 0
  const territoryMappedPct =
    totalMatrixCells > 0
      ? Math.min(100, ((occupiedMatrixCells + discoveredGapsCount) / totalMatrixCells) * 100)
      : stats && stats.totalCorpusSize > 0
        ? Math.min(100, (tierSInCorpus / stats.totalCorpusSize) * 100)
        : 0

  const renderRailPopup = (id: string) => {
    if (!hoveredTip || hoveredTip.id !== id) return null
    return (
      <span
        role="tooltip"
        className="savee-rail-popup pointer-events-none absolute top-1/2 left-[60px] z-[1700] inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-[12px] font-medium text-ink shadow-2xl"
      >
        <span>{hoveredTip.label}</span>
        {hoveredTip.badge !== undefined && hoveredTip.badge !== '' ? (
          <span className="tabular-mono rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-ink-secondary">
            {hoveredTip.badge}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <>
      {/* ───── Mobile Top Rail (< lg) ───── */}
      <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-hairline/80 bg-canvas/85 px-3 backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectSection('mapa')}
            className="lab-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold tracking-tighter text-canvas cursor-pointer"
            title="Prompt Engine V1"
          >
            PE
          </button>

          <nav
            aria-label="Navegação principal mobile"
            className="savee-noscroll flex items-center gap-1 overflow-x-auto"
          >
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  aria-label={item.label}
                  className={[
                    'lab-pressable relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium cursor-pointer',
                    isActive
                      ? 'bg-brand/18 text-ink border border-brand/50'
                      : 'text-ink-tertiary hover:text-ink',
                  ].join(' ')}
                >
                  {item.id === 'perfil' ? (
                    <CartographerRankMark
                      roman={cartographer?.rank.roman ?? 'I'}
                      title={cartographer?.rank.title}
                      size="sm"
                    />
                  ) : Icon ? (
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.highlightBadge ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-tier-s" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5" data-rail-drawer>
          {onOpenCommandPalette ? (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Busca rápida"
              className="lab-pressable flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface text-ink-secondary cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {onToggleGridCustomizer ? (
            <button
              type="button"
              onClick={onToggleGridCustomizer}
              aria-label="Customizar grade"
              aria-pressed={gridCustomizerOpen}
              className={[
                'lab-pressable flex h-8 w-8 items-center justify-center rounded-full border cursor-pointer',
                gridCustomizerOpen
                  ? 'border-brand bg-brand text-ink'
                  : 'border-hairline bg-surface text-ink-secondary',
              ].join(' ')}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Abrir painel do corpus"
            aria-expanded={drawerOpen}
            className="lab-pressable relative flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface text-ink-secondary cursor-pointer"
          >
            <Menu className="h-3.5 w-3.5" />
            {activeProjectFilter !== 'all' ? (
              <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-tier-s" />
            ) : null}
          </button>
        </div>
      </header>

      {/* ───── Desktop Savee Vertical Icon Rail (64px fixed/sticky) ───── */}
      <aside
        aria-label="Barra lateral de ferramentas"
        className="hidden lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-dvh lg:w-16 lg:shrink-0 lg:flex-col lg:items-center lg:justify-between lg:border-r lg:border-hairline/80 lg:bg-canvas/88 lg:py-4 lg:backdrop-blur-2xl lg:backdrop-saturate-150"
      >
        {/* Topo: Monograma + Busca ⌘K */}
        <div className="flex w-full flex-col items-center gap-2">
          <div className="relative flex w-full justify-center">
            <button
              type="button"
              onClick={() => onSelectSection('mapa')}
              onMouseEnter={() =>
                setHoveredTip({
                  id: 'brand',
                  label: 'Prompt Engine V1',
                  badge: stats ? formatCompact(stats.totalCorpusSize).toUpperCase() : 'FTS5',
                })
              }
              onMouseLeave={() => setHoveredTip(null)}
              aria-label="Prompt Engine V1: Início"
              className="lab-pressable flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[11px] font-semibold tracking-tighter text-canvas shadow-md cursor-pointer"
            >
              PE
            </button>
            {renderRailPopup('brand')}
          </div>

          {onOpenCommandPalette ? (
            <div className="relative flex w-full justify-center">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                onMouseEnter={() =>
                  setHoveredTip({ id: 'cmd', label: 'Busca & Comandos', badge: '⌘K' })
                }
                onMouseLeave={() => setHoveredTip(null)}
                aria-label="Abrir busca rápida (⌘K)"
                className="lab-pressable flex h-10 w-10 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:bg-elevated hover:text-ink cursor-pointer"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              {renderRailPopup('cmd')}
            </div>
          ) : null}

          <div className="my-0.5 h-px w-6 bg-hairline" />
        </div>

        {/* Navegação Principal */}
        <nav
          aria-label="Navegação principal"
          className="flex w-full flex-col items-center gap-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.id === activeSection
            return (
              <div key={item.id} className="relative flex w-full justify-center">
                <button
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  onMouseEnter={() =>
                    setHoveredTip({
                      id: item.id,
                      label: `${item.label} · ${item.hint}`,
                      badge: item.badge,
                    })
                  }
                  onMouseLeave={() => setHoveredTip(null)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'lab-pressable relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer',
                    isActive
                      ? 'bg-brand/16 text-brand-bright ring-1 ring-inset ring-brand/40'
                      : 'text-ink-tertiary hover:bg-surface hover:text-ink',
                  ].join(' ')}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute -left-3 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full bg-brand shadow-[0_0_12px_color-mix(in_srgb,var(--color-brand)_85%,transparent)]"
                    />
                  ) : null}

                  {item.id === 'perfil' ? (
                    <CartographerRankMark
                      roman={cartographer?.rank.roman ?? 'I'}
                      title={cartographer?.rank.title}
                      size="sm"
                    />
                  ) : Icon ? (
                    <Icon className="h-[19px] w-[19px]" />
                  ) : null}

                  {item.highlightBadge ? (
                    <span
                      className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-tier-s ring-1 ring-canvas"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
                {renderRailPopup(item.id)}
              </div>
            )
          })}

          <div className="relative flex w-full justify-center">
            <button
              type="button"
              onClick={() => onSelectSection('design_system')}
              onMouseEnter={() =>
                setHoveredTip({ id: 'design_system', label: 'Design System', badge: 'Savee' })
              }
              onMouseLeave={() => setHoveredTip(null)}
              aria-label="Design System Playground"
              aria-current={activeSection === 'design_system' ? 'page' : undefined}
              className={[
                'lab-pressable relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer',
                activeSection === 'design_system'
                  ? 'bg-brand/16 text-brand-bright ring-1 ring-inset ring-brand/40'
                  : 'text-ink-tertiary hover:bg-surface hover:text-ink',
              ].join(' ')}
            >
              {activeSection === 'design_system' ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-3 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full bg-brand shadow-[0_0_12px_color-mix(in_srgb,var(--color-brand)_85%,transparent)]"
                />
              ) : null}
              <Palette className="h-[18px] w-[18px] text-brand-2" />
            </button>
            {renderRailPopup('design_system')}
          </div>
        </nav>

        {/* Controles Inferiores do Rail */}
        <div className="flex w-full flex-col items-center gap-1.5" data-rail-drawer>
          {onToggleGridCustomizer ? (
            <div className="relative flex w-full justify-center">
              <button
                type="button"
                onClick={onToggleGridCustomizer}
                onMouseEnter={() =>
                  setHoveredTip({
                    id: 'grid-dock',
                    label: 'Customize Grid',
                    badge: gridCustomizerOpen ? 'Aberto' : 'Grade',
                  })
                }
                onMouseLeave={() => setHoveredTip(null)}
                aria-label="Customizar grade do álbum"
                aria-pressed={gridCustomizerOpen}
                className={[
                  'lab-pressable flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer',
                  gridCustomizerOpen
                    ? 'bg-brand text-ink shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--color-brand)_60%,transparent)]'
                    : 'text-ink-tertiary hover:bg-elevated hover:text-ink',
                ].join(' ')}
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" />
              </button>
              {renderRailPopup('grid-dock')}
            </div>
          ) : null}

          {cartographer && onToggleSound ? (
            <div className="relative flex w-full justify-center">
              <button
                type="button"
                onClick={onToggleSound}
                onMouseEnter={() =>
                  setHoveredTip({
                    id: 'sound',
                    label: cartographer.soundEnabled ? 'Som ativo' : 'Som silenciado',
                  })
                }
                onMouseLeave={() => setHoveredTip(null)}
                aria-label={cartographer.soundEnabled ? 'Silenciar feedback sonoro' : 'Ativar feedback sonoro'}
                className="lab-pressable flex h-10 w-10 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:bg-elevated hover:text-ink cursor-pointer"
              >
                {cartographer.soundEnabled ? (
                  <Volume2 className="h-[18px] w-[18px] text-tier-s" />
                ) : (
                  <VolumeX className="h-[18px] w-[18px]" />
                )}
              </button>
              {renderRailPopup('sound')}
            </div>
          ) : null}

          {onTriggerSync ? (
            <div className="relative flex w-full justify-center">
              <button
                type="button"
                onClick={onTriggerSync}
                disabled={isSyncing}
                onMouseEnter={() =>
                  setHoveredTip({
                    id: 'sync',
                    label: isSyncing ? 'Sincronizando Eagle...' : 'Sincronizar acervo RO',
                    badge:
                      syncStatus && !syncStatus.inSync
                        ? `+${syncStatus.totalPendingChanges}`
                        : undefined,
                  })
                }
                onMouseLeave={() => setHoveredTip(null)}
                aria-label="Sincronizar acervo"
                className={[
                  'lab-pressable relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60',
                  syncStatus && !syncStatus.inSync
                    ? 'text-tier-s hover:bg-tier-s/12'
                    : 'text-ink-tertiary hover:bg-elevated hover:text-ink',
                ].join(' ')}
              >
                <RefreshCw className={['h-[18px] w-[18px]', isSyncing ? 'animate-spin' : ''].join(' ')} />
                {syncStatus && !syncStatus.inSync && !isSyncing ? (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-tier-s ring-1 ring-canvas" />
                ) : null}
              </button>
              {renderRailPopup('sync')}
            </div>
          ) : null}

          <div className="relative flex w-full justify-center">
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              onMouseEnter={() =>
                setHoveredTip({
                  id: 'corpus-drawer',
                  label: 'Corpus, Bibliotecas & Cartógrafo',
                  badge: activeProjectFilter !== 'all' ? 'Filtro ativo' : 'RO',
                })
              }
              onMouseLeave={() => setHoveredTip(null)}
              aria-label="Painel retrátil de Corpus e Cartógrafo"
              aria-expanded={drawerOpen}
              className={[
                'lab-pressable relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer',
                drawerOpen
                  ? 'bg-elevated text-ink ring-1 ring-inset ring-border-hover'
                  : 'text-ink-tertiary hover:bg-elevated hover:text-ink',
              ].join(' ')}
            >
              <Database className="h-[18px] w-[18px]" />
              {activeProjectFilter !== 'all' ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-tier-s ring-1 ring-canvas" />
              ) : null}
            </button>
            {renderRailPopup('corpus-drawer')}
          </div>

          <div className="relative flex w-full justify-center">
            <button
              type="button"
              onClick={() => onSelectSection('configuracoes')}
              onMouseEnter={() =>
                setHoveredTip({ id: 'configuracoes', label: 'Configurações' })
              }
              onMouseLeave={() => setHoveredTip(null)}
              aria-label="Configurações"
              aria-current={activeSection === 'configuracoes' ? 'page' : undefined}
              className={[
                'lab-pressable relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer',
                activeSection === 'configuracoes'
                  ? 'bg-brand/16 text-brand-bright ring-1 ring-inset ring-brand/40'
                  : 'text-ink-tertiary hover:bg-elevated hover:text-ink',
              ].join(' ')}
            >
              {activeSection === 'configuracoes' ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-3 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full bg-brand shadow-[0_0_12px_color-mix(in_srgb,var(--color-brand)_85%,transparent)]"
                />
              ) : null}
              <Settings className="h-[18px] w-[18px]" />
            </button>
            {renderRailPopup('configuracoes')}
          </div>
        </div>
      </aside>

      {/* ───── Gaveta Retrátil do Cartógrafo & Corpus (sob demanda) ───── */}
      {drawerOpen ? (
        <div
          ref={drawerRef}
          data-rail-drawer
          style={{ ['--transform-origin' as string]: 'bottom left' }}
          className="lab-popover savee-glass-panel fixed top-16 right-3 z-[1700] w-[min(320px,calc(100vw-24px))] rounded-2xl p-4 lg:top-auto lg:right-auto lg:bottom-4 lg:left-[76px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-hairline pb-3">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-ink">Prompt Engine</span>
                <span className="club-tag-italic rounded-full bg-ink px-2 py-0.5 text-[9px] text-canvas">
                  V1
                </span>
              </div>
              <span className="tabular-mono text-[10px] text-ink-muted">
                {stats
                  ? `FTS5 · ${stats.totalCorpusSize.toLocaleString('pt-BR')} prompts`
                  : 'FTS5 · Indexando'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-hairline bg-elevated px-2 py-0.5 text-[10px] text-ink-tertiary">
                <Lock className="h-2.5 w-2.5" />
                RO
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar painel"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-tertiary hover:bg-white/[0.08] hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {/* Seletor de Biblioteca (quando >1 biblioteca ativa) */}
            {(stats?.geminiKimiSize ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <span className="section-eyebrow">Biblioteca Ativa</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-canvas p-1">
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
                            ? 'bg-elevated text-ink'
                            : 'text-ink-muted hover:text-ink-secondary',
                        ].join(' ')}
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

            {/* Filtro de projeto ativo */}
            {activeProjectFilter !== 'all' ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-tier-s/35 bg-tier-s/[0.07] px-3 py-2">
                <div className="min-w-0">
                  <span className="section-eyebrow text-tier-s">Projeto Filtrado</span>
                  <div className="truncate text-[12px] font-medium text-ink">
                    {activeProjectFilter}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearProjectFilter}
                  aria-label="Limpar filtro de projeto"
                  className="rounded-lg border border-hairline p-1 text-ink-secondary hover:text-ink cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {/* Cartão Resumo do Cartógrafo */}
            {cartographer ? (
              <button
                type="button"
                onClick={() => {
                  onSelectSection('perfil')
                  setDrawerOpen(false)
                }}
                className="lab-pressable-subtle flex w-full flex-col gap-2 rounded-xl border border-hairline bg-canvas p-3 text-left transition-colors hover:border-tier-s/60 cursor-pointer"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <CartographerRankMark
                      roman={cartographer.rank.roman}
                      title={cartographer.rank.title}
                    />
                    <span className="tabular-mono text-[10px] font-medium tracking-wider text-tier-s">
                      {cartographer.rank.badge}
                    </span>
                  </span>
                  <span className="tabular-mono text-[10px] text-ink-tertiary">
                    {cartographer.todayCount} hoje
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium text-ink">
                    {cartographer.displayName && cartographer.displayName !== 'Cartógrafo'
                      ? cartographer.displayName
                      : cartographer.rank.title}
                  </span>
                  <span className="tabular-mono shrink-0 text-ink-tertiary">
                    {Math.round(animatedDiscoveredCount)} gaps
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="section-eyebrow">Território Ocupado</span>
                    <span className="tabular-mono text-ink-secondary">
                      {territoryMappedPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                      style={{
                        transform: `scaleX(${
                          territoryMappedPct === 0
                            ? 0
                            : Math.max(0.02, Math.min(1, territoryMappedPct / 100))
                        })`,
                      }}
                    />
                  </div>
                </div>
              </button>
            ) : null}

            {/* Ações Rápidas */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  onOpenSchemaModal()
                  setDrawerOpen(false)
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-elevated px-2.5 py-2 text-[11px] font-medium text-ink-secondary transition-colors hover:border-border-hover hover:text-ink cursor-pointer"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Schema (8 ATR)</span>
              </button>

              <a
                href="/legacy"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-elevated px-2.5 py-2 text-[11px] font-medium text-ink-secondary transition-colors hover:border-border-hover hover:text-ink"
              >
                <span>Versão Legacy</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
