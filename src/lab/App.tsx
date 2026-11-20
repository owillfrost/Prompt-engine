import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Grid3x3, LayoutGrid, Search, Sparkles, X } from 'lucide-react'
import { AppSidebar, type NavSectionId } from './components/AppSidebar'
import { CartographerRankMark } from './components/CartographerRankMark'
import { ClubCommandModal, type ClubCommandTarget } from './components/ClubCommandModal'
import { CollectionView } from './components/CollectionView'
import { ExperimentsView } from './components/ExperimentsView'
import { GapsView } from './components/GapsView'
import { MapView } from './components/MapView'
import { PairsView } from './components/PairsView'
import { ProfileView } from './components/ProfileView'
import { ProjectsView, type ProjectsSubTab } from './components/ProjectsView'
import { PromptInspectorDrawer } from './components/PromptInspectorDrawer'
import { SchemaProposalModal } from './components/SchemaProposalModal'
import { SettingsView } from './components/SettingsView'
import { DesignSystemPlaygroundView } from './components/DesignSystemPlaygroundView'
import { playTierSChime } from '../core/soundFeedback'
import {
  useCartographerProfile,
  type FavoritePromptEntry,
} from '../hooks/useCartographerProfile'
import { useCorpusSync } from '../hooks/useCorpusSync'
import { getPromptSemanticTitle } from './utils/promptDisplay'
import type {
  GapDraftRecord,
  PromptDetailResponse,
  PromptItem,
  SourceLibFilter,
  SuitePayload,
} from '../types/promptEngine'

export function App() {
  const [suite, setSuite] = useState<SuitePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncVersion, setSyncVersion] = useState(0)

  const [activeSection, setActiveSection] = useState<NavSectionId>('mapa')
  const [sourceLib, setSourceLib] = useState<SourceLibFilter>('google_flow')
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | 'all'>('all')
  const [selectedItem, setSelectedItem] = useState<PromptItem | null>(null)
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandOpenSource, setCommandOpenSource] = useState<'keyboard' | 'click'>('keyboard')
  const [collectionSearchSeed, setCollectionSearchSeed] = useState<string>('')
  const [gridColumns, setGridColumns] = useState<number>(5)
  const [gridGap, setGridGap] = useState<number>(16)
  const [cardRadius, setCardRadius] = useState<number>(8)
  const [albumMode, setAlbumMode] = useState<'masonry' | 'binder'>('masonry')
  const [gridCustomizerOpen, setGridCustomizerOpen] = useState<boolean>(false)
  const [swapTransition, setSwapTransition] = useState<{ key: number; animate: boolean }>({
    key: 0,
    animate: false,
  })

  // Deep-links entre telas
  const [customPairIds, setCustomPairIds] = useState<[string, string] | null>(null)
  const [gapTargetScope, setGapTargetScope] = useState<string>('all')
  const [gapTargetId, setGapTargetId] = useState<string | null>(null)
  const [draftToLoadInGaps, setDraftToLoadInGaps] = useState<GapDraftRecord | null>(null)
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('projects')
  const [refinementTargetItem, setRefinementTargetItem] = useState<PromptItem | null>(null)

  // Rascunhos persistidos em data/gap_drafts.json compartilhados entre Gaps, Perfil e Configurações
  const [gapDrafts, setGapDrafts] = useState<GapDraftRecord[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)

  const {
    state: cartographerState,
    todayCount,
    activeDaysCount,
    cartographerRank,
    nextRankProgress,
    recordGapDiscovery,
    recordPromptExplored,
    toggleSound,
    markDailyMissionCompleted,
    updateDisplayName,
    toggleFavorite,
    removeFavoriteById,
    isFavorite,
    createCollection,
    deleteCollection,
    toggleItemInCollection,
    markProfileVisited,
    updatePreferences,
    clearLocalProfileData,
    buildExportPayload,
  } = useCartographerProfile()

  // Sincroniza paleta, densidade e redução manual de animações no <html>
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.palette = cartographerState.preferences.palette
    root.dataset.density = cartographerState.preferences.density
    root.dataset.reducedMotion = cartographerState.preferences.reducedMotion
    return () => {
      delete root.dataset.palette
      delete root.dataset.density
      delete root.dataset.reducedMotion
    }
  }, [
    cartographerState.preferences.palette,
    cartographerState.preferences.density,
    cartographerState.preferences.reducedMotion,
  ])

  const handleInspectItem = useCallback(
    (item: PromptItem) => {
      setSelectedItem(item)
      recordPromptExplored(item)
      if (item.rarity.tier === 'S') {
        playTierSChime(cartographerState.soundEnabled)
      }
    },
    [recordPromptExplored, cartographerState.soundEnabled]
  )

  const handleToggleFavorite = useCallback(
    (item: PromptItem) => {
      toggleFavorite(item, getPromptSemanticTitle(item))
    },
    [toggleFavorite]
  )

  const territoryOccupiedPct = useMemo(() => {
    if (!suite) return 0
    let totalCells = 0
    let occupiedCells = 0
    for (const m of suite.gapsData.matrices) {
      totalCells += m.cells.length
      for (const c of m.cells) {
        if (c.observed > 0) occupiedCells++
      }
    }
    if (totalCells > 0) {
      return Math.min(
        100,
        ((occupiedCells + cartographerState.discoveredGapIds.length) / totalCells) * 100
      )
    }
    if (suite.stats.totalCorpusSize > 0) {
      return Math.min(100, (suite.stats.tierDistribution.S / suite.stats.totalCorpusSize) * 100)
    }
    return 0
  }, [suite, cartographerState.discoveredGapIds.length])

  // Badge "N novos" no item Perfil desde a última visita
  const newSinceLastVisit = useMemo(() => {
    if (activeSection === 'perfil') return 0
    const lastVisit = cartographerState.lastProfileVisitAt
    if (!lastVisit) {
      return cartographerState.favorites.length + gapDrafts.length
    }
    let count = 0
    for (const fav of cartographerState.favorites) {
      if (fav.addedAt > lastVisit) count++
    }
    for (const d of gapDrafts) {
      if (d.createdAt > lastVisit) count++
    }
    return count
  }, [
    activeSection,
    cartographerState.lastProfileVisitAt,
    cartographerState.favorites,
    gapDrafts,
  ])

  const loadSuite = useCallback(async () => {
    try {
      const res = await fetch('/api/suite', { cache: 'no-store' })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as SuitePayload
      setSuite(data)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSuite()
  }, [loadSuite])

  const handleSyncCompleted = useCallback(() => {
    void loadSuite().then(() => {
      setSyncVersion((v) => v + 1)
    })
  }, [loadSuite])

  const { syncStatus, isSyncing, triggerSync } = useCorpusSync({
    onSyncCompleted: handleSyncCompleted,
  })

  useEffect(() => {
    let active = true
    setLoadingDrafts(true)
    fetch('/api/gap-drafts')
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((data: { drafts?: GapDraftRecord[] }) => {
        if (!active) return
        if (Array.isArray(data.drafts)) {
          setGapDrafts(data.drafts)
        }
        setLoadingDrafts(false)
      })
      .catch(() => {
        if (!active) return
        setLoadingDrafts(false)
      })
    return () => {
      active = false
    }
  }, [])

  const navigateToSection = useCallback((sec: NavSectionId, byClick: boolean) => {
    setActiveSection((prev) => {
      if (prev !== sec) {
        setSwapTransition((s) => ({ key: s.key + 1, animate: byClick }))
      }
      return sec
    })
  }, [])

  const openPairFromMap = (idA: string, idB: string) => {
    setCustomPairIds([idA, idB])
    navigateToSection('pares', true)
  }

  const openGapView = (scope = 'all', gapId?: string) => {
    setGapTargetScope(scope)
    setGapTargetId(gapId || null)
    navigateToSection('gaps', true)
  }

  const handleInspectPromptById = useCallback(
    async (id: string, fallback?: FavoritePromptEntry) => {
      const localMatch = suite?.items.find((it) => it.id === id)
      if (localMatch) {
        handleInspectItem(localMatch)
        return
      }
      try {
        const res = await fetch(`/api/prompt/${encodeURIComponent(id)}?limit=1`)
        if (res.ok) {
          const detail = (await res.json()) as PromptDetailResponse
          if (detail?.item) {
            handleInspectItem(detail.item)
            return
          }
        }
      } catch {
        // Fallback leve abaixo caso SQLite não responda
      }
      if (fallback) {
        setSelectedItem({
          id: fallback.id,
          sourceLib: fallback.sourceLib,
          project: fallback.project,
          folders: [fallback.project],
          eagleTags: [],
          star: 0,
          btime: 0,
          title: fallback.title,
          rawPrompt: fallback.semanticTitle || fallback.title,
          cleanPrompt: fallback.semanticTitle || fallback.title,
          excerpt: fallback.semanticTitle || fallback.title,
          thumbnailUrl: fallback.thumbnailUrl,
          attributes: {
            sujeito: { text: '', tags: [], filled: false },
            cenario: { text: '', tags: [], filled: false },
            luz: { text: '', tags: [], filled: false },
            camera: { text: '', tags: [], filled: false },
            textura_material: { text: '', tags: [], filled: false },
            estilo: { text: '', tags: [], filled: false },
            projeto_cliente: { text: fallback.project, tags: [], filled: true },
            estrutura: {
              text: fallback.kernelDialect,
              tags: [],
              filled: true,
              macroFormat: fallback.macroFormat,
              kernelDialect: fallback.kernelDialect,
              skeletonSignature: `${fallback.macroFormat}:${fallback.kernelDialect}`,
              filledAttributesCount: 2,
              hasExplicitNegative: false,
              aspectRatio: '3:4',
              tokenCount: 0,
              topKeysOrSections: [],
            },
          },
          rarity: {
            score: fallback.rarityPercentile,
            percentile: fallback.rarityPercentile,
            tier: fallback.rarityTier,
            label: fallback.rarityLabel,
            meanIdf: 0,
            pairRarityBonus: 0,
            rarestTags: [],
            corpusRank: 1,
            corpusSize: suite?.stats.totalCorpusSize ?? 0,
          },
          maturity: {
            score: fallback.maturityScore,
            skeletonReuseCount: 1,
            skeletonReuseScore: 0,
            completenessScore: 0,
            technicalPrecisionScore: 0,
            curationScore: 0,
          },
          quadrant: 'raro_maduro',
        })
      }
    },
    [suite, handleInspectItem]
  )

  const handleDeleteDraftFromProfile = useCallback(async (draftId: string) => {
    try {
      const res = await fetch(`/api/gap-drafts/${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const data = (await res.json()) as { drafts: GapDraftRecord[] }
        setGapDrafts(data.drafts)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleExportProfile = useCallback(() => {
    const payload = buildExportPayload(gapDrafts)
    const dateSlug = new Date().toISOString().slice(0, 10)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompt-engine-perfil-${dateSlug}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [buildExportPayload, gapDrafts])

  const handleClearLocalData = useCallback(
    async (alsoClearDrafts: boolean) => {
      clearLocalProfileData()
      if (alsoClearDrafts && gapDrafts.length > 0) {
        await Promise.all(
          gapDrafts.map((d) =>
            fetch(`/api/gap-drafts/${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(
              () => null
            )
          )
        )
        setGapDrafts([])
      }
    },
    [clearLocalProfileData, gapDrafts]
  )

  const handleChangeSourceLib = (nextLib: SourceLibFilter) => {
    setSourceLib(nextLib)
    if (activeProjectFilter !== 'all') {
      setActiveProjectFilter('all')
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpenSource('keyboard')
        setCommandOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleCommandNavigate = (target: ClubCommandTarget) => {
    if (target.projectsSubTab) {
      setProjectsSubTab(target.projectsSubTab)
    }
    if (target.searchQuery !== undefined) {
      setCollectionSearchSeed(target.searchQuery)
    }
    navigateToSection(target.section, commandOpenSource === 'click')
  }

  return (
    <div
      className={[
        'flex min-h-dvh w-full flex-col bg-canvas text-ink lg:flex-row',
        activeSection === 'mapa' ? 'lg:h-dvh lg:overflow-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AppSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          navigateToSection(sec, true)
        }}
        sourceLib={sourceLib}
        onChangeSourceLib={handleChangeSourceLib}
        stats={suite?.stats || null}
        suite={suite}
        activeProjectFilter={activeProjectFilter}
        onClearProjectFilter={() => setActiveProjectFilter('all')}
        onOpenSchemaModal={() => setSchemaOpen(true)}
        cartographer={{
          displayName: cartographerState.displayName,
          discoveredGapsCount: cartographerState.discoveredGapIds.length,
          todayCount,
          activeDaysCount,
          favoritesCount: cartographerState.favorites.length,
          newSinceLastVisit,
          exploredPromptsCount: cartographerState.exploredPromptIds.length,
          collectedTierSCount: cartographerState.collectedTierSIds.length,
          rank: cartographerRank,
          soundEnabled: cartographerState.soundEnabled,
        }}
        onToggleSound={toggleSound}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onTriggerSync={() => void triggerSync()}
        gridCustomizerOpen={gridCustomizerOpen}
        onToggleGridCustomizer={() => setGridCustomizerOpen((v) => !v)}
        onOpenCommandPalette={() => {
          setCommandOpenSource('click')
          setCommandOpen(true)
        }}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main
          key={swapTransition.animate ? `swap-${swapTransition.key}` : 'swap-static'}
          className={[
            'min-h-0 min-w-0 flex-1',
            activeSection !== 'mapa' ? 'pb-28' : '',
            swapTransition.animate ? 'lab-state-swap' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {loading ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center">
              <span className="tabular-mono text-[12px] text-ink-muted">
                Carregando Prompt Engine V1 (SQLite FTS5, clusters e matriz de gaps)...
              </span>
            </div>
          ) : error || !suite ? (
            <div className="mx-auto max-w-xl p-8">
              <div className="rounded-2xl border border-hairline bg-surface p-5">
                <span className="section-eyebrow">Erro de Ingestão</span>
                <p className="mt-2 font-mono text-[12px] text-ink-secondary">
                  {error || 'Payload indisponível.'}
                </p>
              </div>
            </div>
          ) : activeSection === 'mapa' ? (
            <MapView
              key={syncVersion}
              mapData={suite.mapData}
              sourceLib={sourceLib}
              activeProjectFilter={activeProjectFilter}
              onInspectItem={handleInspectItem}
              onOpenPair={openPairFromMap}
              onOpenGap={(gapId) => openGapView('all', gapId)}
            />
          ) : activeSection === 'colecao' ? (
            <CollectionView
              key={syncVersion}
              sourceLib={sourceLib}
              stats={suite.stats}
              selectedItem={selectedItem}
              initialSearchQuery={collectionSearchSeed}
              activeProjectFilter={activeProjectFilter}
              onProjectFilterChange={setActiveProjectFilter}
              onSelectItem={handleInspectItem}
              onOpenSchemaModal={() => setSchemaOpen(true)}
              exploredPromptIds={cartographerState.exploredPromptIds}
              collectedTierSIds={cartographerState.collectedTierSIds}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavorite}
              gridColumns={gridColumns}
              gridGap={gridGap}
              cardRadius={cardRadius}
              albumMode={albumMode}
              onChangeAlbumMode={setAlbumMode}
              onOpenGridCustomizer={() => setGridCustomizerOpen((v) => !v)}
            />
          ) : activeSection === 'pares' ? (
            <PairsView
              items={suite.items}
              pairsData={suite.pairsData}
              customPairIds={customPairIds}
              onClearCustomPair={() => setCustomPairIds(null)}
              onInspectItem={handleInspectItem}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavorite}
            />
          ) : activeSection === 'gaps' ? (
            <GapsView
              items={suite.items}
              gapsData={suite.gapsData}
              stats={suite.stats}
              syncVersion={syncVersion}
              initialScope={gapTargetScope}
              initialGapId={gapTargetId}
              initialDraftToLoad={draftToLoadInGaps}
              onConsumedInitialDraft={() => setDraftToLoadInGaps(null)}
              onDraftsChange={setGapDrafts}
              onInspectItem={handleInspectItem}
              onInspectPromptById={(id) => void handleInspectPromptById(id)}
              soundEnabled={cartographerState.soundEnabled}
              discoveredGapIds={cartographerState.discoveredGapIds}
              onDiscoverGap={recordGapDiscovery}
              onDailyMissionCompleted={markDailyMissionCompleted}
              cartographerRank={cartographerRank}
              territoryOccupiedPct={territoryOccupiedPct}
              exploredPromptsCount={cartographerState.exploredPromptIds.length}
              favoritesCount={cartographerState.favorites.length}
            />
          ) : activeSection === 'experimentos' ? (
            <ExperimentsView
              sourceLib={sourceLib}
              soundEnabled={cartographerState.soundEnabled}
              onInspectItem={handleInspectItem}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavorite}
              onDraftsChange={setGapDrafts}
            />
          ) : activeSection === 'projetos' ? (
            <ProjectsView
              key={syncVersion}
              projects={suite.projectsData}
              items={suite.items}
              sourceLib={sourceLib}
              immatureCount={suite.stats.quadrantDistribution.raro_imaturo}
              activeSubTab={projectsSubTab}
              onSubTabChange={setProjectsSubTab}
              refinementTargetItem={refinementTargetItem}
              discoveredGapIds={cartographerState.discoveredGapIds}
              onOpenCollectionForProject={(proj, projSourceLib) => {
                if (sourceLib !== 'all' && sourceLib !== projSourceLib) {
                  setSourceLib(projSourceLib)
                }
                setActiveProjectFilter(proj)
                navigateToSection('colecao', true)
              }}
              onOpenMapForProject={(proj, projSourceLib) => {
                if (sourceLib !== 'all' && sourceLib !== projSourceLib) {
                  setSourceLib(projSourceLib)
                }
                setActiveProjectFilter(proj)
                navigateToSection('mapa', true)
              }}
              onOpenGapsForProject={(proj, gapId) => openGapView(proj, gapId)}
              onInspectItem={handleInspectItem}
            />
          ) : activeSection === 'perfil' ? (
            <ProfileView
              profile={cartographerState}
              rank={cartographerRank}
              nextRankProgress={nextRankProgress}
              activeDaysCount={activeDaysCount}
              territoryOccupiedPct={territoryOccupiedPct}
              suite={suite}
              drafts={gapDrafts}
              loadingDrafts={loadingDrafts}
              onUpdateDisplayName={updateDisplayName}
              onRemoveFavorite={removeFavoriteById}
              onCreateCollection={createCollection}
              onDeleteCollection={deleteCollection}
              onToggleItemInCollection={toggleItemInCollection}
              onDeleteDraft={handleDeleteDraftFromProfile}
              onMarkVisited={markProfileVisited}
              onInspectPromptById={(id, fb) => void handleInspectPromptById(id, fb)}
              onExploreGaps={() => navigateToSection('gaps', true)}
              onOpenGapDraft={(draft) => {
                setDraftToLoadInGaps(draft)
                navigateToSection('gaps', true)
              }}
            />
          ) : activeSection === 'design_system' ? (
            <DesignSystemPlaygroundView />
          ) : (
            <SettingsView
              profile={cartographerState}
              stats={suite.stats}
              drafts={gapDrafts}
              syncStatus={syncStatus}
              isSyncing={isSyncing}
              onTriggerSync={() => void triggerSync()}
              onToggleSound={toggleSound}
              onUpdatePreferences={updatePreferences}
              onExportProfile={handleExportProfile}
              onClearLocalData={handleClearLocalData}
              onOpenSchemaModal={() => setSchemaOpen(true)}
            />
          )}
        </main>
      </div>

      {/* ───── Savee Customize Grid Dock (z-1300) ───── */}
      {gridCustomizerOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-[1300] flex justify-center px-4 pb-[92px] lg:left-16 pointer-events-none">
          <div
            role="dialog"
            aria-label="Customizar grade do álbum"
            className="savee-bar-rise savee-glass-panel pointer-events-auto w-full max-w-[920px] rounded-[28px] p-5 sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-medium text-ink">Customize Grid</span>
                <div className="inline-flex items-center rounded-full border border-hairline bg-canvas p-0.5">
                  <button
                    type="button"
                    onClick={() => setAlbumMode('masonry')}
                    className={[
                      'lab-pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium cursor-pointer',
                      albumMode === 'masonry'
                        ? 'bg-ink text-canvas'
                        : 'text-ink-tertiary hover:text-ink',
                    ].join(' ')}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    <span>Savee Masonry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlbumMode('binder')}
                    className={[
                      'lab-pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium cursor-pointer',
                      albumMode === 'binder'
                        ? 'bg-ink text-canvas'
                        : 'text-ink-tertiary hover:text-ink',
                    ].join(' ')}
                  >
                    <Grid3x3 className="h-3 w-3" />
                    <span>Codex Binder 3:4</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSection !== 'colecao' ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigateToSection('colecao', true)
                    }}
                    className="lab-pressable rounded-full bg-brand px-3 py-1 text-[11px] font-medium text-ink hover:opacity-90 cursor-pointer"
                  >
                    Abrir Álbum
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Fechar customização da grade"
                  onClick={() => setGridCustomizerOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-tertiary hover:bg-ink/[0.08] hover:text-ink cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 text-[13px] sm:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="flex justify-between text-ink-tertiary">
                  <span>Colunas</span>
                  <span className="tabular-mono text-ink">{gridColumns}</span>
                </span>
                <input
                  type="range"
                  min={2}
                  max={6}
                  step={1}
                  value={gridColumns}
                  onChange={(e) => setGridColumns(Number(e.target.value))}
                  className="w-full accent-brand cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="flex justify-between text-ink-tertiary">
                  <span>Espaçamento</span>
                  <span className="tabular-mono text-ink">{gridGap}px</span>
                </span>
                <input
                  type="range"
                  min={8}
                  max={28}
                  step={4}
                  value={gridGap}
                  onChange={(e) => setGridGap(Number(e.target.value))}
                  className="w-full accent-brand cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="flex justify-between text-ink-tertiary">
                  <span>Corners (Borda)</span>
                  <span className="tabular-mono text-ink">{cardRadius}px</span>
                </span>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={1}
                  value={cardRadius}
                  onChange={(e) => setCardRadius(Number(e.target.value))}
                  className="w-full accent-brand cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───── Savee Bottom Floating Bar (Command Pill + Mastery Pill, fora do Mapa) ───── */}
      {activeSection !== 'mapa' ? (
        <div className="pointer-events-none fixed right-0 bottom-5 left-0 z-30 flex items-center justify-center px-3 lg:left-16">
          {/* Bottom-Left Cartographer Mastery Pill (46px) */}
          <div className="pointer-events-auto absolute bottom-0 left-4 hidden xl:flex">
            <div className="savee-glass-pill flex h-[46px] items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3 transition-colors hover:border-border-hover">
              <button
                type="button"
                onClick={() => navigateToSection('perfil', true)}
                className="flex items-center gap-2 text-left cursor-pointer"
                title={`Rank ${cartographerRank.roman} · ${cartographerRank.title}`}
              >
                <CartographerRankMark
                  roman={cartographerRank.roman}
                  title={cartographerRank.title}
                  size="sm"
                />
                <span className="tabular-mono text-[11px] font-medium text-ink">
                  {cartographerState.collectedTierSIds.length} S · {territoryOccupiedPct.toFixed(1)}%
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProjectsSubTab('refinement')
                  navigateToSection('projetos', true)
                }}
                className="lab-pressable inline-flex h-[34px] items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                <span>Forja</span>
              </button>
            </div>
          </div>

          {/* Bottom-Center Command Launcher Pill (porta única para paleta ⌘K) */}
          <div className="pointer-events-auto flex items-center gap-2">
            {activeProjectFilter !== 'all' ? (
              <span className="savee-glass-pill flex h-[46px] shrink-0 items-center gap-2 rounded-full pr-3 pl-2 text-[12px] text-ink">
                <button
                  type="button"
                  aria-label="Limpar escopo de projeto"
                  onClick={() => setActiveProjectFilter('all')}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-canvas transition-opacity hover:opacity-80 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="max-w-[140px] truncate">{activeProjectFilter}</span>
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setCommandOpenSource('click')
                setCommandOpen(true)
              }}
              aria-label="Abrir busca rápida e comandos"
              className="savee-glass-pill lab-pressable flex h-[46px] items-center gap-3 rounded-full border border-hairline px-4 text-[13px] text-ink-tertiary transition-colors hover:border-border-hover hover:text-ink cursor-pointer"
            >
              <Search className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <span>Buscar no Códice</span>
              <span className="inline-flex shrink-0 items-center rounded-full border border-hairline bg-ink/[0.06] px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
                ⌘K
              </span>
            </button>
          </div>
        </div>
      ) : null}

      <PromptInspectorDrawer
        item={selectedItem}
        isCollectedTierS={Boolean(
          selectedItem &&
            selectedItem.rarity.tier === 'S' &&
            cartographerState.collectedTierSIds.includes(selectedItem.id)
        )}
        isFavorite={selectedItem ? isFavorite(selectedItem.id) : false}
        onToggleFavorite={handleToggleFavorite}
        collections={cartographerState.personalCollections}
        onToggleItemInCollection={toggleItemInCollection}
        onCreateCollection={createCollection}
        onClose={() => setSelectedItem(null)}
        onRefineItem={(it) => {
          setSelectedItem(null)
          setRefinementTargetItem(it)
          setProjectsSubTab('refinement')
          navigateToSection('projetos', true)
        }}
      />
      <SchemaProposalModal
        open={schemaOpen}
        stats={suite?.stats || null}
        onClose={() => setSchemaOpen(false)}
      />
      <ClubCommandModal
        open={commandOpen}
        openSource={commandOpenSource}
        onClose={() => setCommandOpen(false)}
        onNavigate={handleCommandNavigate}
      />
    </div>
  )
}

export default App
