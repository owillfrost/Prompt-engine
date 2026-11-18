import React, { useEffect } from 'react'
import { Check, Copy, Sparkles, X } from 'lucide-react'
import { QUADRANT_META } from '../core/rarityEngine'
import { useCopyFeedback } from '../hooks/useCopyFeedback'
import { ATTRIBUTE_META, type PromptItem } from '../types/promptEngine'

interface PromptInspectorDrawerProps {
  item: PromptItem | null
  onClose: () => void
  onRefineItem?: (item: PromptItem) => void
}

export const PromptInspectorDrawer: React.FC<PromptInspectorDrawerProps> = ({
  item,
  onClose,
  onRefineItem,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()

  useEffect(() => {
    if (!item) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [item, onClose])

  if (!item) return null

  const isTopRarity = item.rarity.tier === 'S'
  const quad = QUADRANT_META[item.quadrant]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/[0.09] bg-[#0c0c0f]"
        onClick={(e) => e.stopPropagation()}
        aria-label="Inspetor de Atributos do Prompt"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={[
                  'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  isTopRarity
                    ? 'border-[#e5a93c]/60 bg-[#e5a93c]/10 text-[#e5a93c]'
                    : 'border-white/10 bg-white/[0.04] text-zinc-300',
                ].join(' ')}
              >
                TIER {item.rarity.tier}
              </span>
              <span className="tabular-mono text-[11px] text-zinc-400">
                {item.rarity.label}
              </span>
            </div>
            <h2 className="mt-1 truncate text-[15px] font-medium text-zinc-100">{item.title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] p-2 text-zinc-400 hover:border-white/[0.18] hover:text-zinc-100 cursor-pointer"
            aria-label="Fechar inspetor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Topo: Imagem + Eixos Raridade × Maturidade */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090b]">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : null}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 sm:col-span-7">
              {/* Bloco Raridade */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#101014] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">Eixo 1 · Raridade (Freq. Inversa)</span>
                  <span
                    className={[
                      'tabular-mono text-[12px] font-medium',
                      isTopRarity ? 'text-[#e5a93c]' : 'text-zinc-200',
                    ].join(' ')}
                  >
                    P{item.rarity.percentile}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[12px] text-zinc-200">{item.rarity.label}</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5 text-[11px]">
                  <div>
                    <div className="text-zinc-500">IDF Médio</div>
                    <div className="tabular-mono text-zinc-200">{item.rarity.meanIdf}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Par Combin.</div>
                    <div className="tabular-mono text-zinc-200">+{item.rarity.pairRarityBonus}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Rank Corpus</div>
                    <div className="tabular-mono text-zinc-200">
                      {item.rarity.corpusRank}/{item.rarity.corpusSize}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco Maturidade */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#101014] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">Eixo 2 · Maturidade (Reuso & Refino)</span>
                  <span className="tabular-mono text-[12px] font-medium text-zinc-200">
                    {item.maturity.score}/100
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="tabular-mono text-[11px] text-zinc-300">{quad.label}</span>
                  <span className="tabular-mono text-[10px] text-zinc-500">
                    Reuso esqueleto: {item.maturity.skeletonReuseCount}×
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-2.5 text-[10px]">
                  <div>
                    <div className="text-zinc-500">Reuso</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.skeletonReuseScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Atrib.</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.completenessScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Técnica</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.technicalPrecisionScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Curadoria</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.curationScore}%</div>
                  </div>
                </div>
                {item.quadrant === 'raro_imaturo' && onRefineItem ? (
                  <button
                    type="button"
                    onClick={() => onRefineItem(item)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e5a93c]/55 bg-[#e5a93c]/10 px-3 py-2 text-[11px] font-medium text-[#e5a93c] hover:border-[#e5a93c] cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Lapidar para Raro + Maduro →</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Decomposição nos 8 Atributos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="section-eyebrow">Decomposição em 8 Atributos</span>
              <span className="tabular-mono text-[11px] text-zinc-500">
                {item.attributes.estrutura.filledAttributesCount}/8 preenchidos
              </span>
            </div>

            <div className="space-y-2">
              {ATTRIBUTE_META.map((meta) => {
                const slot = item.attributes[meta.key]
                return (
                  <div
                    key={meta.key}
                    className="rounded-2xl border border-white/[0.07] bg-[#101014] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="tabular-mono rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {meta.shortLabel}
                        </span>
                        <span className="text-[12px] font-medium text-zinc-200">{meta.label}</span>
                      </div>
                      <span className="tabular-mono text-[10px] text-zinc-500">
                        {slot.filled ? 'PREENCHIDO' : 'VAZIO'}
                      </span>
                    </div>

                    <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-300">
                      {slot.text || '—'}
                    </p>

                    {(slot.tagStats && slot.tagStats.length > 0) || slot.tags.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {slot.tagStats && slot.tagStats.length > 0
                          ? slot.tagStats.map((ts) => (
                              <span
                                key={`${ts.axis}:${ts.tag}`}
                                className="tabular-mono rounded-lg border border-white/[0.07] bg-[#0a0a0d] px-2 py-0.5 text-[10px] text-zinc-400"
                              >
                                {ts.tag} · {ts.corpusPct.toFixed(1)}% ({ts.corpusCount})
                              </span>
                            ))
                          : slot.tags.map((tag) => (
                              <span
                                key={tag}
                                className="tabular-mono rounded-lg border border-white/[0.07] bg-[#0a0a0d] px-2 py-0.5 text-[10px] text-zinc-400"
                              >
                                {tag}
                              </span>
                            ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Esqueleto + Prompt Bruto */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="section-eyebrow">Prompt Bruto Original ({item.sourceLib})</span>
              <button
                type="button"
                onClick={() => void copyText(item.rawPrompt, 'raw')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#15151a] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-white/[0.18] cursor-pointer"
              >
                {copiedKey === 'raw' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'raw' ? 'Copiado' : 'Copiar prompt'}</span>
              </button>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#09090b] p-3.5">
              <div className="mb-2 tabular-mono text-[10px] text-zinc-500">
                skeleton: {item.attributes.estrutura.skeletonSignature}
              </div>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300">
                {item.rawPrompt}
              </pre>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
