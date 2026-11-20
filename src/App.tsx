import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSidebar, type NavSectionId } from './components/AppSidebar'
import { CollectionView } from './components/CollectionView'
import { ExperimentsView } from './components/ExperimentsView'
import { GapsView } from './components/GapsView'
import { MapView } from './components/MapView'
import { PairsView } from './components/PairsView'
import { ProjectsView, type ProjectsSubTab } from './components/ProjectsView'
import { PromptInspectorDrawer } from './components/PromptInspectorDrawer'
import { SchemaProposalModal } from './components/SchemaProposalModal'
import { playTierSChime } from './core/soundFeedback'
import { useCartographerProfile } from './hooks/useCartographerProfile'
import { useCorpusSync } from './hooks/useCorpusSync'
import type { PromptItem, SourceLibFilter, SuitePayload } from './types/promptEngine'

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

  // Deep-links entre telas (Mapa -> Pares, Mapa/Projetos -> Gaps, Inspetor -> Lapidação)
  const [customPairIds, setCustomPairIds] = useState<[string, string] | null>(null)
  const [gapTargetScope, setGapTargetScope] = useState<string>('all')
  const [gapTargetId, setGapTargetId] = useState<string | null>(null)
  const [projectsSubTab, setProjectsSubTab] = useState<ProjectsSubTab>('projects')
  const [refinementTargetItem, setRefinementTargetItem] = useState<PromptItem | null>(null)

  const {
    state: cartographerState,
    todayCount,
    cartographerRank,
    recordGapDiscovery,
    recordPromptExplored,
    toggleSound,
  } = useCartographerProfile()

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

  const openPairFromMap = (idA: string, idB: string) => {
    setCustomPairIds([idA, idB])
    setActiveSection('pares')
  }

  const openGapView = (scope = 'all', gapId?: string) => {
    setGapTargetScope(scope)
    setGapTargetId(gapId || null)
    setActiveSection('gaps')
  }

  const handleChangeSourceLib = (nextLib: SourceLibFilter) => {
    setSourceLib(nextLib)
    if (activeProjectFilter !== 'all') {
      setActiveProjectFilter('all')
    }
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[#09090b] text-zinc-100 lg:flex-row">
      <AppSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec)
        }}
        sourceLib={sourceLib}
        onChangeSourceLib={handleChangeSourceLib}
        stats={suite?.stats || null}
        suite={suite}
        activeProjectFilter={activeProjectFilter}
        onClearProjectFilter={() => setActiveProjectFilter('all')}
        onOpenSchemaModal={() => setSchemaOpen(true)}
        cartographer={{
          discoveredGapsCount: cartographerState.discoveredGapIds.length,
          todayCount,
          exploredPromptsCount: cartographerState.exploredPromptIds.length,
          collectedTierSCount: cartographerState.collectedTierSIds.length,
          rank: cartographerRank,
          soundEnabled: cartographerState.soundEnabled,
        }}
        onToggleSound={toggleSound}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        onTriggerSync={() => void triggerSync()}
      />

      <main className="min-w-0 flex-1">
        {loading ? (
          <div className="flex h-full min-h-[60dvh] items-center justify-center">
            <span className="tabular-mono text-[12px] text-zinc-500">
              Carregando Prompt Engine V1 (SQLite FTS5, clusters e matriz de gaps)...
            </span>
          </div>
        ) : error || !suite ? (
          <div className="mx-auto max-w-xl p-8">
            <div className="rounded-2xl border border-white/[0.1] bg-[#101013] p-5">
              <span className="section-eyebrow">Erro de Ingestão</span>
              <p className="mt-2 font-mono text-[12px] text-zinc-300">
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
            activeProjectFilter={activeProjectFilter}
            onProjectFilterChange={setActiveProjectFilter}
            onSelectItem={handleInspectItem}
            onOpenSchemaModal={() => setSchemaOpen(true)}
            exploredPromptIds={cartographerState.exploredPromptIds}
            collectedTierSIds={cartographerState.collectedTierSIds}
          />
        ) : activeSection === 'pares' ? (
          <PairsView
            items={suite.items}
            pairsData={suite.pairsData}
            customPairIds={customPairIds}
            onClearCustomPair={() => setCustomPairIds(null)}
            onInspectItem={handleInspectItem}
          />
        ) : activeSection === 'gaps' ? (
          <GapsView
            items={suite.items}
            gapsData={suite.gapsData}
            stats={suite.stats}
            initialScope={gapTargetScope}
            initialGapId={gapTargetId}
            onInspectItem={handleInspectItem}
            soundEnabled={cartographerState.soundEnabled}
            discoveredGapIds={cartographerState.discoveredGapIds}
            onDiscoverGap={recordGapDiscovery}
            cartographerRank={cartographerRank}
            territoryOccupiedPct={territoryOccupiedPct}
          />
        ) : activeSection === 'experimentos' ? (
          <ExperimentsView
            key={syncVersion}
            sourceLib={sourceLib}
            soundEnabled={cartographerState.soundEnabled}
            onInspectItem={handleInspectItem}
          />
        ) : (
          <ProjectsView
            key={syncVersion}
            projects={suite.projectsData}
            items={suite.items}
            sourceLib={sourceLib}
            immatureCount={suite.stats.quadrantDistribution.raro_imaturo}
            activeSubTab={projectsSubTab}
            onSubTabChange={setProjectsSubTab}
            refinementTargetItem={refinementTargetItem}
            onOpenCollectionForProject={(proj, projSourceLib) => {
              if (sourceLib !== 'all' && sourceLib !== projSourceLib) {
                setSourceLib(projSourceLib)
              }
              setActiveProjectFilter(proj)
              setActiveSection('colecao')
            }}
            onOpenMapForProject={(proj, projSourceLib) => {
              if (sourceLib !== 'all' && sourceLib !== projSourceLib) {
                setSourceLib(projSourceLib)
              }
              setActiveProjectFilter(proj)
              setActiveSection('mapa')
            }}
            onOpenGapsForProject={(proj, gapId) => openGapView(proj, gapId)}
            onInspectItem={handleInspectItem}
          />
        )}
      </main>

      <PromptInspectorDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onRefineItem={(it) => {
          setSelectedItem(null)
          setRefinementTargetItem(it)
          setProjectsSubTab('refinement')
          setActiveSection('projetos')
        }}
      />
      <SchemaProposalModal
        open={schemaOpen}
        stats={suite?.stats || null}
        onClose={() => setSchemaOpen(false)}
      />
    </div>
  )
}

export default App
