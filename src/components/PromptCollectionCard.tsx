import React, { useEffect, useRef, useState } from 'react'
import { QUADRANT_META, TIER_COLOR_META } from '../core/rarityEngine'
import { useAnimatedNumber } from '../hooks/useAnimatedNumber'
import type { PromptItem } from '../types/promptEngine'
import { PromptThumb } from './PromptThumb'

interface PromptCollectionCardProps {
  item: PromptItem
  selected: boolean
  onSelect: (item: PromptItem) => void
}

const FORMAT_LABELS: Record<PromptItem['attributes']['estrutura']['macroFormat'], string> = {
  json: 'JSON',
  sections: 'SEÇÕES',
  single_paragraph: 'PARÁGRAFO',
}

const MAX_TILT_DEG = 3.5

function canUse3DTilt(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export const PromptCollectionCard: React.FC<PromptCollectionCardProps> = ({
  item,
  selected,
  onSelect,
}) => {
  const cardRef = useRef<HTMLButtonElement | null>(null)
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false)

  useEffect(() => {
    if (hasEnteredViewport) return
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
  }, [hasEnteredViewport])

  const animatedPercentile = useAnimatedNumber(item.rarity.percentile, {
    durationMs: 420,
    decimals: 0,
    enabled: hasEnteredViewport,
  })

  const tierMeta = TIER_COLOR_META[item.rarity.tier]
  const isP99 = item.rarity.percentile >= 99
  const { estrutura } = item.attributes
  const quadMeta = QUADRANT_META[item.quadrant]

  const roundedAnimatedPercentile = Math.round(animatedPercentile)
  const displayRarityLabel =
    roundedAnimatedPercentile === Math.round(item.rarity.percentile) && item.rarity.label
      ? item.rarity.label
      : `mais raro que ${roundedAnimatedPercentile}% da coleção`

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch' || !canUse3DTilt()) return
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))
    const rx = (-ny * MAX_TILT_DEG).toFixed(2)
    const ry = (nx * MAX_TILT_DEG).toFixed(2)
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`
  }

  const handlePointerLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = ''
    }
  }

  const attrDots: Array<{ label: string; filled: boolean }> = [
    { label: 'SUJ', filled: item.attributes.sujeito.filled },
    { label: 'CEN', filled: item.attributes.cenario.filled },
    { label: 'LUZ', filled: item.attributes.luz.filled },
    { label: 'CAM', filled: item.attributes.camera.filled },
    { label: 'MAT', filled: item.attributes.textura_material.filled },
    { label: 'EST', filled: item.attributes.estilo.filled },
    { label: 'PRJ', filled: item.attributes.projeto_cliente.filled },
    { label: 'STR', filled: item.attributes.estrutura.filled },
  ]

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onSelect(item)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      className={[
        'group card-3d-tilt flex flex-col overflow-hidden rounded-2xl border bg-[#101013] text-left cursor-pointer',
        isP99 ? 'tier-s-aura' : '',
        selected ? 'border-white/30 bg-[#141418]' : tierMeta.borderClass,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Miniatura real: única fonte de cor na interface */}
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-white/[0.06] bg-[#0a0a0d]">
        {item.thumbnailUrl ? (
          <PromptThumb
            src={item.thumbnailUrl}
            alt={item.title}
            fallbackLabel="Sem miniatura"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-zinc-600">
            Sem miniatura
          </div>
        )}

        {/* Badges sóbrios sobrepostos apenas com fundo escuro neutro */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
          <span className="tabular-mono min-w-0 truncate rounded-full border border-white/10 bg-black/75 px-2 py-0.5 text-[10px] text-zinc-300 backdrop-blur-sm">
            {FORMAT_LABELS[estrutura.macroFormat]} · {estrutura.kernelDialect}
          </span>
          <span className="inline-flex shrink-0 rounded-full bg-black/75 backdrop-blur-sm">
            <span
              className={[
                'tabular-mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                tierMeta.badgeClass,
              ].join(' ')}
            >
              {isP99 ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[#e8b84b]" aria-hidden="true" />
              ) : null}
              TIER {item.rarity.tier}
            </span>
          </span>
        </div>

        {isP99 ? (
          <span className="pointer-events-none tabular-mono absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full border border-[#e8b84b]/60 bg-black/85 px-2 py-0.5 text-[9px] font-medium tracking-wider text-[#e8b84b] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e8b84b]" aria-hidden="true" />
            TOP 0.1%
          </span>
        ) : null}
      </div>

      {/* Corpo denso */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
        <div className="flex flex-col gap-2">
          {/* Título + Projeto */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium text-zinc-100" title={item.title}>
                {item.title}
              </h3>
              <p className="truncate text-[11px] text-zinc-500" title={item.project}>
                {item.project}
              </p>
            </div>
            <span className="tabular-mono shrink-0 text-[10px] text-zinc-500">
              {estrutura.filledAttributesCount}/8
            </span>
          </div>

          {/* Trecho do prompt em monoespaçada */}
          <p className="line-clamp-3 rounded-xl border border-white/[0.05] bg-[#0b0b0e] p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300">
            {item.excerpt}
          </p>
        </div>

        {/* Rodapé: cobertura dos 8 atributos + linha de raridade/tier */}
        <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-2.5">
          {/* Micro-matriz de 8 atributos */}
          <div className="flex flex-wrap items-center gap-1">
            {attrDots.map((dot) => (
              <span
                key={dot.label}
                className={[
                  'tabular-mono rounded px-1.5 py-0.5 text-[9px] border',
                  dot.filled
                    ? 'border-white/[0.08] bg-white/[0.04] text-zinc-300'
                    : 'border-white/[0.03] bg-transparent text-zinc-600',
                ].join(' ')}
              >
                {dot.label}
              </span>
            ))}
          </div>

          {/* Linha obrigatória de raridade em monoespaçada + maturidade */}
          <div className="flex items-center justify-between gap-2">
            <span className={['tabular-mono text-[11px]', tierMeta.textClass].join(' ')}>
              {displayRarityLabel}
            </span>
            <span className="tabular-mono shrink-0 text-[10px] text-zinc-500" title={quadMeta.description}>
              MAT {Math.round(item.maturity.score)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="tabular-mono uppercase tracking-wider text-zinc-500">
              {quadMeta.shortLabel}
            </span>
            <span className="tabular-mono text-zinc-600">
              {estrutura.tokenCount} tok
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
