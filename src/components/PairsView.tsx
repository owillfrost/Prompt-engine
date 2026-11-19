import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Eye, EyeOff, Maximize2, Sparkles } from 'lucide-react'
import { computeTwoLayerSimilarity, diffPrompts, type PromptDiffResult } from '../core/promptDiff'
import { TIER_COLOR_META } from '../core/rarityEngine'
import { PromptThumb } from './PromptThumb'
import {
  ATTRIBUTE_META,
  type AttributeKey,
  type AttributeSlot,
  type AttributeTagStat,
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

interface AttributeDiffRow {
  meta: (typeof ATTRIBUTE_META)[number]
  slotA: AttributeSlot
  slotB: AttributeSlot
  txtA: string
  txtB: string
  changed: boolean
  attrDiff: PromptDiffResult
}

interface RarityDriverResult {
  key: AttributeKey
  label: string
  shortLabel: string
  rarerSide: 'A' | 'B'
  delta: number
  isEstimated: boolean
}

function scoreTagStats(stats: readonly AttributeTagStat[]): number {
  let maxIdf = 0
  let sumIdf = 0
  for (const ts of stats) {
    if (ts.idfWeight > maxIdf) maxIdf = ts.idfWeight
    sumIdf += ts.idfWeight
  }
  return maxIdf + (sumIdf - maxIdf) * 0.25
}

function computeSlotRarityScore(
  slot: AttributeSlot,
  axisKey: AttributeKey,
  item: PromptItem
): { score: number; hasIdfData: boolean } {
  if (slot.tagStats && slot.tagStats.length > 0) {
    return {
      score: scoreTagStats(slot.tagStats),
      hasIdfData: true,
    }
  }

  const rarestTags = item.rarity.rarestTags || []
  if (rarestTags.length > 0) {
    const slotTagSet = new Set((slot.tags || []).map((t) => t.toLowerCase()))
    const matched = rarestTags.filter(
      (rt) => rt.axis === axisKey || slotTagSet.has(rt.tag.toLowerCase())
    )
    if (matched.length > 0) {
      return {
        score: scoreTagStats(matched),
        hasIdfData: true,
      }
    }
  }

  return { score: 0, hasIdfData: false }
}

function computeTopRarityDriver(
  itemA: PromptItem,
  itemB: PromptItem,
  changedRows: AttributeDiffRow[]
): RarityDriverResult | null {
  if (changedRows.length === 0) return null

  let best: RarityDriverResult | null = null

  for (const row of changedRows) {
    const idfA = computeSlotRarityScore(row.slotA, row.meta.key, itemA)
    const idfB = computeSlotRarityScore(row.slotB, row.meta.key, itemB)
    const lexicalDivergence = Math.max(0.05, 1 - row.attrDiff.similarityRatio)

    let delta = 0
    let rarerSide: 'A' | 'B' = 'A'
    let isEstimated = false

    if (idfA.hasIdfData || idfB.hasIdfData) {
      delta = Math.abs(idfA.score - idfB.score)
      rarerSide = idfA.score >= idfB.score ? 'A' : 'B'
    } else {
      isEstimated = true
      const estA = row.slotA.filled
        ? (itemA.rarity.percentile / 100) * (0.4 + 0.6 * lexicalDivergence)
        : 0
      const estB = row.slotB.filled
        ? (itemB.rarity.percentile / 100) * (0.4 + 0.6 * lexicalDivergence)
        : 0
      delta = Math.abs(estA - estB)
      rarerSide = estA >= estB ? 'A' : 'B'
    }

    if (!best || delta > best.delta) {
      best = {
        key: row.meta.key,
        label: row.meta.label,
        shortLabel: row.meta.shortLabel,
        rarerSide,
        delta,
        isEstimated,
      }
    }
  }

  // Fallback quando os slots alterados empatam com delta 0 (ex.: mesmas tags ou mesmo percentil)
  if (best && best.delta === 0) {
    let fallbackRow = changedRows[0]
    let maxDiv = -1
    for (const row of changedRows) {
      const div = 1 - row.attrDiff.similarityRatio + (row.slotA.filled !== row.slotB.filled ? 0.25 : 0)
      if (div > maxDiv) {
        maxDiv = div
        fallbackRow = row
      }
    }
    const lexicalDivergence = Math.max(0.05, 1 - fallbackRow.attrDiff.similarityRatio)
    const tieRarerSide: 'A' | 'B' =
      itemA.rarity.percentile !== itemB.rarity.percentile
        ? itemA.rarity.percentile > itemB.rarity.percentile
          ? 'A'
          : 'B'
        : itemA.rarity.score !== itemB.rarity.score
          ? itemA.rarity.score > itemB.rarity.score
            ? 'A'
            : 'B'
          : fallbackRow.slotA.filled !== fallbackRow.slotB.filled
            ? fallbackRow.slotA.filled
              ? 'A'
              : 'B'
            : fallbackRow.txtA.length >= fallbackRow.txtB.length
              ? 'A'
              : 'B'

    return {
      key: fallbackRow.meta.key,
      label: fallbackRow.meta.label,
      shortLabel: fallbackRow.meta.shortLabel,
      rarerSide: tieRarerSide,
      delta: Math.max(0.01, Number((lexicalDivergence * 0.25).toFixed(2))),
      isEstimated: true,
    }
  }

  return best
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
  const [highlightRarityDriver, setHighlightRarityDriver] = useState(true)
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

  const attributeDiffRows = useMemo<AttributeDiffRow[]>(() => {
    if (!itemA || !itemB) return []
    return ATTRIBUTE_META.map((meta) => {
      const slotA = itemA.attributes[meta.key]
      const slotB = itemB.attributes[meta.key]
      const txtA = slotA.text || '—'
      const txtB = slotB.text || '—'
      const changed = (slotA.text || '').trim().toLowerCase() !== (slotB.text || '').trim().toLowerCase()
      const attrDiff = diffPrompts(txtA, txtB)
      return { meta, slotA, slotB, txtA, txtB, changed, attrDiff }
    })
  }, [itemA, itemB])

  const visibleAttributes = useMemo(() => {
    return onlyChanges ? attributeDiffRows.filter((row) => row.changed) : attributeDiffRows
  }, [attributeDiffRows, onlyChanges])

  const topRarityDriver = useMemo(() => {
    if (!itemA || !itemB) return null
    return computeTopRarityDriver(
      itemA,
      itemB,
      attributeDiffRows.filter((row) => row.changed)
    )
  }, [itemA, itemB, attributeDiffRows])

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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-active={highlightRarityDriver}
            onClick={() => setHighlightRarityDriver((v) => !v)}
            className={[
              'btn-ghost text-[12px]',
              highlightRarityDriver ? 'border-[#e8b84b]/55 bg-[#e8b84b]/10 text-[#e8b84b]' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Destacar impacto na raridade</span>
          </button>

          <button
            type="button"
            data-active={onlyChanges}
            onClick={() => setOnlyChanges((v) => !v)}
            className="btn-secondary text-[12px]"
          >
            {onlyChanges ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{onlyChanges ? 'Filtrar só alterações' : 'Exibir prompt completo'}</span>
          </button>
        </div>
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
                      <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#121217]">
                        <PromptThumb src={a.thumbnailUrl} alt={a.title} fallbackLabel="·" />
                      </div>
                    ) : null}
                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                    {b.thumbnailUrl ? (
                      <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#121217]">
                        <PromptThumb src={b.thumbnailUrl} alt={b.title} fallbackLabel="·" />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-[11px] font-medium text-zinc-200">
                        <span className="truncate">{a.project}</span>
                        <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 text-zinc-500" />
                        <span className="truncate">{b.project}</span>
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
                <div className="min-w-0">
                  <span className="section-eyebrow">Comparação Direta</span>
                  <p className="mt-1 text-[12px] text-zinc-300">{currentPair.reason}</p>
                  {highlightRarityDriver && topRarityDriver ? (
                    <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e8b84b]/50 bg-[#e8b84b]/10 px-2.5 py-1 font-mono text-[10px] text-[#e8b84b]">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>Maior impacto na raridade: {topRarityDriver.label}</span>
                      <span className="text-[#f3d078]/85">
                        · Prompt {topRarityDriver.rarerSide} (+{topRarityDriver.delta.toFixed(2)})
                      </span>
                    </div>
                  ) : null}
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
                ].map(({ label, item }) => {
                  const tierMeta = TIER_COLOR_META[item.rarity.tier]
                  return (
                    <div
                      key={`${label}:${item.id}`}
                      className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-[#0b0b0e] p-3"
                    >
                      {item.thumbnailUrl ? (
                        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#121217]">
                          <PromptThumb src={item.thumbnailUrl} alt={item.title} fallbackLabel="Sem img" />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="section-eyebrow">{label}</span>
                          <span
                            className={[
                              'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              tierMeta.badgeClass,
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
                        <p className={['tabular-mono mt-1 text-[10px]', tierMeta.textClass].join(' ')}>
                          {item.rarity.label}
                        </p>
                        <button
                          type="button"
                          onClick={() => onInspectItem(item)}
                          className="btn-ghost mt-2 min-h-[28px] px-2 text-[11px]"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>Inspecionar atributos</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
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
                  <div key={`attr-diff-${currentPair.id}`} className="diff-span-enter space-y-2">
                    {visibleAttributes.map(({ meta, attrDiff }) => {
                      const spansA = onlyChanges ? collapseSharedSpans(attrDiff.spansA) : attrDiff.spansA
                      const spansB = onlyChanges ? collapseSharedSpans(attrDiff.spansB) : attrDiff.spansB
                      const isDriver = highlightRarityDriver && topRarityDriver?.key === meta.key

                      return (
                        <div
                          key={meta.key}
                          className={[
                            'rounded-xl border p-3 transition-colors',
                            isDriver
                              ? 'border-[#e8b84b]/65 bg-[#e8b84b]/[0.05]'
                              : 'border-white/[0.07] bg-[#0b0b0e]',
                          ].join(' ')}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  'tabular-mono text-[10px] font-medium uppercase tracking-wider',
                                  isDriver ? 'text-[#e8b84b]' : 'text-zinc-400',
                                ].join(' ')}
                              >
                                {meta.shortLabel} · {meta.label}
                              </span>
                              {isDriver && topRarityDriver ? (
                                <>
                                  <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/60 bg-[#e8b84b]/15 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#e8b84b]">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    MAIOR IMPACTO NA RARIDADE
                                  </span>
                                  <span className="tabular-mono rounded-full border border-[#e8b84b]/35 bg-[#e8b84b]/10 px-2 py-0.5 text-[9px] text-[#f3d078]">
                                    Prompt {topRarityDriver.rarerSide} mais raro (+{topRarityDriver.delta.toFixed(2)})
                                  </span>
                                </>
                              ) : null}
                            </div>
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
                  <div key={`clean-diff-${currentPair.id}`} className="diff-span-enter grid grid-cols-1 gap-3 md:grid-cols-2">
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
