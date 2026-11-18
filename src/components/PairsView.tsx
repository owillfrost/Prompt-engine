import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Eye, EyeOff, Maximize2 } from 'lucide-react'
import { computeTwoLayerSimilarity, diffPrompts } from '../core/promptDiff'
import {
  ATTRIBUTE_META,
  type PairCategory,
  type PairsPayload,
  type PromptDetailResponse,
  type PromptDiffSpan,
  type PromptItem,
  type PromptPairRecord,
} from '../types/promptEngine'

interface PairsViewProps {
  items: PromptItem[]
  pairsData: PairsPayload
  customPairIds: [string, string] | null
  onClearCustomPair: () => void
  onInspectItem: (item: PromptItem) => void
}

function collapseSharedSpans(spans: PromptDiffSpan[]): Array<{ text: string; type: 'shared' | 'unique' | 'collapsed' }> {
  const out: Array<{ text: string; type: 'shared' | 'unique' | 'collapsed' }> = []
  let sharedRun: PromptDiffSpan[] = []

  const flushShared = () => {
    if (sharedRun.length === 0) return
    const wordCount = sharedRun.filter((s) => /\w/.test(s.text)).length
    if (wordCount >= 4) {
      out.push({ text: ` [··· ${wordCount} termos iguais ···] `, type: 'collapsed' })
    } else {
      for (const s of sharedRun) out.push(s)
    }
    sharedRun = []
  }

  for (const sp of spans) {
    // Pontuação/espaços entre termos compartilhados continuam no run compartilhado
    if (sp.type === 'shared' || (sharedRun.length > 0 && /^[\s,;:.]+$/.test(sp.text))) {
      sharedRun.push(sp)
    } else {
      flushShared()
      out.push(sp)
    }
  }
  flushShared()
  return out
}

export const PairsView: React.FC<PairsViewProps> = ({
  items,
  pairsData,
  customPairIds,
  onClearCustomPair,
  onInspectItem,
}) => {
  const [category, setCategory] = useState<PairCategory>('same_skeleton_diff_subject')
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)
  const [hydratedExtras, setHydratedExtras] = useState<Record<string, PromptItem>>({})
  const [loadingCustomPair, setLoadingCustomPair] = useState(false)

  const baseItemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const itemMap = useMemo(() => {
    const merged = new Map(baseItemMap)
    for (const [id, extra] of Object.entries(hydratedExtras)) {
      if (!merged.has(id)) merged.set(id, extra)
    }
    return merged
  }, [baseItemMap, hydratedExtras])

  useEffect(() => {
    if (!customPairIds) {
      setLoadingCustomPair(false)
      return
    }
    const missing = customPairIds.filter((id) => !baseItemMap.has(id) && !hydratedExtras[id])
    if (missing.length === 0) {
      setLoadingCustomPair(false)
      return
    }

    let cancelled = false
    setLoadingCustomPair(true)
    Promise.all(
      missing.map(async (id) => {
        const res = await fetch(`/api/prompt/${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = (await res.json()) as PromptDetailResponse
        return payload.item
      })
    )
      .then((fetched) => {
        if (cancelled) return
        setHydratedExtras((prev) => {
          const next = { ...prev }
          for (const it of fetched) {
            next[it.id] = it
          }
          return next
        })
        setLoadingCustomPair(false)
      })
      .catch(() => {
        if (!cancelled) setLoadingCustomPair(false)
      })

    return () => {
      cancelled = true
    }
  }, [customPairIds, baseItemMap, hydratedExtras])

  const activeList: PromptPairRecord[] = useMemo(() => {
    if (category === 'same_skeleton_diff_subject') return pairsData.sameSkeletonDiffSubject
    if (category === 'same_subject_diff_skeleton') return pairsData.sameSubjectDiffSkeleton
    return pairsData.nearDuplicates
  }, [category, pairsData])

  const customPairRecord: PromptPairRecord | null = useMemo(() => {
    if (!customPairIds) return null
    const a = itemMap.get(customPairIds[0])
    const b = itemMap.get(customPairIds[1])
    if (!a || !b) return null
    const sim = computeTwoLayerSimilarity(a, b)
    const changed = ATTRIBUTE_META.map((m) => m.key).filter(
      (k) => a.attributes[k].text.trim().toLowerCase() !== b.attributes[k].text.trim().toLowerCase()
    )
    return {
      id: `custom:${a.id}:${b.id}`,
      idA: a.id,
      idB: b.id,
      category: sim.category === 'distinct' ? 'same_skeleton_diff_subject' : sim.category,
      semanticSim: sim.semanticSim,
      structuralSim: sim.structuralSim,
      divergenceScore: sim.divergenceScore,
      changedAttributes: changed,
      sharedAttributeCount: 8 - changed.length,
      reason: 'Par selecionado diretamente no Mapa.',
    }
  }, [customPairIds, itemMap])

  const currentPair = useMemo(() => {
    if (customPairRecord) return customPairRecord
    if (selectedPairId) {
      const found = activeList.find((p) => p.id === selectedPairId)
      if (found) return found
    }
    return activeList[0] || null
  }, [customPairRecord, selectedPairId, activeList])

  const itemA = currentPair ? itemMap.get(currentPair.idA) || null : null
  const itemB = currentPair ? itemMap.get(currentPair.idB) || null : null

  const cleanDiff = useMemo(() => {
    if (!itemA || !itemB) return null
    return diffPrompts(itemA.cleanPrompt, itemB.cleanPrompt)
  }, [itemA, itemB])

  const visibleAttributes = useMemo(() => {
    if (!itemA || !itemB) return []
    return ATTRIBUTE_META.filter((meta) => {
      if (!onlyChanges) return true
      const ta = itemA.attributes[meta.key].text.trim().toLowerCase()
      const tb = itemB.attributes[meta.key].text.trim().toLowerCase()
      return ta !== tb
    })
  }, [itemA, itemB, onlyChanges])

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <span className="section-eyebrow">Similaridade em Duas Camadas · Semântica × Estrutural</span>
          <h1 className="mt-1 text-xl font-medium tracking-tight text-zinc-100">
            Detector de Pares, Divergências & Quase Duplicados
          </h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Compara o que o prompt diz (embeddings) contra como ele é montado (esqueleto/formato), destacando pares contrastantes e mostrando só o que mudou.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOnlyChanges((v) => !v)}
          className={[
            'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition-colors cursor-pointer',
            onlyChanges
              ? 'border-white/25 bg-[#16161c] text-zinc-100'
              : 'border-white/[0.08] bg-[#101013] text-zinc-400 hover:text-zinc-200',
          ].join(' ')}
        >
          {onlyChanges ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span>{onlyChanges ? 'Mostrando só o que mudou' : 'Mostrando prompt completo'}</span>
        </button>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Coluna Esquerda: Categorias + Lista de Pares */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 lg:col-span-4 xl:col-span-4 lg:max-h-[calc(100dvh-160px)]">
          <div className="grid grid-cols-1 gap-1.5">
            {(
              [
                {
                  id: 'same_skeleton_diff_subject',
                  label: 'Mesmo Esqueleto · Assunto ≠',
                  desc: 'Alta estrutural + baixa semântica',
                  count: pairsData.sameSkeletonDiffSubject.length,
                },
                {
                  id: 'same_subject_diff_skeleton',
                  label: 'Mesmo Assunto · Esqueleto ≠',
                  desc: 'Alta semântica + baixa estrutural',
                  count: pairsData.sameSubjectDiffSkeleton.length,
                },
                {
                  id: 'near_duplicate',
                  label: 'Quase Duplicados',
                  desc: 'Alta semântica + alta estrutural',
                  count: pairsData.nearDuplicates.length,
                },
              ] as const
            ).map((tab) => {
              const active = !customPairRecord && category === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onClearCustomPair()
                    setCategory(tab.id)
                    setSelectedPairId(null)
                  }}
                  className={[
                    'flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer',
                    active
                      ? 'border-white/25 bg-[#16161c] text-zinc-100'
                      : 'border-white/[0.06] bg-[#0b0b0e] text-zinc-400 hover:border-white/[0.15]',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium">{tab.label}</div>
                    <div className="text-[10px] text-zinc-500">{tab.desc}</div>
                  </div>
                  <span className="tabular-mono rounded-lg border border-white/[0.08] px-2 py-0.5 text-[11px] text-zinc-300">
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1 pt-1">
            {activeList.map((pair) => {
              const a = itemMap.get(pair.idA)
              const b = itemMap.get(pair.idB)
              if (!a || !b) return null
              const isSel = currentPair?.id === pair.id
              return (
                <button
                  key={pair.id}
                  type="button"
                  onClick={() => {
                    onClearCustomPair()
                    setSelectedPairId(pair.id)
                  }}
                  className={[
                    'flex w-full flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors cursor-pointer',
                    isSel
                      ? 'border-white/30 bg-[#15151b]'
                      : 'border-white/[0.06] bg-[#0b0b0e] hover:border-white/[0.16]',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    {a.thumbnailUrl ? (
                      <img
                        src={a.thumbnailUrl}
                        alt={a.title}
                        loading="lazy"
                        className="h-12 w-10 shrink-0 rounded-lg border border-white/[0.08] object-cover"
                      />
                    ) : null}
                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                    {b.thumbnailUrl ? (
                      <img
                        src={b.thumbnailUrl}
                        alt={b.title}
                        loading="lazy"
                        className="h-12 w-10 shrink-0 rounded-lg border border-white/[0.08] object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-zinc-200">
                        {a.project} ↔ {b.project}
                      </div>
                      <div className="tabular-mono mt-0.5 text-[10px] text-zinc-400">
                        SEM {Math.round(pair.semanticSim * 100)}% · EST {Math.round(pair.structuralSim * 100)}%
                      </div>
                      <div className="tabular-mono text-[9px] text-zinc-500">
                        Δ {Math.round(pair.divergenceScore * 100)}% · {pair.changedAttributes.length}/8 atributos alterados
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Coluna Direita: Dois Prompts Lado a Lado com Diff */}
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5 lg:col-span-8">
          {!currentPair || !itemA || !itemB ? (
            <div className="flex h-64 items-center justify-center text-[13px] text-zinc-500">
              {loadingCustomPair
                ? 'Hidratando prompts do par via SQLite...'
                : 'Nenhum par disponível nesta categoria.'}
            </div>
          ) : (
            <>
              {/* Cabeçalho do par com métricas */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
                <div>
                  <span className="section-eyebrow">Comparação Direta</span>
                  <p className="mt-1 text-[12px] text-zinc-300">{currentPair.reason}</p>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1 text-zinc-300">
                    SEM {Math.round(currentPair.semanticSim * 100)}%
                  </span>
                  <span className="rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1 text-zinc-300">
                    EST {Math.round(currentPair.structuralSim * 100)}%
                  </span>
                  <span className="rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-2.5 py-1 text-zinc-400">
                    Δ {Math.round(currentPair.divergenceScore * 100)}%
                  </span>
                </div>
              </div>

              {/* Cards lado a lado A vs B */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'PROMPT A', item: itemA },
                  { label: 'PROMPT B', item: itemB },
                ].map(({ label, item }) => (
                  <div
                    key={`${label}:${item.id}`}
                    className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-[#0b0b0e] p-3"
                  >
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="h-24 w-20 shrink-0 rounded-xl border border-white/[0.08] object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="section-eyebrow">{label}</span>
                        <span
                          className={[
                            'tabular-mono rounded-full border px-2 py-0.5 text-[10px]',
                            item.rarity.tier === 'S'
                              ? 'border-[#e5a93c]/60 text-[#e5a93c]'
                              : 'border-white/10 text-zinc-300',
                          ].join(' ')}
                        >
                          TIER {item.rarity.tier}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate text-[13px] font-medium text-zinc-100">
                        {item.title}
                      </h3>
                      <p className="truncate text-[11px] text-zinc-500">
                        {item.project} · {item.attributes.estrutura.macroFormat.toUpperCase()} (
                        {item.attributes.estrutura.kernelDialect})
                      </p>
                      <p className="tabular-mono mt-1 text-[10px] text-zinc-400">
                        {item.rarity.label}
                      </p>
                      <button
                        type="button"
                        onClick={() => onInspectItem(item)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" />
                        <span>Abrir 8 atributos</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Diff estruturado atributo a atributo (só o que mudou) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">
                    Diff por Atributos ({visibleAttributes.length}/8 exibidos)
                  </span>
                  <span className="tabular-mono text-[10px] text-zinc-500">
                    {onlyChanges ? 'Atributos idênticos ocultos' : 'Todos os 8 atributos'}
                  </span>
                </div>

                {visibleAttributes.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-4 font-mono text-[11px] text-zinc-500">
                    Os 8 atributos extraídos são idênticos entre A e B; veja o diff lexical abaixo.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleAttributes.map((meta) => {
                      const txtA = itemA.attributes[meta.key].text || '—'
                      const txtB = itemB.attributes[meta.key].text || '—'
                      const attrDiff = diffPrompts(txtA, txtB)
                      const spansA = onlyChanges ? collapseSharedSpans(attrDiff.spansA) : attrDiff.spansA
                      const spansB = onlyChanges ? collapseSharedSpans(attrDiff.spansB) : attrDiff.spansB

                      return (
                        <div
                          key={meta.key}
                          className="rounded-xl border border-white/[0.07] bg-[#0b0b0e] p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="tabular-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                              {meta.shortLabel} · {meta.label}
                            </span>
                            <span className="tabular-mono text-[10px] text-zinc-600">
                              {Math.round(attrDiff.similarityRatio * 100)}% em comum
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                            {[spansA, spansB].map((spans, idx) => (
                              <p
                                key={idx}
                                className="rounded-lg border border-white/[0.05] bg-[#09090b] p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300"
                              >
                                {spans.map((sp, i) => {
                                  if (sp.type === 'unique') {
                                    return (
                                      <span
                                        key={i}
                                        className="rounded bg-white/[0.12] px-0.5 text-zinc-50"
                                      >
                                        {sp.text}
                                      </span>
                                    )
                                  }
                                  if (sp.type === 'collapsed') {
                                    return (
                                      <span key={i} className="text-zinc-600">
                                        {sp.text}
                                      </span>
                                    )
                                  }
                                  return (
                                    <span key={i} className="text-zinc-500">
                                      {sp.text}
                                    </span>
                                  )
                                })}
                              </p>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Diff lexical completo / colapsado lado a lado */}
              {cleanDiff ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="section-eyebrow">
                      Diff Textual Lado a Lado ({onlyChanges ? 'só o que mudou' : 'completo'})
                    </span>
                    <span className="tabular-mono text-[10px] text-zinc-500">
                      {cleanDiff.sharedTerms.length} termos compartilhados
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      onlyChanges ? collapseSharedSpans(cleanDiff.spansA) : cleanDiff.spansA,
                      onlyChanges ? collapseSharedSpans(cleanDiff.spansB) : cleanDiff.spansB,
                    ].map((spans, sideIdx) => (
                      <div
                        key={sideIdx}
                        className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.07] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed"
                      >
                        {spans.map((sp, i) => {
                          if (sp.type === 'unique') {
                            return (
                              <span
                                key={i}
                                className="rounded bg-white/[0.12] px-0.5 text-zinc-100"
                              >
                                {sp.text}
                              </span>
                            )
                          }
                          if (sp.type === 'collapsed') {
                            return (
                              <span key={i} className="text-zinc-600">
                                {sp.text}
                              </span>
                            )
                          }
                          return (
                            <span key={i} className="text-zinc-500">
                              {sp.text}
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
