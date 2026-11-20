import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { computeRarityTier, QUADRANT_META } from '../../core/rarityEngine'
import type { PersonalCollectionRecord } from '../../hooks/useCartographerProfile'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import {
  ATTRIBUTE_META,
  type AttributeKey,
  type AttributeTagStat,
  type PromptItem,
  type RarityTier,
} from '../../types/promptEngine'
import { getPromptSemanticTitle } from '../utils/promptDisplay'
import { FOIL_TINT_BY_TIER, SWATCH_COLORS, TIER_COLOR_META } from '../utils/themeTokens'
import { FavoriteToggleButton } from './FavoriteToggleButton'

interface PromptInspectorDrawerProps {
  item: PromptItem | null
  isCollectedTierS?: boolean
  isFavorite?: boolean
  onToggleFavorite?: (item: PromptItem) => void
  collections?: PersonalCollectionRecord[]
  onToggleItemInCollection?: (collectionId: string, itemId: string) => void
  onCreateCollection?: (name: string, targetCount?: number) => PersonalCollectionRecord | null
  onClose: () => void
  onRefineItem?: (item: PromptItem) => void
}

type InspectorTab = 'prompt' | 'attributes' | 'decks'

const COMPARABLE_ATTRIBUTE_META = ATTRIBUTE_META.filter((m) => m.key !== 'projeto_cliente')

interface RadarAxisPoint {
  key: AttributeKey
  shortLabel: string
  label: string
  filled: boolean
  score: number
  tier: RarityTier
  content: string
  rarityNote: string | null
}

let lastAxisTooltipAt = 0
const AXIS_SKIP_WINDOW_MS = 450
const AXIS_INITIAL_DELAY_MS = 160

function truncateTooltipText(raw: string, maxLen = 190): string {
  const clean = raw.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  return `${clean.slice(0, maxLen).trimEnd()}…`
}

function computeRadarPoints(item: PromptItem): RadarAxisPoint[] {
  const rarestTags = item.rarity.rarestTags || []

  return COMPARABLE_ATTRIBUTE_META.map((meta) => {
    const slot = item.attributes[meta.key]

    if (meta.key === 'estrutura') {
      const negBonus = item.attributes.estrutura.hasExplicitNegative ? 10 : 0
      const rawScore =
        item.maturity.technicalPrecisionScore * 0.45 +
        item.maturity.completenessScore * 0.35 +
        item.maturity.skeletonReuseScore * 0.2 +
        negBonus
      const score = Math.round(Math.max(12, Math.min(99, rawScore)))
      const tier: RarityTier = slot.filled ? computeRarityTier(score) : 'D'
      const ar = item.attributes.estrutura.aspectRatio
        ? ` · AR ${item.attributes.estrutura.aspectRatio}`
        : ''
      return {
        key: meta.key,
        shortLabel: meta.shortLabel,
        label: meta.label,
        filled: slot.filled,
        score,
        tier,
        content: `${item.attributes.estrutura.macroFormat.toUpperCase()} · ${item.attributes.estrutura.kernelDialect} · ${item.attributes.estrutura.filledAttributesCount}/8 atributos · ${item.attributes.estrutura.tokenCount} tokens${ar}`,
        rarityNote: `Reuso do molde: ${item.maturity.skeletonReuseCount}× · Precisão ${Math.round(item.maturity.technicalPrecisionScore)}%`,
      }
    }

    if (!slot.filled) {
      return {
        key: meta.key,
        shortLabel: meta.shortLabel,
        label: meta.label,
        filled: false,
        score: 8,
        tier: 'D',
        content: 'Atributo não preenchido neste prompt.',
        rarityNote: null,
      }
    }

    const slotTagSet = new Set((slot.tags || []).map((t) => t.toLowerCase()))
    const statsPool: AttributeTagStat[] =
      slot.tagStats && slot.tagStats.length > 0
        ? slot.tagStats
        : rarestTags.filter((rt) => slotTagSet.has(rt.tag.toLowerCase()))

    let topStat: AttributeTagStat | null = null
    let idfSum = 0
    for (const st of statsPool) {
      idfSum += st.idfWeight
      if (!topStat || st.idfWeight > topStat.idfWeight) {
        topStat = st
      }
    }

    const textLen = slot.text.trim().length
    const textRichness = Math.min(
      10,
      Math.round((Math.min(180, textLen) / 180) * 6) + Math.min(4, slot.tags.length)
    )

    let score: number
    if (topStat !== null) {
      const meanSlotIdf = idfSum / statsPool.length
      const effectiveIdf = topStat.idfWeight * 0.72 + meanSlotIdf * 0.28
      const idfPercentile = ((effectiveIdf - 1.2) / 5.6) * 92 + 4
      score = Math.round(Math.max(8, Math.min(99, idfPercentile + textRichness * 0.7)))
    } else {
      score = Math.round(
        Math.max(15, Math.min(95, item.rarity.percentile * 0.65 + textRichness * 2.5))
      )
    }

    const tier = computeRarityTier(score)

    const rarityNote = topStat
      ? `#${topStat.tag} · ${topStat.corpusPct.toFixed(2)}% do acervo · IDF ${topStat.idfWeight.toFixed(1)}`
      : slot.tags.length > 0
        ? slot.tags
            .slice(0, 3)
            .map((t) => `#${t}`)
            .join(' ')
        : null

    return {
      key: meta.key,
      shortLabel: meta.shortLabel,
      label: meta.label,
      filled: true,
      score,
      tier,
      content: truncateTooltipText(slot.text || '—'),
      rarityNote,
    }
  })
}

const AxisPointTooltipCard: React.FC<{
  point: RadarAxisPoint
  placement: 'top' | 'bottom'
  instant: boolean
  starting: boolean
}> = ({ point, placement, instant, starting }) => {
  const ptTierMeta = TIER_COLOR_META[point.tier]
  return (
    <div
      role="tooltip"
      data-instant={instant ? 'true' : 'false'}
      data-starting-style={starting ? 'true' : undefined}
      style={{
        ['--transform-origin' as string]: placement === 'top' ? 'bottom center' : 'top center',
      }}
      className={[
        'lab-tooltip pointer-events-none absolute left-1/2 z-40 w-[min(310px,100%)] -translate-x-1/2 rounded-2xl border border-hairline bg-elevated/95 p-3 text-left shadow-2xl backdrop-blur-md',
        placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink">
          {point.shortLabel} · {point.label}
        </span>
        <span
          className={[
            'tabular-mono rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            ptTierMeta.badgeClass,
          ].join(' ')}
        >
          TIER {point.tier} · {point.score}%
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-ink-secondary">
        {point.content}
      </p>

      {point.rarityNote ? (
        <p className={['mt-1.5 truncate font-mono text-[10px]', ptTierMeta.textClass].join(' ')}>
          {point.rarityNote}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Gráfico radar circular real dos 8 eixos de DNA da carta:
 * polígono na cor do Tier geral da carta e vértices individuais no Tier próprio de cada atributo.
 */
const InspectorRadarCircle: React.FC<{
  points: RadarAxisPoint[]
  cardTierColor: string
}> = ({ points, cardTierColor }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [instant, setInstant] = useState(false)
  const [starting, setStarting] = useState(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])
  useEffect(() => {
    clearTimer()
    setActiveIdx(null)
  }, [points])

  const openPoint = (idx: number, immediateFocus = false) => {
    clearTimer()
    const withinSkip = immediateFocus || Date.now() - lastAxisTooltipAt < AXIS_SKIP_WINDOW_MS
    if (withinSkip) {
      setInstant(true)
      setStarting(false)
      setActiveIdx(idx)
      lastAxisTooltipAt = Date.now()
      return
    }
    setInstant(false)
    timerRef.current = window.setTimeout(() => {
      setStarting(true)
      setActiveIdx(idx)
      lastAxisTooltipAt = Date.now()
      requestAnimationFrame(() => setStarting(false))
    }, AXIS_INITIAL_DELAY_MS)
  }

  const closePoint = () => {
    clearTimer()
    if (activeIdx !== null) {
      lastAxisTooltipAt = Date.now()
    }
    setActiveIdx(null)
  }

  const cx = 110
  const cy = 110
  const bgR = 76
  const minR = 12
  const maxR = 68
  const labelR = 94

  const vertices = points.map((pt, idx) => {
    const angle = -Math.PI / 2 + (idx * (2 * Math.PI)) / points.length
    const clamped = Math.max(0, Math.min(100, pt.score))
    const r = minR + (clamped / 100) * (maxR - minR)
    return {
      ...pt,
      idx,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      outerX: cx + maxR * Math.cos(angle),
      outerY: cy + maxR * Math.sin(angle),
      labelX: cx + labelR * Math.cos(angle),
      labelY: cy + labelR * Math.sin(angle),
    }
  })

  const polygonPoints = vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')
  const activeVertex = activeIdx !== null ? vertices[activeIdx] ?? null : null
  const tooltipPlacement = activeVertex && activeVertex.y < cy ? 'bottom' : 'top'

  return (
    <div className="relative flex justify-center py-1" onPointerLeave={closePoint}>
      <div className="relative h-[216px] w-[216px]">
        <svg
          viewBox="0 0 220 220"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`Gráfico de força e raridade por atributo: ${points
            .map((p) => `${p.label} ${p.score}%`)
            .join(', ')}`}
        >
          {/* Fundo circular escuro */}
          <circle cx={cx} cy={cy} r={bgR} fill="var(--color-surface)" />

          {/* Anéis concêntricos de referência */}
          <circle
            cx={cx}
            cy={cy}
            r={38}
            fill="none"
            stroke="var(--color-ink)"
            strokeOpacity="0.06"
            strokeWidth="1"
          />
          <circle
            cx={cx}
            cy={cy}
            r={maxR}
            fill="none"
            stroke="var(--color-ink)"
            strokeOpacity="0.09"
            strokeWidth="1"
          />

          {/* Raios dos 8 eixos */}
          {vertices.map((v) => (
            <line
              key={v.key}
              x1={cx}
              y1={cy}
              x2={v.outerX}
              y2={v.outerY}
              stroke="var(--color-ink)"
              strokeOpacity={activeIdx === v.idx ? '0.24' : '0.07'}
              strokeWidth="1"
            />
          ))}

          {/* Polígono colorido pelo Rank/Tier geral da carta */}
          <polygon
            points={polygonPoints}
            fill={`color-mix(in srgb, ${cardTierColor} 18%, transparent)`}
            stroke={cardTierColor}
            strokeWidth="1.85"
            strokeLinejoin="round"
          />

          {/* Rótulos perimetrais + vértices interativos com Tier próprio */}
          {vertices.map((v) => {
            const isActive = activeIdx === v.idx
            const vTierColor = TIER_COLOR_META[v.tier].barColor
            return (
              <g key={v.key}>
                <text
                  x={v.labelX}
                  y={v.labelY + 3}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="8.5"
                  fontWeight={isActive ? '600' : '500'}
                  fill={isActive ? vTierColor : v.filled ? 'var(--color-ink-tertiary)' : 'var(--color-ink-dim)'}
                  className="pointer-events-none select-none"
                >
                  {v.shortLabel}
                </text>

                {/* Ponto visível na cor do Tier individual deste atributo */}
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={isActive ? 5.2 : v.filled ? 3.5 : 2.2}
                  fill={isActive ? 'var(--color-ink)' : v.filled ? vTierColor : 'var(--color-ink-dim)'}
                  stroke={isActive ? vTierColor : 'none'}
                  strokeWidth={isActive ? 2 : 0}
                  style={{ transition: 'r 125ms var(--ease-out)' }}
                  className="pointer-events-none"
                />

                {/* Área tátil de hover/foco */}
                <circle
                  cx={v.x}
                  cy={v.y}
                  r={13}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${v.label} (Tier ${v.tier}): ${v.score}%. ${v.content}`}
                  onPointerEnter={() => openPoint(v.idx)}
                  onFocus={() => openPoint(v.idx, true)}
                  onBlur={closePoint}
                  className="cursor-pointer outline-none"
                />
              </g>
            )
          })}
        </svg>
      </div>

      {activeVertex ? (
        <AxisPointTooltipCard
          point={activeVertex}
          placement={tooltipPlacement}
          instant={instant}
          starting={starting}
        />
      ) : null}
    </div>
  )
}

export const PromptInspectorDrawer: React.FC<PromptInspectorDrawerProps> = ({
  item,
  isCollectedTierS = false,
  isFavorite = false,
  onToggleFavorite,
  collections = [],
  onToggleItemInCollection,
  onCreateCollection,
  onClose,
  onRefineItem,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()
  const [isImageFullscreen, setIsImageFullscreen] = useState(false)
  const [fallbackToThumb, setFallbackToThumb] = useState(false)
  const [activeTab, setActiveTab] = useState<InspectorTab>('prompt')
  const [deckPopoverOpen, setDeckPopoverOpen] = useState(false)
  const [deckSearch, setDeckSearch] = useState('')
  const [newDeckName, setNewDeckName] = useState('')
  const [creatingDeck, setCreatingDeck] = useState(false)
  const [hoveredPipIdx, setHoveredPipIdx] = useState<number | null>(null)
  const [pipInstant, setPipInstant] = useState(false)
  const [pipStarting, setPipStarting] = useState(false)
  const pipTimerRef = useRef<number | null>(null)

  const clearPipTimer = () => {
    if (pipTimerRef.current !== null) {
      window.clearTimeout(pipTimerRef.current)
      pipTimerRef.current = null
    }
  }

  useEffect(() => clearPipTimer, [])

  const openPip = (idx: number, immediateFocus = false) => {
    clearPipTimer()
    const withinSkip = immediateFocus || Date.now() - lastAxisTooltipAt < AXIS_SKIP_WINDOW_MS
    if (withinSkip) {
      setPipInstant(true)
      setPipStarting(false)
      setHoveredPipIdx(idx)
      lastAxisTooltipAt = Date.now()
      return
    }
    setPipInstant(false)
    pipTimerRef.current = window.setTimeout(() => {
      setPipStarting(true)
      setHoveredPipIdx(idx)
      lastAxisTooltipAt = Date.now()
      requestAnimationFrame(() => setPipStarting(false))
    }, AXIS_INITIAL_DELAY_MS)
  }

  const closePip = () => {
    clearPipTimer()
    if (hoveredPipIdx !== null) {
      lastAxisTooltipAt = Date.now()
    }
    setHoveredPipIdx(null)
  }

  const radarPoints = useMemo(() => (item ? computeRadarPoints(item) : []), [item])

  const asideRef = useRef<HTMLElement | null>(null)
  const previewStageRef = useRef<HTMLDivElement | null>(null)
  const previewFoilRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    dragging: boolean
    pointerId: number | null
    startY: number
    startTime: number
    currentY: number
  }>({ dragging: false, pointerId: null, startY: 0, startTime: 0, currentY: 0 })

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 1024 || dragRef.current.dragging) return
    dragRef.current = {
      dragging: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: performance.now(),
      currentY: 0,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (asideRef.current) {
      asideRef.current.style.transition = 'none'
    }
  }

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || dragRef.current.pointerId !== e.pointerId) return
    const rawDelta = e.clientY - dragRef.current.startY
    const damped = rawDelta < 0 ? rawDelta * 0.18 : rawDelta
    dragRef.current.currentY = damped
    if (asideRef.current) {
      asideRef.current.style.transform = `translateY(${damped}px)`
    }
  }

  const handleSheetPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || dragRef.current.pointerId !== e.pointerId) return
    const elapsed = Math.max(1, performance.now() - dragRef.current.startTime)
    const swipeAmount = dragRef.current.currentY
    const velocity = Math.abs(swipeAmount) / elapsed
    dragRef.current.dragging = false
    dragRef.current.pointerId = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    if (swipeAmount >= 90 || (swipeAmount > 24 && velocity > 0.11)) {
      if (asideRef.current) asideRef.current.style.transform = ''
      onClose()
      return
    }
    if (asideRef.current) {
      asideRef.current.style.transition = 'transform 200ms var(--ease-drawer)'
      asideRef.current.style.transform = 'translateY(0)'
    }
  }

  useEffect(() => {
    clearPipTimer()
    setHoveredPipIdx(null)
    setIsImageFullscreen(false)
    setFallbackToThumb(false)
    setDeckPopoverOpen(false)
    setCreatingDeck(false)
    setNewDeckName('')
    setDeckSearch('')
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (deckPopoverOpen) {
        setDeckPopoverOpen(false)
      } else if (isImageFullscreen) {
        setIsImageFullscreen(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [item, deckPopoverOpen, isImageFullscreen, onClose])

  if (!item) return null

  const tierMeta = TIER_COLOR_META[item.rarity.tier]
  const isTopRarity = item.rarity.tier === 'S'
  const isFoil = item.rarity.tier === 'S' || item.rarity.tier === 'A'
  const quad = QUADRANT_META[item.quadrant]
  const semanticTitle = getPromptSemanticTitle(item)
  const fullImageUrl = item.thumbnailUrl
    ? item.thumbnailUrl.replace('/api/thumbnail/', '/api/image/')
    : null
  const activeImageUrl = fallbackToThumb ? item.thumbnailUrl : fullImageUrl || item.thumbnailUrl
  const uniqueTags = Array.from(
    new Set(ATTRIBUTE_META.flatMap((m) => item.attributes[m.key].tags || []).filter(Boolean))
  ).slice(0, 12)

  const swatchTags = (
    item.rarity.rarestTags && item.rarity.rarestTags.length > 0
      ? item.rarity.rarestTags.map((rt) => rt.tag)
      : uniqueTags
  ).slice(0, 3)

  const filteredDecks = collections.filter((c) =>
    c.name.toLowerCase().includes(deckSearch.trim().toLowerCase())
  )
  const memberDeckCount = collections.filter((c) => c.itemIds.includes(item.id)).length

  const handlePreviewPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      e.pointerType === 'touch' ||
      isImageFullscreen ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'reduce'
    ) {
      return
    }
    const el = previewStageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    const nx = Math.max(-1, Math.min(1, (px / 100) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, (py / 100) * 2 - 1))
    el.style.transform = `perspective(900px) rotateX(${(-ny * 4).toFixed(2)}deg) rotateY(${(nx * 4).toFixed(2)}deg)`
    if (previewFoilRef.current && isFoil) {
      const tint = isTopRarity ? FOIL_TINT_BY_TIER.S : FOIL_TINT_BY_TIER.A
      previewFoilRef.current.style.background = `radial-gradient(280px circle at ${px.toFixed(1)}% ${py.toFixed(1)}%, ${tint}, transparent 68%)`
    }
  }

  const handlePreviewPointerLeave = () => {
    if (previewStageRef.current) {
      previewStageRef.current.style.transform = ''
    }
  }

  const handleCreateAndAssignDeck = (e: React.FormEvent) => {
    e.preventDefault()
    if (!onCreateCollection || !newDeckName.trim()) return
    const created = onCreateCollection(newDeckName.trim(), 12)
    if (created && onToggleItemInCollection) {
      onToggleItemInCollection(created.id, item.id)
    }
    setNewDeckName('')
    setCreatingDeck(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-canvas/96 backdrop-blur-md lg:flex-row"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador em Tela Cheia e Inspetor de Carta"
    >
      {/* ───── Palco Esquerdo: Imagem Tela Cheia ───── */}
      <div
        className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden bg-canvas p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra Superior Minimalista */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              className="lab-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-tertiary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-ink-muted">
              <span className="truncate rounded-full bg-surface px-3 py-1 text-ink-secondary">
                {item.project}
              </span>
              <span className="hidden rounded-full bg-surface px-2.5 py-1 uppercase text-ink-tertiary sm:inline-flex">
                {item.attributes.estrutura.macroFormat}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeImageUrl ? (
              <button
                type="button"
                onClick={() => setIsImageFullscreen((v) => !v)}
                className="lab-pressable inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                {isImageFullscreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Mostrar inspetor</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Tela cheia</span>
                  </>
                )}
              </button>
            ) : null}

            {isImageFullscreen ? (
              <button
                type="button"
                onClick={onClose}
                className="lab-pressable flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink-secondary [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
                aria-label="Fechar visualizador"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Centro do Palco: Imagem em Tela Cheia sem moldura */}
        <div className="my-auto flex min-h-0 flex-1 items-center justify-center py-4">
          {activeImageUrl ? (
            <img
              src={activeImageUrl}
              alt={item.title}
              onError={() => {
                if (!fallbackToThumb && item.thumbnailUrl) setFallbackToThumb(true)
              }}
              onClick={() => setIsImageFullscreen((v) => !v)}
              className={[
                'h-auto w-auto rounded-2xl object-contain transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)] select-none',
                isImageFullscreen
                  ? 'max-h-[86dvh] max-w-[94vw] cursor-zoom-out'
                  : 'max-h-[38dvh] max-w-full cursor-zoom-in lg:max-h-[82dvh]',
              ].join(' ')}
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-surface font-mono text-[12px] text-ink-muted">
              Sem imagem disponível
            </div>
          )}
        </div>

        {/* Rodapé Esquerdo: 3 pílulas discretas das DNA Tags principais */}
        <div className="flex min-h-[28px] flex-wrap items-center gap-2">
          {swatchTags.map((tg, i) => {
            const bg = SWATCH_COLORS[i % SWATCH_COLORS.length]
            const isCopied = copiedKey === `sw:${tg}`
            return (
              <button
                key={tg}
                type="button"
                onClick={() => void copyText(tg, `sw:${tg}`)}
                aria-label={`Copiar tag ${tg}`}
                className="lab-pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 font-mono text-[10px] font-medium text-ink-secondary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: bg }}
                />
                <span>{isCopied ? 'Copiado!' : `#${tg}`}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ───── Painel Direito Sticky (sem borda dura) ───── */}
      {!isImageFullscreen ? (
        <aside
          ref={asideRef}
          onClick={(e) => e.stopPropagation()}
          aria-label="Inspetor de Atributos da Carta"
          className="relative flex h-[56dvh] w-full shrink-0 flex-col overflow-hidden bg-canvas lg:h-full lg:w-[390px] xl:w-[420px]"
        >
          {/* Alça tátil mobile */}
          <div
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
            className="flex shrink-0 touch-none items-center justify-center pt-2 pb-1 lg:hidden"
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-ink/20" />
          </div>

          {/* Barra Superior de Ações */}
          <div className="relative flex items-center justify-between gap-2 px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              {onToggleFavorite ? (
                <FavoriteToggleButton
                  active={isFavorite}
                  onToggle={() => onToggleFavorite(item)}
                  size="sm"
                  tooltipPlacement="bottom"
                />
              ) : null}

              <button
                type="button"
                onClick={() => void copyText(item.rawPrompt, 'raw-top')}
                className="lab-pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-[11px] font-medium text-ink-secondary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
              >
                {copiedKey === 'raw-top' ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copiedKey === 'raw-top' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onToggleItemInCollection ? (
                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={deckPopoverOpen}
                    onClick={() => setDeckPopoverOpen((v) => !v)}
                    className="lab-pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[11px] font-semibold text-canvas transition-opacity [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:opacity-90 cursor-pointer"
                  >
                    <span>{memberDeckCount > 0 ? `Em ${memberDeckCount} Decks` : 'Salvar no Deck'}</span>
                  </button>

                  {deckPopoverOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-[1999]"
                        onClick={() => setDeckPopoverOpen(false)}
                      />
                      <div
                        style={{ ['--transform-origin' as string]: 'top right' }}
                        className="lab-popover savee-glass-panel absolute top-9 right-0 z-[2000] flex max-h-[380px] w-[280px] flex-col rounded-2xl p-2"
                      >
                        <div className="flex items-center gap-2 rounded-xl bg-ink/[0.06] px-3 py-2">
                          <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                          <input
                            autoFocus
                            value={deckSearch}
                            onChange={(e) => setDeckSearch(e.target.value)}
                            placeholder="Buscar decks pessoais..."
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
                          />
                        </div>

                        <div className="mt-1.5 flex-1 space-y-0.5 overflow-y-auto">
                          {filteredDecks.length === 0 ? (
                            <p className="px-2.5 py-4 text-center text-[12px] text-ink-muted">
                              Nenhum deck encontrado.
                            </p>
                          ) : (
                            filteredDecks.map((col) => {
                              const isMember = col.itemIds.includes(item.id)
                              return (
                                <button
                                  key={col.id}
                                  type="button"
                                  onClick={() => onToggleItemInCollection(col.id, item.id)}
                                  className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-ink/[0.08] cursor-pointer"
                                >
                                  <span className="grid h-6 w-6 shrink-0 grid-cols-2 gap-px overflow-hidden rounded bg-hairline">
                                    <span className="row-span-2 bg-elevated" />
                                    <span className="bg-ink-dim" />
                                    <span className="bg-surface" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                                    {col.name}
                                  </span>
                                  <span className="tabular-mono text-[10px] text-ink-muted">
                                    {col.itemIds.length}/{col.targetCount}
                                  </span>
                                  {isMember ? (
                                    <Check className="h-4 w-4 shrink-0 text-tier-s" />
                                  ) : null}
                                </button>
                              )
                            })
                          )}
                        </div>

                        {onCreateCollection ? (
                          creatingDeck ? (
                            <form
                              onSubmit={handleCreateAndAssignDeck}
                              className="mt-1.5 flex items-center gap-1.5 border-t border-hairline pt-2"
                            >
                              <input
                                autoFocus
                                value={newDeckName}
                                onChange={(e) => setNewDeckName(e.target.value)}
                                placeholder="Nome do novo deck..."
                                maxLength={60}
                                className="min-w-0 flex-1 rounded-xl border border-hairline bg-canvas px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-border-strong"
                              />
                              <button
                                type="submit"
                                disabled={!newDeckName.trim()}
                                className="rounded-xl bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-canvas disabled:opacity-40 cursor-pointer"
                              >
                                Criar
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCreatingDeck(true)}
                              className="mt-1.5 flex h-10 w-full items-center gap-2.5 rounded-xl border-t border-hairline px-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-ink/[0.08] cursor-pointer"
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/[0.08] text-ink-secondary">
                                <Plus className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-[13px] text-ink">Novo deck</span>
                            </button>
                          )
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="lab-pressable flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink-tertiary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:bg-elevated [@media(hover:hover)]:hover:text-ink cursor-pointer"
                aria-label="Fechar inspetor"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Corpo Rolável do Inspetor */}
          <div className="flex-1 space-y-5 overflow-y-auto px-5 pt-2 pb-6">
            {/* Pips de DNA comparáveis (7 eixos reais, sem pasta raiz) + Preview sem bordas */}
            <div className="space-y-2.5">
              <div className="relative" onPointerLeave={closePip}>
                <div
                  className="mx-auto flex w-full max-w-[196px] items-center justify-center gap-1.5"
                  aria-label={`${radarPoints.filter((pt) => pt.filled).length} de ${radarPoints.length} atributos comparáveis preenchidos`}
                >
                  {radarPoints.map((pt, idx) => {
                    const isActive = hoveredPipIdx === idx
                    const ptColor = TIER_COLOR_META[pt.tier].barColor
                    return (
                      <button
                        key={pt.key}
                        type="button"
                        onPointerEnter={() => openPip(idx)}
                        onFocus={() => openPip(idx, true)}
                        onBlur={closePip}
                        aria-label={`${pt.label} (Tier ${pt.tier}): ${pt.score}%. ${pt.content}`}
                        className="group relative flex flex-1 items-center py-1 cursor-pointer focus:outline-none"
                      >
                        <span
                          className={[
                            'h-1.5 w-full rounded-full transition-transform [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]',
                            isActive ? 'scale-y-150' : '',
                          ].join(' ')}
                          style={{
                            backgroundColor: pt.filled
                              ? ptColor
                              : 'var(--border-hairline)',
                          }}
                        />
                      </button>
                    )
                  })}
                </div>

                {hoveredPipIdx !== null && radarPoints[hoveredPipIdx] ? (
                  <AxisPointTooltipCard
                    point={radarPoints[hoveredPipIdx]}
                    placement="bottom"
                    instant={pipInstant}
                    starting={pipStarting}
                  />
                ) : null}
              </div>

              <div
                ref={previewStageRef}
                onPointerMove={handlePreviewPointerMove}
                onPointerLeave={handlePreviewPointerLeave}
                onClick={() => setIsImageFullscreen(true)}
                className="card-inspect-stage card-3d-tilt relative aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-[20px] bg-surface"
              >
                {isFoil ? (
                  <div ref={previewFoilRef} aria-hidden="true" className="card-foil-sheen z-20" />
                ) : null}

                {activeImageUrl ? (
                  <img
                    src={activeImageUrl}
                    alt={item.title}
                    onError={() => {
                      if (!fallbackToThumb && item.thumbnailUrl) setFallbackToThumb(true)
                    }}
                    className="h-full w-full object-cover select-none"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-[11px] text-ink-muted">
                    Preview sem miniatura
                  </div>
                )}
              </div>
            </div>

            {/* Título + 3 linhas de metadados */}
            <div className="space-y-1.5">
              <h2 className="line-clamp-2 text-[18px] font-semibold leading-snug tracking-tight text-ink">
                {semanticTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-secondary">
                <span>{item.project}</span>
                <span className="text-ink-dim">·</span>
                <span className={isTopRarity ? 'text-tier-s font-semibold' : tierMeta.textClass}>
                  TIER {item.rarity.tier} · P{item.rarity.percentile}
                </span>
                {isTopRarity && isCollectedTierS ? (
                  <span className="tier-s-collected-fade inline-flex items-center gap-1 rounded-full bg-tier-s/15 px-2 py-0.5 text-[10px] font-medium text-tier-s-bright">
                    <Sparkles className="h-2.5 w-2.5" />
                    Coletado
                  </span>
                ) : null}
              </div>
              <p className="truncate font-mono text-[11px] text-ink-tertiary">
                {item.attributes.estrutura.kernelDialect} · {item.attributes.estrutura.macroFormat.toUpperCase()} · {quad.label}
              </p>
              <p className="tabular-mono text-[11px] text-ink-muted">
                {item.rarity.label} · MAT {Math.round(item.maturity.score)}/100
              </p>
            </div>

            {/* Linha de Destaque: Rank #corpusRank */}
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <span className="text-[12px] font-medium text-ink-tertiary">Rank</span>
              <span className="tabular-mono text-[28px] font-normal leading-none tracking-[-0.03em] text-ink">
                #{item.rarity.corpusRank}
              </span>
            </div>

            {/* Gráfico Circular de Pontos Fortes e Raridade por Rank */}
            <InspectorRadarCircle
              points={radarPoints}
              cardTierColor={tierMeta.barColor}
            />

            {/* Abas Sublinhadas: Prompt | Atributos | Decks */}
            <div className="grid grid-cols-3 gap-2.5 pt-1" role="tablist" aria-label="Seções do inspetor">
              {(
                [
                  { id: 'prompt', label: 'Prompt' },
                  { id: 'attributes', label: 'Atributos' },
                  { id: 'decks', label: 'Decks' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'border-b-2 pb-2 text-center text-[12px] font-medium transition-colors [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] cursor-pointer',
                      active
                        ? 'border-ink text-ink'
                        : 'border-hairline text-ink-muted [@media(hover:hover)]:hover:text-ink-secondary',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Conteúdo da Aba Ativa */}
            {activeTab === 'prompt' ? (
              <div className="space-y-3.5">
                <div className="rounded-2xl bg-surface p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="section-eyebrow">Esqueleto &amp; Prompt Bruto</span>
                    <button
                      type="button"
                      onClick={() => void copyText(item.rawPrompt, 'raw-tab')}
                      className="lab-pressable inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-canvas cursor-pointer"
                    >
                      {copiedKey === 'raw-tab' ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedKey === 'raw-tab' ? 'Copiado' : 'Copiar tudo'}</span>
                    </button>
                  </div>
                  <div className="mb-2 tabular-mono text-[10px] text-ink-muted">
                    skeleton: {item.attributes.estrutura.skeletonSignature} · {item.attributes.estrutura.tokenCount}t
                  </div>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-secondary">
                    {item.rawPrompt}
                  </pre>
                </div>

                {uniqueTags.length > 0 ? (
                  <div className="rounded-2xl bg-surface p-3.5">
                    <span className="section-eyebrow"># Tags Extraídas</span>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {uniqueTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => void copyText(tag, `tag:${tag}`)}
                          className="lab-pressable tabular-mono rounded-full bg-elevated px-2.5 py-1 text-[10px] text-ink-secondary transition-colors [transition-duration:var(--dur-fast)] [@media(hover:hover)]:hover:text-ink cursor-pointer"
                        >
                          {copiedKey === `tag:${tag}` ? `✓ #${tag}` : `#${tag}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : activeTab === 'attributes' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface/65 px-3.5 py-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                    Pasta Raiz
                  </span>
                  <span className="truncate font-mono text-[11px] text-ink-secondary">
                    {item.project}
                  </span>
                </div>

                {COMPARABLE_ATTRIBUTE_META.map((meta, idx) => {
                  const slot = item.attributes[meta.key]
                  const axisPoint = radarPoints[idx]
                  const attrTierMeta = axisPoint ? TIER_COLOR_META[axisPoint.tier] : null
                  return (
                    <div
                      key={meta.key}
                      className={[
                        'rounded-2xl p-3.5',
                        slot.filled ? 'bg-surface' : 'bg-surface/45 opacity-70',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="tabular-mono rounded bg-elevated px-1.5 py-0.5 text-[10px] text-ink-secondary">
                            {meta.shortLabel}
                          </span>
                          <span className="text-[12px] font-medium text-ink">
                            {meta.label}
                          </span>
                        </div>
                        {slot.filled && axisPoint && attrTierMeta ? (
                          <span
                            className={[
                              'tabular-mono rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                              attrTierMeta.badgeClass,
                            ].join(' ')}
                          >
                            TIER {axisPoint.tier} · {axisPoint.score}%
                          </span>
                        ) : (
                          <span className="tabular-mono text-[10px] text-ink-muted">
                            VAZIO
                          </span>
                        )}
                      </div>

                      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
                        {slot.text || '—'}
                      </p>

                      {(slot.tagStats && slot.tagStats.length > 0) || slot.tags.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {slot.tagStats && slot.tagStats.length > 0
                            ? slot.tagStats.map((ts) => (
                                <span
                                  key={`${ts.axis}:${ts.tag}`}
                                  className="tabular-mono rounded-lg bg-canvas px-2 py-0.5 text-[10px] text-ink-tertiary"
                                >
                                  {ts.tag} · {ts.corpusPct.toFixed(1)}% ({ts.corpusCount})
                                </span>
                              ))
                            : slot.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="tabular-mono rounded-lg bg-canvas px-2 py-0.5 text-[10px] text-ink-tertiary"
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
            ) : (
              <div className="space-y-3.5">
                {item.quadrant === 'raro_imaturo' && onRefineItem ? (
                  <button
                    type="button"
                    onClick={() => onRefineItem(item)}
                    className="club-btn-gold w-full cursor-pointer px-4 py-2 text-[11px]"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Forjar Upgrade (Maduro)</span>
                  </button>
                ) : null}

                <div className="rounded-2xl bg-surface p-3.5">
                  <span className="section-eyebrow">Decks Pessoais</span>
                  {collections.length === 0 || !onToggleItemInCollection ? (
                    <p className="mt-2 text-[12px] text-ink-muted">
                      Crie decks no seu Perfil ou pelo botão "Salvar no Deck" no topo.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-1">
                      {collections.map((col) => {
                        const isMember = col.itemIds.includes(item.id)
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => onToggleItemInCollection(col.id, item.id)}
                            className="flex h-10 w-full items-center justify-between gap-2.5 rounded-xl px-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-elevated cursor-pointer"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className="grid h-6 w-6 shrink-0 grid-cols-2 gap-px overflow-hidden rounded bg-hairline">
                                <span className="row-span-2 bg-elevated" />
                                <span className="bg-ink-dim" />
                                <span className="bg-surface" />
                              </span>
                              <span className="truncate text-[13px] text-ink">{col.name}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-mono text-[11px] text-ink-muted">
                                {col.itemIds.length}/{col.targetCount}
                              </span>
                              {isMember ? (
                                <Check className="h-4 w-4 text-tier-s" />
                              ) : (
                                <Plus className="h-3.5 w-3.5 text-ink-muted" />
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-surface p-3.5 text-[11px]">
                  <span className="section-eyebrow">Linhagem no Acervo</span>
                  <dl className="mt-2.5 space-y-1.5 font-mono">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Pasta Raiz</dt>
                      <dd className="text-ink-secondary">{item.project}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Arquivo</dt>
                      <dd className="truncate text-ink-secondary">{item.title}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Reuso do Molde</dt>
                      <dd className="text-ink-secondary">{item.maturity.skeletonReuseCount}×</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Aspect Ratio</dt>
                      <dd className="text-ink-secondary">{item.attributes.estrutura.aspectRatio || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Negativo Explícito</dt>
                      <dd className="text-ink-secondary">
                        {item.attributes.estrutura.hasExplicitNegative ? 'Sim' : 'Não'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
