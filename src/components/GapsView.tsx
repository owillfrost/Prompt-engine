import React, { useEffect, useMemo, useState } from 'react'
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import {
  axisToAttributeKey,
  defaultAttributeSourcesForGap,
  synthesizeGapPrompt,
} from '../core/gapSynthesizer'
import { formatTagPt } from '../core/promptTagsPt'
import { QUADRANT_META } from '../core/rarityEngine'
import { useCopyFeedback } from '../hooks/useCopyFeedback'
import type {
  CooccurrenceMatrix2D,
  CoreContentAttributeKey,
  DecomposePreviewResponse,
  GapAttributeSourceMode,
  GapDonorsResponse,
  GapDraftRecord,
  GapRecord,
  GapsPayload,
  MacroFormat,
  PromptItem,
} from '../types/promptEngine'

interface GapsViewProps {
  items: PromptItem[]
  gapsData: GapsPayload
  initialScope?: string
  initialGapId?: string | null
  onInspectItem: (item: PromptItem) => void
}

type GapListMode = 'project_2d_zero' | 'global_3d_zero' | 'global_2d_low_lift'

const ASPECT_OPTIONS = ['3:4', '4:5', '1:1', '16:9'] as const

const CORE_ATTR_SLOTS: ReadonlyArray<{
  key: CoreContentAttributeKey
  short: string
  label: string
}> = [
  { key: 'sujeito', short: 'SUJ', label: 'Sujeito' },
  { key: 'cenario', short: 'CEN', label: 'Cenário' },
  { key: 'luz', short: 'LUZ', label: 'Luz' },
  { key: 'camera', short: 'CAM', label: 'Câmera' },
  { key: 'textura_material', short: 'MAT', label: 'Material' },
  { key: 'estilo', short: 'EST', label: 'Estilo' },
]

const FORMAT_TABS: ReadonlyArray<{ id: MacroFormat; label: string; dialect: string }> = [
  { id: 'json', label: 'JSON', dialect: 'nano_banana_g6' },
  { id: 'sections', label: 'Seções', dialect: 'fdr_direct' },
  { id: 'single_paragraph', label: 'Parágrafo Único', dialect: 'qwen_natural' },
]

function triggerFileDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const GapsView: React.FC<GapsViewProps> = ({
  items,
  gapsData,
  initialScope = 'all',
  initialGapId = null,
  onInspectItem,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()
  const [matrixScope, setMatrixScope] = useState<string>(initialScope)
  const [axisPairKey, setAxisPairKey] = useState<string>('environment:lighting')
  const [listMode, setListMode] = useState<GapListMode>('project_2d_zero')
  const [selectedGapId, setSelectedGapId] = useState<string | null>(initialGapId)

  // Etapa 4: Pool dinâmico de doadores reais do SQLite
  const [donorsPool, setDonorsPool] = useState<GapDonorsResponse | null>(null)
  const [loadingDonors, setLoadingDonors] = useState(false)
  const [donorAIdx, setDonorAIdx] = useState(0)
  const [donorBIdx, setDonorBIdx] = useState(0)

  // Etapa 4: Estado do sintetizador Gap-to-Prompt
  const [synthFormat, setSynthFormat] = useState<MacroFormat>('json')
  const [aspectRatio, setAspectRatio] = useState<string>('3:4')
  const [includeNegative, setIncludeNegative] = useState(true)
  const [attributeSources, setAttributeSources] = useState<
    Record<CoreContentAttributeKey, GapAttributeSourceMode>
  >({
    sujeito: 'donor_a',
    cenario: 'donor_a',
    luz: 'donor_b',
    camera: 'donor_b',
    textura_material: 'donor_a',
    estilo: 'donor_a',
  })
  const [draftText, setDraftText] = useState('')
  const [manuallyEdited, setManuallyEdited] = useState(false)

  // Etapa 4: Telemetria ao vivo (/api/decompose-preview)
  const [preview, setPreview] = useState<DecomposePreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Etapa 4: Caderno local persistido em data/gap_drafts.json
  const [savedDrafts, setSavedDrafts] = useState<GapDraftRecord[]>([])
  const [savingDraft, setSavingDraft] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (initialScope && initialScope !== 'all') {
      setMatrixScope(initialScope)
      setListMode('project_2d_zero')
    }
  }, [initialScope])

  useEffect(() => {
    if (initialGapId) {
      setSelectedGapId(initialGapId)
      if (initialGapId.startsWith('g3d:')) setListMode('global_3d_zero')
      else if (initialGapId.startsWith('g2d:')) setListMode('global_2d_low_lift')
      else setListMode('project_2d_zero')
    }
  }, [initialGapId])

  useEffect(() => {
    fetch('/api/gap-drafts')
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((data: { drafts?: GapDraftRecord[] }) => {
        if (Array.isArray(data.drafts)) setSavedDrafts(data.drafts)
      })
      .catch(() => {
        // ignore
      })
  }, [])

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const availableScopes = useMemo(() => {
    const s = new Set<string>()
    for (const m of gapsData.matrices) s.add(m.scope)
    return Array.from(s)
  }, [gapsData.matrices])

  const availableAxisPairs = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of gapsData.matrices) {
      map.set(`${m.axisA}:${m.axisB}`, `${m.axisALabel} × ${m.axisBLabel}`)
    }
    return Array.from(map.entries())
  }, [gapsData.matrices])

  const activeMatrix: CooccurrenceMatrix2D | null = useMemo(() => {
    const [a, b] = axisPairKey.split(':')
    return (
      gapsData.matrices.find((m) => m.scope === matrixScope && m.axisA === a && m.axisB === b) ||
      gapsData.matrices.find((m) => m.scope === matrixScope) ||
      gapsData.matrices[0] ||
      null
    )
  }, [gapsData.matrices, matrixScope, axisPairKey])

  const rankedGaps: GapRecord[] = useMemo(() => {
    if (listMode === 'global_3d_zero') return gapsData.globalTriadGaps
    if (listMode === 'global_2d_low_lift') return gapsData.globalUnderexplored
    if (matrixScope !== 'all') {
      return gapsData.projectGaps.filter((g) => g.scope === matrixScope)
    }
    return gapsData.projectGaps
  }, [listMode, gapsData, matrixScope])

  const selectedGap: GapRecord | null = useMemo(() => {
    const all = [
      ...gapsData.projectGaps,
      ...gapsData.globalTriadGaps,
      ...gapsData.globalUnderexplored,
    ]
    if (selectedGapId) {
      const hit = all.find((g) => g.id === selectedGapId)
      if (hit) return hit
    }
    return rankedGaps[0] || null
  }, [gapsData, selectedGapId, rankedGaps])

  // Ao trocar de Gap selecionado: resetar índices de doadores, fontes padrão e buscar doadores no SQLite
  useEffect(() => {
    if (!selectedGap) {
      setDonorsPool(null)
      return
    }
    setDonorAIdx(0)
    setDonorBIdx(0)
    setAttributeSources(defaultAttributeSourcesForGap(selectedGap))
    setManuallyEdited(false)

    const controller = new AbortController()
    setLoadingDonors(true)
    const params = new URLSearchParams({
      tagA: selectedGap.tagA,
      tagB: selectedGap.tagB,
      scope: selectedGap.scope,
    })
    if (selectedGap.tagC) params.set('tagC', selectedGap.tagC)

    fetch(`/api/gap-donors?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as GapDonorsResponse
      })
      .then((pool) => {
        setDonorsPool(pool)
        setLoadingDonors(false)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setDonorsPool(null)
        setLoadingDonors(false)
      })

    return () => controller.abort()
  }, [selectedGap])

  const fallbackDonorA = selectedGap?.donorAId ? itemMap.get(selectedGap.donorAId) || null : null
  const fallbackDonorB = selectedGap?.donorBId ? itemMap.get(selectedGap.donorBId) || null : null

  const donorsListA = useMemo(() => {
    if (donorsPool && donorsPool.donorsA.length > 0) return donorsPool.donorsA
    return fallbackDonorA ? [fallbackDonorA] : []
  }, [donorsPool, fallbackDonorA])

  const donorsListB = useMemo(() => {
    if (donorsPool && donorsPool.donorsB.length > 0) return donorsPool.donorsB
    return fallbackDonorB ? [fallbackDonorB] : []
  }, [donorsPool, fallbackDonorB])

  const donorA = donorsListA.length > 0 ? donorsListA[donorAIdx % donorsListA.length] : null
  const donorB = donorsListB.length > 0 ? donorsListB[donorBIdx % donorsListB.length] : null

  // Síntese automática quando não houver edição manual em andamento
  useEffect(() => {
    if (!selectedGap || manuallyEdited) return
    const res = synthesizeGapPrompt({
      gap: selectedGap,
      donorA,
      donorB,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }, [
    selectedGap,
    donorA,
    donorB,
    synthFormat,
    aspectRatio,
    includeNegative,
    attributeSources,
    manuallyEdited,
  ])

  // Telemetria em tempo real via POST /api/decompose-preview
  useEffect(() => {
    if (!selectedGap || !draftText.trim()) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      const targetTags = [selectedGap.tagA, selectedGap.tagB]
      if (selectedGap.tagC) targetTags.push(selectedGap.tagC)

      const inheritedSet = new Set<string>()
      for (const slot of CORE_ATTR_SLOTS) {
        const srcMode = attributeSources[slot.key]
        const srcItem = srcMode === 'donor_b' ? donorB : srcMode === 'donor_a' ? donorA : null
        if (!srcItem) continue
        for (const tg of srcItem.attributes[slot.key].tags) inheritedSet.add(tg)
      }
      for (const d of [donorA, donorB]) {
        if (!d) continue
        for (const rt of d.rarity.rarestTags) inheritedSet.add(rt.tag)
      }

      fetch('/api/decompose-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          rawPrompt: draftText,
          scope: selectedGap.scope,
          targetTags,
          inheritedTags: Array.from(inheritedSet),
          knownGapZero: selectedGap.observedCount === 0,
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return (await r.json()) as DecomposePreviewResponse
        })
        .then((res) => {
          setPreview(res)
          setPreviewLoading(false)
        })
        .catch((err) => {
          if ((err as { name?: string })?.name === 'AbortError') return
          setPreviewLoading(false)
        })
    }, 260)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draftText, selectedGap, donorA, donorB, attributeSources])

  const targetSlotsMap = useMemo(() => {
    const map = new Map<CoreContentAttributeKey, string[]>()
    if (!selectedGap) return map
    const add = (ax: string | undefined, tg: string | undefined) => {
      if (!ax || !tg) return
      const key = axisToAttributeKey(ax)
      const arr = map.get(key) || []
      if (!arr.includes(tg)) arr.push(tg)
      map.set(key, arr)
    }
    add(selectedGap.axisA, selectedGap.tagA)
    add(selectedGap.axisB, selectedGap.tagB)
    add(selectedGap.axisC, selectedGap.tagC)
    return map
  }, [selectedGap])

  const handleRegenerateBase = () => {
    if (!selectedGap) return
    setManuallyEdited(false)
    const res = synthesizeGapPrompt({
      gap: selectedGap,
      donorA,
      donorB,
      format: synthFormat,
      aspectRatio,
      includeNegative,
      attributeSources,
    })
    setDraftText(res.rawPrompt)
  }

  const handleSaveDraft = async () => {
    if (!selectedGap || !draftText.trim() || savingDraft) return
    setSavingDraft(true)
    try {
      const res = await fetch('/api/gap-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gapId: selectedGap.id,
          gapTitle: selectedGap.title,
          scope: selectedGap.scope,
          axisA: selectedGap.axisA,
          tagA: selectedGap.tagA,
          axisB: selectedGap.axisB,
          tagB: selectedGap.tagB,
          axisC: selectedGap.axisC,
          tagC: selectedGap.tagC,
          donorAId: donorA?.id || null,
          donorBId: donorB?.id || null,
          macroFormat: preview?.attributes.estrutura.macroFormat || synthFormat,
          aspectRatio,
          attributeSources,
          rawPrompt: draftText,
          rarityPercentile: preview?.rarity.percentile ?? 85,
          rarityTier: preview?.rarity.tier ?? 'A',
          rarityLabel: preview?.rarity.label ?? 'mais raro que 85% da coleção',
          maturityScore: preview?.maturity.score ?? 75,
          quadrant: preview?.quadrant ?? 'raro_maduro',
          filledAttributesCount: preview?.attributes.estrutura.filledAttributesCount ?? 8,
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { drafts: GapDraftRecord[] }
        setSavedDrafts(data.drafts)
        setJustSaved(true)
        window.setTimeout(() => setJustSaved(false), 1800)
      }
    } finally {
      setSavingDraft(false)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/gap-drafts/${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const data = (await res.json()) as { drafts: GapDraftRecord[] }
        setSavedDrafts(data.drafts)
      }
    } catch {
      // ignore
    }
  }

  const handleLoadSavedDraft = (d: GapDraftRecord) => {
    setSelectedGapId(d.gapId)
    setSynthFormat(d.macroFormat)
    setAspectRatio(d.aspectRatio || '3:4')
    if (d.attributeSources) setAttributeSources(d.attributeSources)
    setManuallyEdited(true)
    setDraftText(d.rawPrompt)
    window.scrollTo({ top: 360, behavior: 'smooth' })
  }

  const handleExportSingle = (kind: 'json' | 'md') => {
    if (!selectedGap || !draftText.trim()) return
    const slug = `${selectedGap.tagA}_${selectedGap.tagB}`.replace(/[^a-z0-9_]+/gi, '-')
    if (kind === 'json') {
      const payload = {
        gap: {
          id: selectedGap.id,
          title: selectedGap.title,
          scope: selectedGap.scope,
          tags: [selectedGap.tagA, selectedGap.tagB, ...(selectedGap.tagC ? [selectedGap.tagC] : [])],
          observedCount: selectedGap.observedCount,
          expectedCount: selectedGap.expectedCount,
        },
        synthesis: {
          format: preview?.attributes.estrutura.macroFormat || synthFormat,
          aspectRatio,
          donorAId: donorA?.id || null,
          donorBId: donorB?.id || null,
          rarity: preview?.rarity || null,
          maturity: preview?.maturity || null,
          rawPrompt: draftText,
        },
      }
      triggerFileDownload(`gap_${slug}.json`, JSON.stringify(payload, null, 2), 'application/json')
    } else {
      const md = [
        `# Gap Brief — ${selectedGap.title}`,
        ``,
        `- **Escopo:** ${selectedGap.scope}`,
        `- **Lacuna:** O=${selectedGap.observedCount} · E=${selectedGap.expectedCount}`,
        `- **Formato:** ${(preview?.attributes.estrutura.macroFormat || synthFormat).toUpperCase()} (${aspectRatio})`,
        `- **Simulação:** ${preview ? `Tier ${preview.rarity.tier} · ${preview.rarity.label} · MAT ${preview.maturity.score}/100` : 'Pendente'}`,
        ``,
        `## Prompt Sintetizado`,
        ``,
        '```',
        draftText,
        '```',
      ].join('\n')
      triggerFileDownload(`gap_${slug}.md`, md, 'text/markdown;charset=utf-8')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <span className="section-eyebrow">
            Matriz de Co-ocorrência · N=19.227 Google Flow · Corpus 22.282
          </span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-zinc-100">
            Detector & Laboratório de Gaps Criativos (O = 0)
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Selecione um cruzamento virgem (O = 0), combine dois doadores reais do acervo e sintetize um novo prompt com simulação de raridade ao vivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={matrixScope}
            onChange={(e) => setMatrixScope(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-2 text-[12px] text-zinc-200 focus:border-white/25 focus:outline-none"
            aria-label="Escopo da matriz"
          >
            {availableScopes.map((sc) => (
              <option key={sc} value={sc}>
                {sc === 'all' ? 'Acervo Global (19.227 · Matriz)' : `Projeto: ${sc}`}
              </option>
            ))}
          </select>

          <select
            value={axisPairKey}
            onChange={(e) => setAxisPairKey(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 py-2 text-[12px] text-zinc-200 focus:border-white/25 focus:outline-none"
            aria-label="Eixos da matriz"
          >
            {availableAxisPairs.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Matriz 2D de Co-ocorrência */}
      {activeMatrix ? (
        <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="section-eyebrow">
                Matriz 2D · {activeMatrix.axisALabel} × {activeMatrix.axisBLabel} (
                {activeMatrix.scope === 'all' ? 'Global' : activeMatrix.scope} · N=
                {activeMatrix.totalPrompts.toLocaleString('pt-BR')})
              </span>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Pergunta respondida: quais cruzamentos entre ingredientes frequentes ainda têm{' '}
                <span className="font-mono text-zinc-300">0</span> ocorrências?
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-[#e5a93c]/70 bg-[#e5a93c]/10" />
                Gap (O=0, plausível)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-white/10 bg-white/[0.09]" />
                Saturado
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] table-fixed border-separate border-spacing-1 text-left">
              <thead>
                <tr>
                  <th className="w-[152px] px-1.5 py-1 font-mono text-[10px] font-normal text-zinc-500">
                    {activeMatrix.axisALabel} \ {activeMatrix.axisBLabel}
                  </th>
                  {activeMatrix.cols.map((col) => (
                    <th
                      key={col}
                      className="px-1.5 py-1 font-mono text-[10px] font-normal text-zinc-400"
                      title={`${formatTagPt(col)} (${col})`}
                    >
                      <div className="truncate">{formatTagPt(col)}</div>
                      <div className="text-[9px] text-zinc-600">
                        ({activeMatrix.colTotals[col] || 0})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeMatrix.rows.map((row) => (
                  <tr key={row}>
                    <td className="whitespace-nowrap px-1.5 py-1 font-mono text-[10px] text-zinc-300">
                      {formatTagPt(row)}{' '}
                      <span className="text-zinc-600">({activeMatrix.rowTotals[row] || 0})</span>
                    </td>
                    {activeMatrix.cols.map((col) => {
                      const cell = activeMatrix.cells.find((c) => c.row === row && c.col === col)
                      if (!cell) return <td key={col} />
                      const maxObs = Math.max(1, ...activeMatrix.cells.map((c) => c.observed))
                      const intensity =
                        cell.observed > 0 ? Math.min(0.24, 0.03 + (cell.observed / maxObs) * 0.21) : 0
                      const matchingGapId =
                        activeMatrix.scope !== 'all'
                          ? `pgap:${activeMatrix.scope}:${activeMatrix.axisA}:${row}:${activeMatrix.axisB}:${col}`
                          : `g2d:${activeMatrix.axisA}:${row}:${activeMatrix.axisB}:${col}`

                      return (
                        <td key={col}>
                          <button
                            type="button"
                            onClick={() => {
                              if (cell.isGap || cell.lift < 0.4) {
                                setSelectedGapId(matchingGapId)
                              }
                            }}
                            style={
                              cell.observed > 0
                                ? { backgroundColor: `rgba(244, 244, 246, ${intensity})` }
                                : undefined
                            }
                            className={[
                              'flex w-full flex-col items-start rounded-lg px-1.5 py-1 font-mono text-[10px] transition-colors',
                              cell.isGap
                                ? 'border border-dashed border-[#e5a93c]/60 bg-[#e5a93c]/[0.06] text-[#e5a93c] cursor-pointer hover:border-[#e5a93c]'
                                : cell.observed === 0
                                  ? 'border border-white/[0.04] bg-[#09090b] text-zinc-700'
                                  : 'border border-white/[0.06] text-zinc-200',
                            ].join(' ')}
                            title={`O=${cell.observed} | E=${cell.expected} | Lift=${cell.lift}`}
                          >
                            <span>{cell.isGap ? 'O=0' : cell.observed}</span>
                            <span className="text-[9px] opacity-65">E={cell.expected}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Lista Ranqueada + Laboratório de Síntese Gap-to-Prompt */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 lg:col-span-5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'project_2d_zero', label: 'Por Projeto (O = 0)', count: gapsData.projectGaps.length },
                { id: 'global_3d_zero', label: 'Tríades Globais (O = 0)', count: gapsData.globalTriadGaps.length },
                { id: 'global_2d_low_lift', label: 'Subexplorados (Lift < 0.36)', count: gapsData.globalUnderexplored.length },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setListMode(m.id)
                  setSelectedGapId(null)
                }}
                className={[
                  'rounded-xl border px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                  listMode === m.id
                    ? 'border-white/25 bg-[#17171d] font-medium text-zinc-100'
                    : 'border-white/[0.06] bg-[#0b0b0e] text-zinc-400 hover:border-white/[0.15]',
                ].join(' ')}
              >
                {m.label} <span className="tabular-mono text-zinc-500">({m.count})</span>
              </button>
            ))}
          </div>

          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {rankedGaps.map((g) => {
              const isSel = selectedGap?.id === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGapId(g.id)}
                  className={[
                    'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                    isSel
                      ? 'border-[#e5a93c]/60 bg-[#15151a]'
                      : 'border-white/[0.07] bg-[#0b0b0e] hover:border-white/[0.16]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-zinc-100">{g.title}</span>
                    <span className="tabular-mono shrink-0 text-[10px] text-[#e5a93c]">
                      O={g.observedCount} · E={g.expectedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                    <span>{g.scope}</span>
                    <span>
                      {g.freqA}× · {g.freqB}×{g.freqC ? ` · ${g.freqC}×` : ''}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Laboratório de Síntese & Doadores */}
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5 lg:col-span-7">
          {!selectedGap ? (
            <div className="flex h-64 items-center justify-center text-[13px] text-zinc-500">
              Selecione um Gap na lista ou na matriz.
            </div>
          ) : (
            <>
              <div className="border-b border-white/[0.07] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow">Gap Selecionado · {selectedGap.scope}</span>
                  <span className="tabular-mono rounded-full border border-[#e5a93c]/50 px-2 py-0.5 text-[10px] text-[#e5a93c]">
                    O={selectedGap.observedCount} · E={selectedGap.expectedCount}
                  </span>
                </div>
                <h2 className="mt-1.5 text-[15px] font-medium text-zinc-100">{selectedGap.title}</h2>
                <p className="mt-1 text-[12px] text-zinc-400">{selectedGap.rationale}</p>
              </div>

              {/* Ingredientes alvo */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                  <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisA)}</div>
                  <div className="mt-1 text-[12px] font-medium text-zinc-200">
                    {formatTagPt(selectedGap.tagA)}
                  </div>
                  <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                    {selectedGap.freqA} ocorrências
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                  <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisB)}</div>
                  <div className="mt-1 text-[12px] font-medium text-zinc-200">
                    {formatTagPt(selectedGap.tagB)}
                  </div>
                  <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                    {selectedGap.freqB} ocorrências
                  </div>
                </div>
                {selectedGap.axisC && selectedGap.tagC ? (
                  <div className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5">
                    <div className="section-eyebrow">{AXIS_NAME_PT(selectedGap.axisC)}</div>
                    <div className="mt-1 text-[12px] font-medium text-zinc-200">
                      {formatTagPt(selectedGap.tagC)}
                    </div>
                    <div className="tabular-mono mt-0.5 text-[10px] text-zinc-500">
                      {selectedGap.freqC} ocorrências
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Ponte Criativa: Doador A + Doador B com Troca no SQLite */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">
                    Ponte Criativa · Doadores Reais no Acervo (22k)
                  </span>
                  {loadingDonors ? (
                    <span className="tabular-mono text-[10px] text-zinc-500">
                      Consultando SQLite FTS5...
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {[
                    {
                      role: 'Doador A',
                      tagLabel: formatTagPt(selectedGap.tagA),
                      item: donorA,
                      idx: donorAIdx,
                      total: donorsListA.length,
                      onCycle: () => {
                        setDonorAIdx((i) => i + 1)
                        setManuallyEdited(false)
                      },
                    },
                    {
                      role: 'Doador B',
                      tagLabel: formatTagPt(selectedGap.tagB),
                      item: donorB,
                      idx: donorBIdx,
                      total: donorsListB.length,
                      onCycle: () => {
                        setDonorBIdx((i) => i + 1)
                        setManuallyEdited(false)
                      },
                    },
                  ].map(({ role, tagLabel, item, idx, total, onCycle }) => (
                    <div
                      key={role}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        {item?.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="h-14 w-12 shrink-0 rounded-lg border border-white/[0.06] object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-[#121217] font-mono text-[9px] text-zinc-600">
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                              {role} · {tagLabel}
                            </span>
                            {total > 0 ? (
                              <span className="tabular-mono text-[9px] text-zinc-500">
                                {(idx % total) + 1}/{total}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] font-medium text-zinc-200">
                            {item ? item.title : 'Sem doador disponível'}
                          </div>
                          {item ? (
                            <div className="tabular-mono truncate text-[10px] text-zinc-500">
                              {item.project} · TIER {item.rarity.tier} · MAT {Math.round(item.maturity.score)}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2">
                        <button
                          type="button"
                          disabled={!item}
                          onClick={() => item && onInspectItem(item)}
                          className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>Ver 8 atributos</span>
                        </button>

                        <button
                          type="button"
                          disabled={total <= 1}
                          onClick={onCycle}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#131318] px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:border-white/25 disabled:opacity-35 cursor-pointer"
                          title="Alternar para outro prompt real que contém este ingrediente"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          <span>Trocar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sintetizador Gap-to-Prompt + Telemetria Ao Vivo */}
              <div className="space-y-3 border-t border-white/[0.07] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="section-eyebrow">Síntese Assistida (Gap-to-Prompt)</span>
                    <p className="text-[11px] text-zinc-500">
                      Monta os 8 atributos cruzando os doadores reais e injeta a combinação O = 0.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {FORMAT_TABS.map((fmt) => {
                      const active = synthFormat === fmt.id
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => {
                            setSynthFormat(fmt.id)
                            setManuallyEdited(false)
                          }}
                          className={[
                            'rounded-xl border px-2.5 py-1 font-mono text-[10px] transition-colors cursor-pointer',
                            active
                              ? 'border-white/25 bg-[#191921] text-zinc-100'
                              : 'border-white/[0.07] bg-[#0b0b0e] text-zinc-400 hover:border-white/[0.18]',
                          ].join(' ')}
                        >
                          {fmt.label}
                        </button>
                      )
                    })}

                    <select
                      value={aspectRatio}
                      onChange={(e) => {
                        setAspectRatio(e.target.value)
                        setManuallyEdited(false)
                      }}
                      className="rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2 py-1 font-mono text-[10px] text-zinc-300 focus:outline-none"
                      aria-label="Proporção"
                    >
                      {ASPECT_OPTIONS.map((ar) => (
                        <option key={ar} value={ar}>
                          AR {ar}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-2 py-1 font-mono text-[10px] text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNegative}
                        onChange={(e) => {
                          setIncludeNegative(e.target.checked)
                          setManuallyEdited(false)
                        }}
                        className="accent-zinc-300"
                      />
                      <span>Negativo</span>
                    </label>
                  </div>
                </div>

                {/* Matriz de origem dos 6 atributos principais */}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CORE_ATTR_SLOTS.map((slot) => {
                    const isGapAxis = targetSlotsMap.has(slot.key)
                    const currentSource = attributeSources[slot.key]
                    return (
                      <div
                        key={slot.key}
                        className={[
                          'flex flex-col gap-1.5 rounded-xl border p-2',
                          isGapAxis
                            ? 'border-dashed border-[#e5a93c]/45 bg-[#e5a93c]/[0.04]'
                            : 'border-white/[0.06] bg-[#0b0b0e]',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-medium text-zinc-300">
                            {slot.short} · {slot.label}
                          </span>
                          {isGapAxis ? (
                            <span className="font-mono text-[9px] text-[#e5a93c]">ALVO</span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'donor_a', label: 'A' },
                              { id: 'gap_target', label: 'Gap' },
                              { id: 'donor_b', label: 'B' },
                            ] as const
                          ).map((opt) => {
                            const active = currentSource === opt.id
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setAttributeSources((prev) => ({ ...prev, [slot.key]: opt.id }))
                                  setManuallyEdited(false)
                                }}
                                className={[
                                  'rounded-md border py-0.5 font-mono text-[9px] transition-colors cursor-pointer',
                                  active
                                    ? 'border-white/25 bg-[#1b1b22] text-zinc-100'
                                    : 'border-white/[0.05] bg-[#09090b] text-zinc-500 hover:text-zinc-300',
                                ].join(' ')}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Editor editável do Prompt Sintetizado */}
                <div className="relative">
                  <textarea
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value)
                      setManuallyEdited(true)
                    }}
                    rows={synthFormat === 'json' ? 12 : 9}
                    spellCheck={false}
                    aria-label="Prompt sintetizado do Gap"
                    className="w-full rounded-2xl border border-white/[0.08] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-200 focus:border-white/25 focus:outline-none"
                  />
                  {manuallyEdited ? (
                    <span className="pointer-events-none absolute top-2.5 right-3 rounded-md border border-white/10 bg-[#141418] px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                      editado manualmente
                    </span>
                  ) : null}
                </div>

                {/* Barra de telemetria ao vivo (/api/decompose-preview) */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#0b0b0e] px-3 py-2 font-mono text-[11px]">
                  {preview ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            preview.rarity.tier === 'S'
                              ? 'border-[#e5a93c]/60 bg-[#e5a93c]/10 text-[#e5a93c]'
                              : 'border-white/15 bg-white/[0.04] text-zinc-200',
                          ].join(' ')}
                        >
                          TIER {preview.rarity.tier}
                        </span>
                        <span
                          className={
                            preview.rarity.tier === 'S' ? 'text-[#e5a93c]' : 'text-zinc-200'
                          }
                        >
                          {preview.rarity.label}
                        </span>
                        <span className="text-zinc-500">·</span>
                        <span className="text-zinc-300">MAT {Math.round(preview.maturity.score)}</span>
                        <span className="text-zinc-500">
                          ({QUADRANT_META[preview.quadrant].label})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-zinc-400">
                          {preview.attributes.estrutura.filledAttributesCount}/8 atr.
                        </span>
                        <span className="text-zinc-400">
                          {preview.attributes.estrutura.tokenCount} tok
                        </span>
                        <span
                          className={
                            preview.exactGapOccurrences === 0
                              ? 'text-[#e5a93c]'
                              : 'text-zinc-400'
                          }
                          title={
                            preview.exactGapOccurrences === 0 && (preview.secondaryFtsOccurrences ?? 0) > 0
                              ? `0 ocorrências como eixo primário (${preview.secondaryFtsOccurrences} menções secundárias no FTS5)`
                              : undefined
                          }
                        >
                          {preview.exactGapOccurrences === 0
                            ? 'O = 0 confirmado'
                            : `O = ${preview.exactGapOccurrences} no escopo`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-zinc-500">
                      {previewLoading
                        ? 'Calculando percentil e decomposição em 8 atributos...'
                        : 'Aguardando prompt para simulação.'}
                    </span>
                  )}
                </div>

                {/* Botões de ação */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRegenerateBase}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/25 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Regenerar base</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyText(draftText, 'gap-synth')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#15151a] px-3 py-1.5 text-[11px] text-zinc-100 hover:border-white/25 cursor-pointer"
                    >
                      {copiedKey === 'gap-synth' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedKey === 'gap-synth' ? 'Copiado' : 'Copiar prompt'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportSingle('md')}
                      className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1.5 font-mono text-[10px] text-zinc-300 hover:border-white/25 cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      <span>.MD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingle('json')}
                      className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1.5 font-mono text-[10px] text-zinc-300 hover:border-white/25 cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      <span>.JSON</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingDraft || !draftText.trim()}
                      onClick={() => void handleSaveDraft()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5a93c]/50 bg-[#e5a93c]/10 px-3 py-1.5 text-[11px] font-medium text-[#e5a93c] hover:border-[#e5a93c] disabled:opacity-50 cursor-pointer"
                    >
                      {justSaved ? (
                        <BookmarkCheck className="h-3.5 w-3.5" />
                      ) : (
                        <BookmarkPlus className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {savingDraft
                          ? 'Salvando...'
                          : justSaved
                            ? 'Salvo no Caderno'
                            : 'Salvar no Caderno'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Caderno Local de Exploração de Gaps (data/gap_drafts.json) */}
      <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <span className="section-eyebrow">
              Caderno Local de Gaps ({savedDrafts.length})
            </span>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Rascunhos salvos localmente em{' '}
              <span className="font-mono text-zinc-300">data/gap_drafts.json</span> — bibliotecas originais seguem em modo Read-Only.
            </p>
          </div>

          {savedDrafts.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                triggerFileDownload(
                  'caderno_gaps_prompt_engine.json',
                  JSON.stringify(savedDrafts, null, 2),
                  'application/json'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#0b0b0e] px-3 py-1.5 font-mono text-[11px] text-zinc-300 hover:border-white/25 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar Caderno (.JSON)</span>
            </button>
          ) : null}
        </div>

        {savedDrafts.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] text-zinc-500">
            Nenhum rascunho salvo ainda. Sintetize um Gap acima e clique em “Salvar no Caderno”.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedDrafts.map((d) => (
              <article
                key={d.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-3.5"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-zinc-100">
                        {d.gapTitle}
                      </div>
                      <div className="tabular-mono text-[10px] text-zinc-500">
                        {d.scope} · {d.macroFormat.toUpperCase()} · {d.aspectRatio}
                      </div>
                    </div>
                    <span
                      className={[
                        'tabular-mono shrink-0 rounded-full border px-2 py-0.5 text-[10px]',
                        d.rarityTier === 'S'
                          ? 'border-[#e5a93c]/60 text-[#e5a93c]'
                          : 'border-white/10 text-zinc-300',
                      ].join(' ')}
                    >
                      TIER {d.rarityTier}
                    </span>
                  </div>

                  <p className="line-clamp-3 rounded-lg border border-white/[0.05] bg-[#09090b] p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
                    {d.rawPrompt}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2 font-mono text-[10px]">
                  <span className={d.rarityTier === 'S' ? 'text-[#e5a93c]' : 'text-zinc-400'}>
                    P{d.rarityPercentile} · MAT {Math.round(d.maturityScore)} · {d.filledAttributesCount}/8
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleLoadSavedDraft(d)}
                      className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-200 hover:border-white/25 cursor-pointer"
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(d.rawPrompt, `draft:${d.id}`)}
                      className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-300 hover:border-white/25 cursor-pointer"
                      aria-label="Copiar rascunho"
                    >
                      {copiedKey === `draft:${d.id}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDraft(d.id)}
                      className="rounded-lg border border-white/[0.08] bg-[#141418] px-2 py-1 text-zinc-500 hover:border-white/25 hover:text-zinc-200 cursor-pointer"
                      aria-label="Remover rascunho"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AXIS_NAME_PT(axis: string): string {
  const map: Record<string, string> = {
    environment: 'Cenário',
    lighting: 'Luz',
    pose: 'Sujeito / Pose',
    angle: 'Câmera',
    fabric: 'Textura',
    wardrobe: 'Figurino',
  }
  return map[axis] || axis
}
