import React, { useRef, useState } from 'react'
import { MoveHorizontal } from 'lucide-react'
import type { RarityTier } from '../../types/promptEngine'
import { DEFAULT_SPOTLIGHT_COLOR, TIER_COLOR_META } from '../utils/themeTokens'
import { PromptThumb } from './PromptThumb'

function canUsePointerEffects(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    document.documentElement.dataset.reducedMotion !== 'reduce'
  )
}

interface SpotlightCardProps {
  children: React.ReactNode
  className?: string
  spotlightColor?: string
  style?: React.CSSProperties
}

/**
 * React Bits SpotlightCard adaptado ao Savee Design System:
 * atualiza o gradiente apenas no nó folha `overlayRef` (sem propagar CSS vars nos filhos).
 */
export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = DEFAULT_SPOTLIGHT_COLOR,
  style,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || !canUsePointerEffects()) return
    const card = cardRef.current
    const overlay = overlayRef.current
    if (!card || !overlay) return
    const rect = card.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    overlay.style.background = `radial-gradient(280px circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, ${spotlightColor}, transparent 72%)`
    overlay.style.opacity = '1'
  }

  const handlePointerLeave = () => {
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '0'
    }
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      style={style}
      className={['relative overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}

interface GlareHoverProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * React Bits GlareHover recalibrado para artwork 3:4 de cartas em duelo.
 */
export const GlareHover: React.FC<GlareHoverProps> = ({
  children,
  className = '',
  style,
}) => (
  <div
    style={style}
    className={['group/glare relative overflow-hidden', className].filter(Boolean).join(' ')}
  >
    {children}
    <span aria-hidden="true" className="rb-glare-layer z-20" />
  </div>
)

interface ShinyTextProps {
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

/**
 * React Bits ShinyText calibrado para rótulos metálicos de raridade.
 */
export const ShinyText: React.FC<ShinyTextProps> = ({
  children,
  className = '',
  disabled = false,
}) => (
  <span
    className={[
      disabled ? 'text-tier-s' : 'rb-shiny-text',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {children}
  </span>
)

interface StarBorderBadgeProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
}

/**
 * React Bits StarBorder recalibrado para hairline 1px no padrão Savee dark.
 */
export const StarBorderBadge: React.FC<StarBorderBadgeProps> = ({
  children,
  className = '',
  innerClassName = '',
}) => (
  <span className={['rb-star-border', className].filter(Boolean).join(' ')}>
    <span
      className={['rb-star-border-inner px-2.5 py-0.5', innerClassName]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  </span>
)

interface ClipComparisonSliderProps {
  leftLabel: string
  rightLabel: string
  leftSublabel?: string
  rightSublabel?: string
  leftImageUrl?: string | null
  rightImageUrl?: string | null
  leftTitle: string
  rightTitle: string
  leftTier?: RarityTier
  rightTier?: RarityTier
  className?: string
}

/**
 * Comparador visual A ↔ B com `clip-path: inset(0 X% 0 0)` (`emil-design-eng`)
 * e rastreamento 1:1 com `setPointerCapture` (`apple-design`).
 */
export const ClipComparisonSlider: React.FC<ClipComparisonSliderProps> = ({
  leftLabel,
  rightLabel,
  leftSublabel,
  rightSublabel,
  leftImageUrl,
  rightImageUrl,
  leftTitle,
  rightTitle,
  leftTier = 'B',
  rightTier = 'B',
  className = '',
}) => {
  const [splitPct, setSplitPct] = useState(50)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activePointerRef = useRef<number | null>(null)

  const updateFromClientX = (clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const raw = ((clientX - rect.left) / rect.width) * 100
    setSplitPct(Math.max(4, Math.min(96, raw)))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== null) return
    activePointerRef.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== e.pointerId) return
    updateFromClientX(e.clientX)
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== e.pointerId) return
    activePointerRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSplitPct((p) => Math.max(4, p - 5))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setSplitPct((p) => Math.min(96, p + 5))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSplitPct(4)
    } else if (e.key === 'End') {
      e.preventDefault()
      setSplitPct(96)
    }
  }

  const rightTierMeta = TIER_COLOR_META[rightTier]
  const leftTierMeta = TIER_COLOR_META[leftTier]

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Comparador deslizante entre Carta A e Carta B"
      aria-valuemin={4}
      aria-valuemax={96}
      aria-valuenow={Math.round(splitPct)}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={[
        'relative mx-auto aspect-[4/3] w-full max-w-[680px] touch-none select-none overflow-hidden rounded-[20px] border border-hairline bg-canvas cursor-ew-resize focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Camada Base: Carta B (Direita) */}
      <div className="absolute inset-0">
        <PromptThumb
          src={rightImageUrl}
          alt={rightTitle}
          loading="eager"
          fallbackLabel={rightLabel}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
        />
      </div>

      {/* Camada Superior Recortada: Carta A (Esquerda) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${(100 - splitPct).toFixed(2)}% 0 0)` }}
      >
        <PromptThumb
          src={leftImageUrl}
          alt={leftTitle}
          loading="eager"
          fallbackLabel={leftLabel}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
        />
      </div>

      {/* Etiqueta Canto Superior Esquerdo (Carta A) */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[44%] flex-col gap-0.5 rounded-xl border border-border-hover bg-black/70 px-2.5 py-1.5 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="tabular-mono text-[10px] font-semibold text-ink">{leftLabel}</span>
          <span
            className={[
              'tabular-mono rounded-full border px-1.5 py-px text-[9px] font-medium',
              leftTierMeta.badgeClass,
            ].join(' ')}
          >
            {leftTier}
          </span>
        </div>
        {leftSublabel ? (
          <span className="truncate font-mono text-[10px] text-ink-tertiary">{leftSublabel}</span>
        ) : null}
      </div>

      {/* Etiqueta Canto Superior Direito (Carta B) */}
      <div className="pointer-events-none absolute top-3 right-3 z-20 flex max-w-[44%] flex-col items-end gap-0.5 rounded-xl border border-border-hover bg-black/70 px-2.5 py-1.5 text-right backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span
            className={[
              'tabular-mono rounded-full border px-1.5 py-px text-[9px] font-medium',
              rightTierMeta.badgeClass,
            ].join(' ')}
          >
            {rightTier}
          </span>
          <span className="tabular-mono text-[10px] font-semibold text-ink">{rightLabel}</span>
        </div>
        {rightSublabel ? (
          <span className="truncate font-mono text-[10px] text-ink-tertiary">{rightSublabel}</span>
        ) : null}
      </div>

      {/* Linha divisória + Alça tátil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-30 w-px bg-ink/85 shadow-[0_0_16px_rgba(0,0,0,0.9)]"
        style={{ left: `${splitPct}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface/90 text-ink shadow-xl backdrop-blur-md">
          <MoveHorizontal className="h-4 w-4" />
        </div>
      </div>

      {/* Leitura do recorte */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-hairline bg-black/65 px-3 py-1 font-mono text-[10px] text-ink-secondary backdrop-blur-md">
        {Math.round(splitPct)}% A · {Math.round(100 - splitPct)}% B
      </div>
    </div>
  )
}
