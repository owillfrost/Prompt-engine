import { useEffect, useState } from 'react'
import { AppSidebar, type NavSectionId } from './components/AppSidebar'
import { CollectionView } from './components/CollectionView'
import { GapsView } from './components/GapsView'
import { MapView } from './components/MapView'
import { PairsView } from './components/PairsView'
import { ProjectsView, type ProjectsSubTab } from './components/ProjectsView'
import { PromptInspectorDrawer } from './components/PromptInspectorDrawer'
import { SchemaProposalModal } from './components/SchemaProposalModal'
import type { PromptItem, SourceLibFilter, SuitePayload } from './types/promptEngine'

export function App() {
  const [suite, setSuite] = useState<SuitePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    let active = true
    fetch('/api/suite')
      .then(async (res) => {
        if (!res.ok) {
          const msg = await res.text()
          throw new Error(msg || `HTTP ${res.status}`)
        }
        return (await res.json()) as SuitePayload
      })
      .then((data) => {
        if (!active) return
        setSuite(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
      />

      <main className="min-w-0 flex-1">
        {loading ? (
          <div className="flex h-full min-h-[60dvh] items-center justify-center">
            <span className="tabular-mono text-[12px] text-zinc-500">
              Carregando Prompt Engine V1 (22.282 prompts · SQLite FTS5, clusters e matriz de gaps)...
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
            mapData={suite.mapData}
            sourceLib={sourceLib}
            activeProjectFilter={activeProjectFilter}
            onInspectItem={setSelectedItem}
            onOpenPair={openPairFromMap}
            onOpenGap={(gapId) => openGapView('all', gapId)}
          />
        ) : activeSection === 'colecao' ? (
          <CollectionView
            sourceLib={sourceLib}
            stats={suite.stats}
            selectedItem={selectedItem}
            activeProjectFilter={activeProjectFilter}
            onProjectFilterChange={setActiveProjectFilter}
            onSelectItem={setSelectedItem}
            onOpenSchemaModal={() => setSchemaOpen(true)}
          />
        ) : activeSection === 'pares' ? (
          <PairsView
            items={suite.items}
            pairsData={suite.pairsData}
            customPairIds={customPairIds}
            onClearCustomPair={() => setCustomPairIds(null)}
            onInspectItem={setSelectedItem}
          />
        ) : activeSection === 'gaps' ? (
          <GapsView
            items={suite.items}
            gapsData={suite.gapsData}
            initialScope={gapTargetScope}
            initialGapId={gapTargetId}
            onInspectItem={setSelectedItem}
          />
        ) : (
          <ProjectsView
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
            onInspectItem={setSelectedItem}
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
