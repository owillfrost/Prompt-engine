import React, { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, MoreHorizontal } from 'lucide-react'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import { ATTRIBUTE_META, type PromptItem, type RarityTier } from '../../types/promptEngine'
import { getPromptSemanticTitle } from '../utils/promptDisplay'
import { FOIL_TINT_BY_TIER, TIER_COLOR_META } from '../utils/themeTokens'
import { PromptThumb } from './PromptThumb'

interface PromptCollectionCardProps {
  item: PromptItem
  selected: boolean
  isFavorite?: boolean
  onToggleFavorite?: (item: PromptItem) => void
  onSelect: (item: PromptItem) => void
  cornerRadius?: number
  binderMode?: boolean
  catalogNumber?: number
  isExplored?: boolean
}

const COMPARABLE_ATTRIBUTE_META = ATTRIBUTE_META.filter((m) => m.key !== 'projeto_cliente')

const FORMAT_LABELS: Record<PromptItem['attributes']['estrutura']['macroFormat'], string> = {
  json: 'JSON',
  sections: 'SEÇÕES',
  single_paragraph: 'PARÁGRAFO',
}

const TIER_RANK_SUBLABEL: Record<RarityTier, string> = {
  S: 'MÍTICO',
  A: 'ARCANO',
  B: 'RARO',
  C: 'INCOMUM',
  D: 'BASE',
}

const FRAME_CLASS_BY_TIER: Record<RarityTier, string> = {
  S: 'card-rarity-frame-s tier-s-aura',
  A: 'card-rarity-frame-a',
  B: 'card-rarity-frame-b',
  C: 'card-rarity-frame-c',
  D: 'card-rarity-frame-d',
}

const MAX_TILT_DEG = 3.2

function canUse3DTilt(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.reducedMotion !== 'reduce'
  )
}

function parseInitialAspectRatio(arStr: string | undefined): number {
  if (!arStr) return 3 / 4
  const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(arStr.trim())
  if (!match) return 3 / 4
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 3 / 4
  return Math.max(0.55, Math.min(1.55, w / h))
}

export const PromptCollectionCard: React.FC<PromptCollectionCardProps> = ({
  item,
  selected,
  isFavorite = false,
  onToggleFavorite,
  onSelect,
  cornerRadius = 8,
  binderMode = false,
  catalogNumber,
  isExplored = false,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const foilRef = useRef<HTMLDivElement | null>(null)
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number>(() =>
    parseInitialAspectRatio(item.attributes.estrutura.aspectRatio)
  )

  useEffect(() => {
    setAspectRatio(parseInitialAspectRatio(item.attributes.estrutura.aspectRatio))
  }, [item.id, item.attributes.estrutura.aspectRatio])

  useEffect(() => {
    if (hasEnteredViewport || !binderMode) return
    const el = cardRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEnteredViewport(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasEnteredViewport, binderMode])

  const animatedPercentile = useAnimatedNumber(item.rarity.percentile, {
    durationMs: 420,
    decimals: 0,
    enabled: binderMode && hasEnteredViewport,
  })

  const tierMeta = TIER_COLOR_META[item.rarity.tier]
  const isFoilTier = item.rarity.tier === 'S' || item.rarity.tier === 'A'
  const isP99 = item.rarity.percentile >= 99
  const { estrutura } = item.attributes
  const semanticTitle = getPromptSemanticTitle(item)

  const roundedAnimatedPercentile = Math.round(animatedPercentile)
  const displayRarityLabel =
    roundedAnimatedPercentile === Math.round(item.rarity.percentile) && item.rarity.label
      ? item.rarity.label
      : `mais raro que ${roundedAnimatedPercentile}% da coleção`

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!binderMode || e.pointerType === 'touch' || !canUse3DTilt()) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    const nx = Math.max(-1, Math.min(1, (px / 100) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, (py / 100) * 2 - 1))
    const rx = (-ny * MAX_TILT_DEG).toFixed(2)
    const ry = (nx * MAX_TILT_DEG).toFixed(2)
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`

    if (foilRef.current && isFoilTier) {
      const tint =
        item.rarity.tier === 'S'
          ? FOIL_TINT_BY_TIER.S
          : FOIL_TINT_BY_TIER.A
      foilRef.current.style.background = `radial-gradient(280px circle at ${px.toFixed(1)}% ${py.toFixed(1)}%, ${tint}, transparent 68%)`
    }
  }

  const handlePointerLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = ''
    }
  }

  // Modo Savee Masonry: imagem pura sem borda em repouso + overlay minimalista no hover
  if (!binderMode) {
    return (
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(item)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onSelect(item)
          }
        }}
        style={{
          aspectRatio: String(aspectRatio),
          borderRadius: `${cornerRadius}px`,
        }}
        className={[
          'group relative w-full overflow-hidden bg-surface text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
          selected ? 'ring-1 ring-ink/75' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="absolute inset-0 h-full w-full overflow-hidden">
          <PromptThumb
            src={item.thumbnailUrl}
            alt={item.title}
            loading="lazy"
            fallbackLabel="Sem miniatura"
            onImageLoad={(w, h) => {
              if (w > 0 && h > 0) {
                setAspectRatio(Math.max(0.55, Math.min(1.55, w / h)))
              }
            }}
            className="lab-card-thumb-zoom h-full w-full object-cover"
          />
        </div>

        {/* Overlay Savee (visível no hover em apontadores finos ou foco de teclado) */}
        <div
          style={{ borderRadius: `${cornerRadius}px` }}
          className="pointer-events-none absolute inset-0 z-10 bg-black/30 opacity-0 transition-opacity [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {/* Topo Esquerdo: botão ··· (28px) */}
          <button
            type="button"
            aria-label={`Inspecionar ${semanticTitle}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(item)
            }}
            className="lab-pressable pointer-events-auto absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full text-white transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated/60 [@media(hover:hover)]:hover:backdrop-blur-[4px] cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {/* Topo Direito: pílula branca Save / Saved */}
          {onToggleFavorite ? (
            <button
              type="button"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(item)
              }}
              className={[
                'lab-pressable pointer-events-auto absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium leading-none transition-opacity [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:opacity-85 cursor-pointer',
                isFavorite
                  ? 'bg-tier-s text-canvas'
                  : 'bg-ink text-canvas',
              ].join(' ')}
            >
              <span>{isFavorite ? 'Saved' : 'Save'}</span>
            </button>
          ) : null}

          {/* Rodapé Esquerdo: Tier + Percentil */}
          <span
            className={[
              'tabular-mono absolute bottom-2.5 left-3 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-[4px]',
              tierMeta.textClass,
            ].join(' ')}
          >
            TIER {item.rarity.tier} · P{item.rarity.percentile}
          </span>

          {/* Rodapé Direito: @pasta */}
          <span className="absolute right-3 bottom-2.5 max-w-[52%] truncate text-[12px] font-medium text-white drop-shadow-sm">
            @{item.project}
          </span>
        </div>
      </div>
    )
  }

  // Modo Codex Binder 3:4: card colecionável técnico
  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect(item)
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      style={{
        aspectRatio: String(3 / 4),
        borderRadius: `${cornerRadius}px`,
      }}
      className={[
        'group card-3d-tilt relative w-full break-inside-avoid overflow-hidden bg-surface text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
        FRAME_CLASS_BY_TIER[item.rarity.tier],
        selected ? 'ring-1 ring-ink/75' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Imagem da Carta */}
      <div className="absolute inset-0 h-full w-full overflow-hidden">
        <PromptThumb
          src={item.thumbnailUrl}
          alt={item.title}
          loading="lazy"
          fallbackLabel="Sem miniatura"
          className="lab-card-thumb-zoom h-full w-full object-cover"
        />
      </div>

      {/* Camada Foil Holográfica (S / A) */}
      {isFoilTier ? (
        <div ref={foilRef} aria-hidden="true" className="card-foil-sheen z-[5]" />
      ) : null}

      {/* Filete interno sutil para cartas de colecionador Tier S/A */}
      {isFoilTier ? (
        <div
          aria-hidden="true"
          style={{ borderRadius: `${Math.max(4, cornerRadius - 4)}px` }}
          className={[
            'pointer-events-none absolute inset-[5px] z-[6] border',
            item.rarity.tier === 'S' ? 'border-tier-s/35' : 'border-tier-a/35',
          ].join(' ')}
        />
      ) : null}

      {/* Topo da Carta: Dialeto + Número de Catálogo + Save Pill */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 pt-2.5 pb-7">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {catalogNumber !== undefined ? (
            <span className="tabular-mono rounded-full border border-border-hover bg-canvas/90 px-2 py-0.5 text-[10px] font-medium text-ink">
              #{String(catalogNumber).padStart(4, '0')}
            </span>
          ) : null}
          <span className="tabular-mono min-w-0 truncate rounded-full border border-hairline bg-canvas/85 px-2 py-0.5 text-[10px] tracking-wider text-ink-secondary">
            {FORMAT_LABELS[estrutura.macroFormat]} · {estrutura.kernelDialect}
          </span>
          {isExplored ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              title="Inspecionada no Códice"
            />
          ) : null}
        </div>

        {onToggleFavorite ? (
          <div className="pointer-events-auto shrink-0">
            <button
              type="button"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar carta nos favoritos'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(item)
              }}
              className={[
                'lab-pressable inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-[opacity,transform,background-color] duration-150 cursor-pointer',
                isFavorite
                  ? 'border border-tier-s/60 bg-surface/95 text-tier-s opacity-100'
                  : 'bg-ink text-canvas [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:opacity-90',
              ].join(' ')}
            >
              {isFavorite ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>Salvo</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3 w-3" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* Rodapé da Carta: Título Semântico + 7 Pips Comparáveis + Raridade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/88 via-black/55 to-transparent px-3 pt-9 pb-2.5">
        <p className="line-clamp-1 text-[12px] font-medium leading-tight text-ink drop-shadow-sm">
          {semanticTitle}
        </p>

        <div
          className="flex items-center gap-1"
          aria-label={`${COMPARABLE_ATTRIBUTE_META.filter((a) => item.attributes[a.key].filled).length} de 7 atributos comparáveis preenchidos`}
        >
          {COMPARABLE_ATTRIBUTE_META.map((attr) => {
            const filled = item.attributes[attr.key].filled
            return (
              <span
                key={attr.key}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor: filled ? tierMeta.barColor : 'var(--border-hairline)',
                  opacity: filled ? 0.92 : 0.6,
                }}
              />
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={[
              'tabular-mono min-w-0 truncate text-[11px] drop-shadow-sm',
              tierMeta.textClass,
            ].join(' ')}
          >
            {displayRarityLabel}
          </span>
          <span
            className={[
              'tabular-mono inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              tierMeta.badgeClass,
            ].join(' ')}
          >
            {isP99 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-tier-s" aria-hidden="true" />
            ) : null}
            <span>
              {item.rarity.tier} · {TIER_RANK_SUBLABEL[item.rarity.tier]}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
