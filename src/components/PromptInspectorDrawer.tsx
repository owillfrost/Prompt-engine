import React, { useEffect, useState } from 'react'
import { ArrowRight, Check, Copy, Maximize2, Minimize2, X } from 'lucide-react'
import { QUADRANT_META, TIER_COLOR_META } from '../core/rarityEngine'
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
  const [isImageFullscreen, setIsImageFullscreen] = useState(false)
  const [fallbackToThumb, setFallbackToThumb] = useState(false)

  useEffect(() => {
    setIsImageFullscreen(false)
    setFallbackToThumb(false)
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImageFullscreen) {
          setIsImageFullscreen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [item, isImageFullscreen, onClose])

  if (!item) return null

  const tierMeta = TIER_COLOR_META[item.rarity.tier]
  const isTopRarity = item.rarity.tier === 'S'
  const quad = QUADRANT_META[item.quadrant]
  const fullImageUrl = item.thumbnailUrl
    ? item.thumbnailUrl.replace('/api/thumbnail/', '/api/image/')
    : null
  const activeImageUrl = fallbackToThumb ? item.thumbnailUrl : fullImageUrl || item.thumbnailUrl

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-md lg:flex-row"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador e Inspetor de Prompt"
    >
      {/* Palco Esquerdo: Imagem em Alta Resolução / Tela Cheia */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#050507] p-3 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {activeImageUrl ? (
          <img
            src={activeImageUrl}
            alt={item.title}
            onError={() => {
              if (!fallbackToThumb && item.thumbnailUrl) {
                setFallbackToThumb(true)
              }
            }}
            onClick={() => setIsImageFullscreen((v) => !v)}
            title={isImageFullscreen ? 'Modo dividido' : 'Tela cheia'}
            className={[
              'w-auto h-auto object-contain rounded-xl shadow-2xl transition-transform duration-200 select-none',
              isImageFullscreen
                ? 'max-h-[96dvh] max-w-[96vw] cursor-zoom-out'
                : 'max-h-[44dvh] lg:max-h-[88dvh] max-w-full cursor-zoom-in',
            ].join(' ')}
          />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0b0b0e] font-mono text-[12px] text-zinc-500">
            Sem imagem disponível
          </div>
        )}

        {/* Controles flutuantes no topo direito do palco da imagem */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 sm:top-5 sm:right-5">
          {activeImageUrl ? (
            <button
              type="button"
              onClick={() => setIsImageFullscreen((v) => !v)}
              className="press-scale inline-flex items-center gap-1.5 rounded-xl border border-white/[0.14] bg-black/75 px-3 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/90 cursor-pointer"
            >
              {isImageFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Mostrar prompt</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Expandir imagem</span>
                </>
              )}
            </button>
          ) : null}

          {isImageFullscreen ? (
            <button
              type="button"
              onClick={onClose}
              className="press-scale flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.14] bg-black/75 text-zinc-200 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white cursor-pointer"
              aria-label="Fechar visualizador"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Metadados discretos sobrepostos no canto inferior esquerdo da imagem */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[85%] flex-wrap items-center gap-2 rounded-xl border border-white/[0.1] bg-black/75 px-3 py-2 backdrop-blur-md sm:bottom-5 sm:left-5">
          <span
            className={[
              'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-medium',
              tierMeta.badgeClass,
            ].join(' ')}
          >
            TIER {item.rarity.tier}
          </span>
          <span className="truncate text-[12px] font-medium text-zinc-100">{item.title}</span>
          <span className="tabular-mono text-[10px] text-zinc-400">
            {item.project} · AR {item.attributes.estrutura.aspectRatio || '—'}
          </span>
        </div>
      </div>

      {/* Painel Direito: Inspetor do Prompt & 8 Atributos */}
      {!isImageFullscreen ? (
        <aside
          className="flex h-[52dvh] w-full shrink-0 flex-col overflow-hidden border-t border-white/[0.09] bg-[#0c0c0f] lg:h-full lg:w-[520px] lg:border-t-0 lg:border-l xl:w-[580px]"
          onClick={(e) => e.stopPropagation()}
          aria-label="Inspetor de Atributos do Prompt"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    tierMeta.badgeClass,
                  ].join(' ')}
                >
                  TIER {item.rarity.tier}
                </span>
                <span className={['tabular-mono text-[11px]', tierMeta.textClass].join(' ')}>
                  {item.rarity.label}
                </span>
              </div>
              <h2 className="mt-1 truncate text-[15px] font-medium text-zinc-100">{item.title}</h2>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {activeImageUrl ? (
                <button
                  type="button"
                  onClick={() => setIsImageFullscreen(true)}
                  className="btn-secondary hidden text-[11px] sm:inline-flex"
                  title="Expandir imagem para 100% da tela"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Expandir imagem</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="btn-ghost min-h-[36px] px-2"
                aria-label="Fechar inspetor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Eixos Raridade × Maturidade */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Bloco Raridade */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#101014] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">Eixo 1 · Raridade</span>
                  <span
                    className={[
                      'tabular-mono text-[12px] font-medium',
                      isTopRarity ? 'text-[#e8b84b]' : tierMeta.textClass,
                    ].join(' ')}
                  >
                    P{item.rarity.percentile}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-zinc-200">{item.rarity.label}</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-2.5 text-[10px]">
                  <div>
                    <div className="text-zinc-500">IDF Médio</div>
                    <div className="tabular-mono text-zinc-200">{item.rarity.meanIdf}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Par Combin.</div>
                    <div className="tabular-mono text-zinc-200">+{item.rarity.pairRarityBonus}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Rank</div>
                    <div className="tabular-mono text-zinc-200">
                      {item.rarity.corpusRank}/{item.rarity.corpusSize}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco Maturidade */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#101014] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="section-eyebrow">Eixo 2 · Maturidade</span>
                  <span className="tabular-mono text-[12px] font-medium text-zinc-200">
                    {item.maturity.score}/100
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="tabular-mono truncate text-[11px] text-zinc-300">{quad.label}</span>
                  <span className="tabular-mono shrink-0 text-[10px] text-zinc-500">
                    {item.maturity.skeletonReuseCount}×
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-white/[0.06] pt-2.5 text-[10px]">
                  <div>
                    <div className="text-zinc-500">Reuso</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.skeletonReuseScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Atrib.</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.completenessScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Técn.</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.technicalPrecisionScore}%</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Curad.</div>
                    <div className="tabular-mono text-zinc-300">{item.maturity.curationScore}%</div>
                  </div>
                </div>
                {item.quadrant === 'raro_imaturo' && onRefineItem ? (
                  <button
                    type="button"
                    onClick={() => onRefineItem(item)}
                    className="btn-primary mt-3 w-full text-[11px]"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Lapidar para Raro + Maduro</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Esqueleto + Prompt Bruto */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="section-eyebrow">Prompt Bruto Original ({item.sourceLib})</span>
                <button
                  type="button"
                  onClick={() => void copyText(item.rawPrompt, 'raw')}
                  className="btn-secondary min-h-[30px] px-2.5 text-[11px]"
                >
                  {copiedKey === 'raw' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'raw' ? 'Copiado' : 'Copiar prompt'}</span>
                </button>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#09090b] p-3.5">
                <div className="mb-2 tabular-mono text-[10px] text-zinc-500">
                  skeleton: {item.attributes.estrutura.skeletonSignature}
                </div>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300">
                  {item.rawPrompt}
                </pre>
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
          </div>
        </aside>
      ) : null}
    </div>
  )
}
