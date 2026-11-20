import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Compass,
  GitCompare,
  Maximize2,
  Minimize2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { DUR_MS, EASE_OUT_CSS } from '../utils/motion'
import { TIER_COLOR_META } from '../utils/themeTokens'
import { PromptThumb } from './PromptThumb'
import type { PromptItem, PromptNeighborDetail } from '../../types/promptEngine'

export interface FlyOriginRect {
  left: number
  top: number
  width: number
  height: number
}

interface HoneycombNode {
  id: string
  item: PromptItem
  isReference: boolean
  neighbor: PromptNeighborDetail | null
  bx: number
  by: number
  ring: 0 | 1 | 2
}

interface PointerSample {
  x: number
  y: number
  t: number
}

interface MapSimilarityStageProps {
  viewportSize: { w: number; h: number }
  reference: PromptItem
  neighbors: PromptNeighborDetail[]
  loadingNeighbors: boolean
  trail: PromptItem[]
  hoveredNeighborId: string | null
  onHoverNeighbor: (id: string | null) => void
  getPointOriginRect: (item: {
    id: string
    x?: number
    y?: number
    structX?: number
    structY?: number
  }) => FlyOriginRect
  explicitFlyOriginsRef: React.MutableRefObject<Record<string, FlyOriginRect>>
  onFollowNeighbor: (neighbor: PromptNeighborDetail, cardRect: FlyOriginRect | null) => void
  onSelectTrailItem: (item: PromptItem, cardRect: FlyOriginRect | null) => void
  onInspectItem: (item: PromptItem) => void
  onOpenPair: (idA: string, idB: string) => void
  onMinimizeToMap: () => void
  onClearReference: () => void
}

const S_MIN = 0.38
const S_MAX = 1.0
const SQRT3 = Math.sqrt(3)

// Coordenadas axiais pointy-top para Anel 1 (6) e Anel 2 (12: 6 pontos médios primeiro, depois 6 cantos)
const RING1_AXIAL: ReadonlyArray<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

const RING2_AXIAL_RAW: ReadonlyArray<[number, number]> = [
  [1, 1],
  [-1, 2],
  [-2, 1],
  [-1, -1],
  [1, -2],
  [2, -1],
  [2, 0],
  [0, 2],
  [-2, 2],
  [-2, 0],
  [0, -2],
  [2, -2],
]

function axialToPixel(q: number, r: number, spacing: number): { x: number; y: number } {
  return {
    x: spacing * (q + r * 0.5),
    y: spacing * (SQRT3 * 0.5) * r,
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clampDelta(value: number, maxAbs: number): number {
  return Math.max(-maxAbs, Math.min(maxAbs, value))
}

function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

function projectVelocity(velocityPxPerSec: number, decelerationRate = 0.996): number {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate)
}

export const MapSimilarityStage: React.FC<MapSimilarityStageProps> = ({
  viewportSize,
  reference,
  neighbors,
  loadingNeighbors,
  trail,
  onHoverNeighbor,
  getPointOriginRect,
  explicitFlyOriginsRef,
  onFollowNeighbor,
  onSelectTrailItem,
  onInspectItem,
  onOpenPair,
  onMinimizeToMap,
  onClearReference,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)

  const outerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const innerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const innerAnims = useRef<Map<string, Animation>>(new Map())

  const panRef = useRef({ x: 0, y: 0 })
  const velRef = useRef({ x: 0, y: 0 })

  const applyRafRef = useRef<number | null>(null)
  const springRafRef = useRef<number | null>(null)

  const dragRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    origPanX: number
    origPanY: number
    moved: boolean
    samples: PointerSample[]
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    moved: false,
    samples: [],
  })

  const suppressClickUntilRef = useRef(0)
  const flownBatchKeyRef = useRef<string>('')
  const flownIdsRef = useRef<Set<string>>(new Set())

  const [lensFocusedId, setLensFocusedId] = useState<string>(reference.id)
  const lensFocusedIdRef = useRef<string>(reference.id)

  // Proporção equilibrada: Centro ~262px, Anel 1 ~149px (0.57x) e Anel 2 ~100-104px (0.39x) sem sobreposição
  const layoutMetrics = useMemo(() => {
    const usableH = Math.max(400, viewportSize.h - 124)
    const minDim = Math.min(viewportSize.w, usableH)
    const cardRenderSize = Math.max(164, Math.min(262, Math.round(minDim * 0.315)))
    const hexSpacing = Math.round(cardRenderSize * 0.8)
    const lensRadiusR = hexSpacing * 0.92
    const maxPush = cardRenderSize * 0.72
    return { cardRenderSize, hexSpacing, lensRadiusR, maxPush }
  }, [viewportSize.w, viewportSize.h])

  // Constroi a colmeia radial: Referência no centro (0,0) + Anel 1 (6) + Anel 2 (até 12)
  const nodes: HoneycombNode[] = useMemo(() => {
    const list: HoneycombNode[] = [
      {
        id: reference.id,
        item: reference,
        isReference: true,
        neighbor: null,
        bx: 0,
        by: 0,
        ring: 0,
      },
    ]

    const ringSlots = [...RING1_AXIAL, ...RING2_AXIAL_RAW]
    const maxNeighbors = Math.min(neighbors.length, ringSlots.length)
    for (let i = 0; i < maxNeighbors; i++) {
      const nb = neighbors[i]
      if (!nb || nb.item.id === reference.id) continue
      const [q, r] = ringSlots[i]
      const pos = axialToPixel(q, r, layoutMetrics.hexSpacing)
      list.push({
        id: nb.item.id,
        item: nb.item,
        isReference: false,
        neighbor: nb,
        bx: pos.x,
        by: pos.y,
        ring: i < 6 ? 1 : 2,
      })
    }
    return list
  }, [reference, neighbors, layoutMetrics.hexSpacing])

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const maxPanRadius = useMemo(() => {
    let maxR = layoutMetrics.hexSpacing
    for (const n of nodes) {
      maxR = Math.max(maxR, Math.hypot(n.bx, n.by))
    }
    return maxR
  }, [nodes, layoutMetrics.hexSpacing])

  // Escreve transform, opacity e z-index diretamente no DOM (0 setState por frame)
  const applyLensTransforms = useCallback(() => {
    const { hexSpacing, lensRadiusR, maxPush } = layoutMetrics
    const { x: panX, y: panY } = panRef.current
    const currentNodes = nodesRef.current

    let closestId = currentNodes[0]?.id ?? ''
    let closestDist = Infinity

    for (const node of currentNodes) {
      const el = outerRefs.current.get(node.id)
      const rx = node.bx + panX
      const ry = node.by + panY
      const d = Math.hypot(rx, ry)

      if (d < closestDist) {
        closestDist = d
        closestId = node.id
      }

      if (!el) continue

      const ratio = d / lensRadiusR
      const gaussian = Math.exp(-(ratio * ratio))
      const scale = S_MIN + (S_MAX - S_MIN) * gaussian

      // Empurrão radial (lens push) para afastar vizinhos enquanto o card no centro cresce
      const push = d > 0.5 ? maxPush * gaussian * Math.min(1, d / (hexSpacing * 0.65)) : 0
      const fx = d > 0.5 ? rx + (rx / d) * push : rx
      const fy = d > 0.5 ? ry + (ry / d) * push : ry

      const opacityRatio = d / (lensRadiusR * 1.65)
      const opacity = Math.max(0.42, 0.46 + 0.54 * Math.exp(-(opacityRatio * opacityRatio)))
      const zIndex = Math.round(scale * 100) + (node.isReference ? 5 : 0)

      el.style.transform = `translate3d(${fx.toFixed(2)}px, ${fy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
      el.style.opacity = opacity.toFixed(3)
      el.style.zIndex = String(zIndex)
    }

    if (closestId && closestId !== lensFocusedIdRef.current) {
      lensFocusedIdRef.current = closestId
      setLensFocusedId(closestId)
    }
  }, [layoutMetrics])

  const scheduleApplyFrame = useCallback(() => {
    if (applyRafRef.current !== null) return
    applyRafRef.current = requestAnimationFrame(() => {
      applyRafRef.current = null
      applyLensTransforms()
    })
  }, [applyLensTransforms])

  const cancelSpring = useCallback(() => {
    if (springRafRef.current !== null) {
      cancelAnimationFrame(springRafRef.current)
      springRafRef.current = null
    }
  }, [])

  // Release Phase: Mola amortecida 2D (X/Y independentes) com continuidade de velocidade
  const animateSpringTo = useCallback(
    (targetX: number, targetY: number, initialVx: number, initialVy: number, hasMomentum: boolean) => {
      cancelSpring()

      if (prefersReducedMotion()) {
        panRef.current = { x: targetX, y: targetY }
        velRef.current = { x: 0, y: 0 }
        applyLensTransforms()
        return
      }

      const omega = 16.5 // response ~0.38s
      const zeta = hasMomentum ? 0.84 : 1.0
      const stiffness = omega * omega
      const damping = 2 * zeta * omega

      let px = panRef.current.x
      let py = panRef.current.y
      let vx = initialVx
      let vy = initialVy
      let lastTime = performance.now()

      const step = (now: number) => {
        const rawDt = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000))
        lastTime = now

        const subSteps = rawDt > 0.014 ? 2 : 1
        const dt = rawDt / subSteps
        for (let s = 0; s < subSteps; s++) {
          const ax = -stiffness * (px - targetX) - damping * vx
          const ay = -stiffness * (py - targetY) - damping * vy
          vx += ax * dt
          vy += ay * dt
          px += vx * dt
          py += vy * dt
        }

        panRef.current = { x: px, y: py }
        velRef.current = { x: vx, y: vy }
        applyLensTransforms()

        const dist = Math.hypot(px - targetX, py - targetY)
        const speed = Math.hypot(vx, vy)
        if (dist < 0.35 && speed < 4) {
          panRef.current = { x: targetX, y: targetY }
          velRef.current = { x: 0, y: 0 }
          springRafRef.current = null
          applyLensTransforms()
          return
        }

        springRafRef.current = requestAnimationFrame(step)
      }

      springRafRef.current = requestAnimationFrame(step)
    },
    [cancelSpring, applyLensTransforms]
  )

  const snapToNode = useCallback(
    (node: HoneycombNode, opts?: { instant?: boolean }) => {
      cancelSpring()
      if (opts?.instant || prefersReducedMotion()) {
        panRef.current = { x: -node.bx, y: -node.by }
        velRef.current = { x: 0, y: 0 }
        applyLensTransforms()
        return
      }
      animateSpringTo(-node.bx, -node.by, velRef.current.x, velRef.current.y, false)
    },
    [cancelSpring, applyLensTransforms, animateSpringTo]
  )

  // Roteia foco inicial para o palco (acessibilidade em view transitions)
  useEffect(() => {
    stageRef.current?.focus({ preventScroll: true })
  }, [])

  // Limpa loops RAF e animações WAAPI ao desmontar
  useEffect(() => {
    const animMap = innerAnims.current
    return () => {
      if (applyRafRef.current !== null) cancelAnimationFrame(applyRafRef.current)
      if (springRafRef.current !== null) cancelAnimationFrame(springRafRef.current)
      animMap.forEach((anim) => anim.cancel())
      animMap.clear()
    }
  }, [])

  // Sincroniza nova referência (centraliza pan em 0,0) e anima entrada FLIP dos nós internos
  useLayoutEffect(() => {
    const isNewRef = flownBatchKeyRef.current !== reference.id
    if (isNewRef) {
      flownBatchKeyRef.current = reference.id
      flownIdsRef.current.clear()
      cancelSpring()
      panRef.current = { x: 0, y: 0 }
      velRef.current = { x: 0, y: 0 }
      lensFocusedIdRef.current = reference.id
      setLensFocusedId(reference.id)
    }

    // 1. Garante que wrappers externos já estejam na geometria final antes de medir getBoundingClientRect()
    applyLensTransforms()

    // 2. Anima entrada espacial (FLIP desde o mapa ou desde o card clicado) no wrapper interno
    const reduced = prefersReducedMotion()
    const maxDx = Math.max(340, viewportSize.w * 0.72)
    const maxDy = Math.max(260, viewportSize.h * 0.72)

    let newFlyOrder = 0
    nodes.forEach((node) => {
      if (flownIdsRef.current.has(node.id)) return
      flownIdsRef.current.add(node.id)

      const innerEl = innerRefs.current.get(node.id)
      if (!innerEl) return

      const prevAnim = innerAnims.current.get(node.id)
      if (prevAnim) prevAnim.cancel()

      const explicitOrigin = explicitFlyOriginsRef.current[node.id]
      delete explicitFlyOriginsRef.current[node.id]

      if (reduced) {
        const fade = innerEl.animate([{ opacity: 0.45 }, { opacity: 1 }], {
          duration: DUR_MS.fast,
          easing: 'ease',
        })
        innerAnims.current.set(node.id, fade)
        fade.onfinish = () => {
          if (innerAnims.current.get(node.id) === fade) innerAnims.current.delete(node.id)
        }
        return
      }

      const targetRect = innerEl.getBoundingClientRect()
      if (targetRect.width <= 0 || targetRect.height <= 0) return

      const origin = explicitOrigin ?? getPointOriginRect(node.item)
      const outerScale = Math.max(0.2, targetRect.width / layoutMetrics.cardRenderSize)
      const dx = clampDelta(
        origin.left + origin.width * 0.5 - (targetRect.left + targetRect.width * 0.5),
        maxDx
      )
      const dy = clampDelta(
        origin.top + origin.height * 0.5 - (targetRect.top + targetRect.height * 0.5),
        maxDy
      )
      const localDx = dx / outerScale
      const localDy = dy / outerScale
      const startScale = Math.max(0.22, Math.min(1.3, origin.height / targetRect.height))
      const delay = node.isReference ? 0 : Math.min(170, Math.round(28 * Math.sqrt(newFlyOrder++)))

      const anim = innerEl.animate(
        [
          {
            transform: `translate3d(${localDx.toFixed(1)}px, ${localDy.toFixed(1)}px, 0) scale(${startScale.toFixed(3)})`,
            opacity: node.isReference ? 0.78 : 0.3,
          },
          {
            transform: 'translate3d(0, 0, 0) scale(1)',
            opacity: 1,
          },
        ],
        {
          duration: node.isReference ? DUR_MS.slow : DUR_MS.base,
          delay,
          easing: EASE_OUT_CSS,
          fill: 'both',
        }
      )
      innerAnims.current.set(node.id, anim)
      anim.onfinish = () => {
        if (innerAnims.current.get(node.id) === anim) innerAnims.current.delete(node.id)
        anim.cancel()
      }
    })
  }, [
    reference.id,
    nodes,
    layoutMetrics.cardRenderSize,
    viewportSize.w,
    viewportSize.h,
    applyLensTransforms,
    cancelSpring,
    getPointOriginRect,
    explicitFlyOriginsRef,
  ])

  // Track Phase: Arraste 1:1 com rubber-band nas bordas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return

    // Qualquer novo toque cancela a mola imediatamente (interruptibilidade)
    cancelSpring()
    velRef.current = { x: 0, y: 0 }

    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: panRef.current.x,
      origPanY: panRef.current.y,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
    }
  }

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return
      drag.moved = true
      canvasAreaRef.current?.setPointerCapture(e.pointerId)
    }

    const now = performance.now()
    drag.samples.push({ x: e.clientX, y: e.clientY, t: now })
    if (drag.samples.length > 8) drag.samples.shift()

    const rawX = drag.origPanX + dx
    const rawY = drag.origPanY + dy
    const rawDist = Math.hypot(rawX, rawY)

    if (rawDist > maxPanRadius && rawDist > 0) {
      const overshoot = rawDist - maxPanRadius
      const damped = rubberband(overshoot, layoutMetrics.hexSpacing * 1.4, 0.55)
      const factor = (maxPanRadius + damped) / rawDist
      panRef.current = { x: rawX * factor, y: rawY * factor }
    } else {
      panRef.current = { x: rawX, y: rawY }
    }

    scheduleApplyFrame()
  }

  const finishCanvasDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return

    const wasDrag = drag.moved
    drag.active = false
    drag.pointerId = null

    if (canvasAreaRef.current?.hasPointerCapture(e.pointerId)) {
      canvasAreaRef.current.releasePointerCapture(e.pointerId)
    }

    if (!wasDrag) return

    suppressClickUntilRef.current = performance.now() + 100

    let vx = 0
    let vy = 0
    if (!cancelled && drag.samples.length >= 2) {
      const now = performance.now()
      const latest = drag.samples[drag.samples.length - 1]
      if (now - latest.t < 75) {
        let oldest = drag.samples[0]
        for (let i = drag.samples.length - 2; i >= 0; i--) {
          if (latest.t - drag.samples[i].t <= 95) {
            oldest = drag.samples[i]
          } else {
            break
          }
        }
        const dt = (latest.t - oldest.t) / 1000
        if (dt > 0.008) {
          vx = clampDelta((latest.x - oldest.x) / dt, 2600)
          vy = clampDelta((latest.y - oldest.y) / dt, 2600)
        }
      }
    }

    const projX = panRef.current.x + projectVelocity(vx, 0.996)
    const projY = panRef.current.y + projectVelocity(vy, 0.996)

    let targetNode = nodesRef.current[0]
    let minD = Infinity
    for (const node of nodesRef.current) {
      const d = Math.hypot(node.bx + projX, node.by + projY)
      if (d < minD) {
        minD = d
        targetNode = node
      }
    }

    if (targetNode) {
      animateSpringTo(-targetNode.bx, -targetNode.by, vx, vy, true)
    }
  }

  // Navegação por teclado (instantânea por regra de design) e Esc para voltar ao mapa
  const handleStageKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onMinimizeToMap()
      return
    }
    if (nodes.length <= 1) return

    const currIdx = Math.max(
      0,
      nodes.findIndex((n) => n.id === lensFocusedIdRef.current)
    )
    let nextIdx = currIdx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIdx = (currIdx + 1) % nodes.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIdx = (currIdx - 1 + nodes.length) % nodes.length
    } else {
      return
    }

    const nextNode = nodes[nextIdx]
    if (nextNode) {
      snapToNode(nextNode, { instant: true })
      buttonRefs.current.get(nextNode.id)?.focus({ preventScroll: true })
    }
  }

  const focusedNode = useMemo(
    () => nodes.find((n) => n.id === lensFocusedId) ?? nodes[0],
    [nodes, lensFocusedId]
  )
  const isCenteredOnReference = focusedNode?.isReference ?? true

  return (
    <div
      ref={stageRef}
      data-map-interactive="true"
      role="region"
      aria-label="Colmeia espacial entre referência central e pontos similares"
      tabIndex={-1}
      onKeyDown={handleStageKeyDown}
      className="map-stage-scrim absolute inset-0 z-30 flex flex-col justify-between overflow-hidden bg-canvas/90 px-4 py-3.5 focus:outline-none sm:px-6 sm:py-4"
    >
      {/* Topo: Trilha Anterior + Controles do Palco */}
      <div
        data-no-drag="true"
        className="relative z-20 flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {trail.length > 0 ? (
            <div className="club-glass-pill flex max-w-full items-center gap-1 px-2 py-1">
              <button
                type="button"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  onSelectTrailItem(trail[trail.length - 1], {
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                  })
                }}
                className="lab-pressable inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-white/[0.08] cursor-pointer"
                aria-label="Voltar para a referência anterior"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Anterior</span>
              </button>
              <span className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1 overflow-hidden">
                {trail.slice(-3).map((tItem) => (
                  <button
                    key={`trail-${tItem.id}`}
                    type="button"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      onSelectTrailItem(tItem, {
                        left: r.left,
                        top: r.top,
                        width: r.width,
                        height: r.height,
                      })
                    }}
                    aria-label={`Voltar para: ${tItem.title}`}
                    className="lab-pressable flex max-w-[120px] items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-ink-tertiary hover:bg-white/[0.06] hover:text-ink cursor-pointer"
                  >
                    <span className="h-4 w-4 shrink-0 overflow-hidden rounded-full border border-border-hover bg-elevated">
                      <PromptThumb src={tItem.thumbnailUrl} alt={tItem.title} fallbackLabel="·" />
                    </span>
                    <span className="truncate">{tItem.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="club-glass-pill inline-flex items-center gap-1.5 px-3 py-1 text-[11px] text-ink-secondary">
              <Sparkles className="h-3 w-3 text-tier-s" />
              <span>
                Colmeia espacial ·{' '}
                <span className="tabular-mono text-ink-tertiary">
                  {loadingNeighbors && neighbors.length === 0 ? '…' : neighbors.length} similares
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!isCenteredOnReference ? (
            <button
              type="button"
              onClick={() => snapToNode(nodes[0])}
              className="club-btn-ghost px-2.5 py-1 text-[11px] text-tier-s hover:text-tier-s-bright cursor-pointer"
            >
              <Compass className="h-3 w-3" />
              <span>Centralizar ref</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClearReference}
            className="club-btn-ghost px-2.5 py-1 text-[11px] text-ink-tertiary hover:text-ink cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
            <span>Remover</span>
          </button>

          <button
            type="button"
            onClick={onMinimizeToMap}
            className="club-btn-ghost px-3 py-1 text-[11px] cursor-pointer"
          >
            <Minimize2 className="h-3 w-3" />
            <span>Ver no mapa</span>
          </button>
        </div>
      </div>

      {/* Palco 2D Interativo (Apple Watch Honeycomb + Lente Gaussiana) */}
      <div
        ref={canvasAreaRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={(e) => finishCanvasDrag(e, false)}
        onPointerCancel={(e) => finishCanvasDrag(e, true)}
        className="honeycomb-lens-canvas relative my-1 flex-1 overflow-hidden select-none cursor-grab active:cursor-grabbing"
      >
        {/* Retículo discreto do centro da lente Fisheye */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: Math.round(layoutMetrics.cardRenderSize + 24),
            height: Math.round(layoutMetrics.cardRenderSize + 24),
          }}
        >
          <div className="h-full w-full rounded-[38px] border border-dashed border-hairline bg-radial from-white/[0.03] via-transparent to-transparent" />
        </div>

        {/* Estado vazio quando não há vizinhos */}
        {!loadingNeighbors && neighbors.length === 0 ? (
          <div
            data-no-drag="true"
            className="pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-dashed border-hairline bg-surface/95 px-4 py-1.5 text-[11px] text-ink-tertiary"
          >
            Nenhum ponto suficientemente similar encontrado para esta referência.
          </div>
        ) : null}

        {/* Nós da Colmeia renderizados em resolução nativa do centro (nítidos em scale=1.0) */}
        {nodes.map((node) => {
          const isCentered = node.id === lensFocusedId
          const tierMeta = TIER_COLOR_META[node.item.rarity.tier]
          const semPct = node.neighbor ? Math.round(node.neighbor.semanticSim * 100) : null
          const estPct = node.neighbor ? Math.round(node.neighbor.structuralSim * 100) : null

          return (
            <div
              key={node.id}
              ref={(el) => {
                if (el) outerRefs.current.set(node.id, el)
                else outerRefs.current.delete(node.id)
              }}
              data-centered={isCentered ? 'true' : 'false'}
              className="group/node honeycomb-node absolute top-1/2 left-1/2 will-change-transform"
              style={{
                width: layoutMetrics.cardRenderSize,
                height: layoutMetrics.cardRenderSize,
                marginLeft: -layoutMetrics.cardRenderSize * 0.5,
                marginTop: -layoutMetrics.cardRenderSize * 0.5,
              }}
            >
              <div
                ref={(el) => {
                  if (el) innerRefs.current.set(node.id, el)
                  else innerRefs.current.delete(node.id)
                }}
                className={[
                  'map-stage-card relative h-full w-full overflow-hidden rounded-[34px] border bg-surface',
                  node.isReference
                    ? 'border-tier-s/80 ring-1 ring-tier-s/30 shadow-2xl'
                    : isCentered
                      ? 'border-border-strong shadow-2xl'
                      : 'border-border-hover shadow-xl',
                ].join(' ')}
              >
                <button
                  ref={(el) => {
                    if (el) buttonRefs.current.set(node.id, el)
                    else buttonRefs.current.delete(node.id)
                  }}
                  type="button"
                  onPointerEnter={() => {
                    if (!node.isReference) onHoverNeighbor(node.id)
                  }}
                  onPointerLeave={() => {
                    if (!node.isReference) onHoverNeighbor(null)
                  }}
                  onFocus={(e) => {
                    if (e.target.matches(':focus-visible')) {
                      snapToNode(node, { instant: true })
                      onHoverNeighbor(node.isReference ? null : node.id)
                    }
                  }}
                  onClick={(e) => {
                    if (performance.now() < suppressClickUntilRef.current) {
                      e.preventDefault()
                      return
                    }
                    if (node.isReference) {
                      if (!isCentered) {
                        snapToNode(node)
                      } else {
                        onInspectItem(node.item)
                      }
                      return
                    }
                    if (node.neighbor) {
                      const r = e.currentTarget.getBoundingClientRect()
                      onFollowNeighbor(node.neighbor, {
                        left: r.left,
                        top: r.top,
                        width: r.width,
                        height: r.height,
                      })
                    }
                  }}
                  aria-label={
                    node.isReference
                      ? `Referência central: ${node.item.title}`
                      : `${node.item.title} · ${semPct}% similaridade semântica · Clique para tornar referência`
                  }
                  className="relative block h-full w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-tier-s focus-visible:outline-offset-[-3px]"
                >
                  <PromptThumb
                    src={node.item.thumbnailUrl}
                    alt={node.item.title}
                    loading="eager"
                    className="pointer-events-none h-full w-full object-cover select-none"
                  />

                  {/* Badge superior: REF ou Tier + Similaridade % */}
                  <div className="pointer-events-none absolute top-3 right-3 left-3 flex items-center justify-between gap-2">
                    {node.isReference ? (
                      <span className="tabular-mono rounded-full border border-tier-s/60 bg-canvas/90 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-tier-s-bright">
                        REF
                      </span>
                    ) : (
                      <span
                        className={[
                          'tabular-mono rounded-full border bg-canvas/90 px-2.5 py-0.5 text-[11px] font-medium',
                          tierMeta.badgeClass,
                        ].join(' ')}
                      >
                        {node.item.rarity.tier}
                      </span>
                    )}

                    {semPct !== null ? (
                      <span className="tabular-mono rounded-full border border-border-hover bg-canvas/90 px-2.5 py-0.5 text-[11px] font-medium text-tier-s">
                        {semPct}%
                      </span>
                    ) : null}
                  </div>

                  {/* Legenda inferior nítida */}
                  <div
                    className={[
                      'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/50 to-transparent px-3.5 pt-10 pb-3',
                      !node.isReference
                        ? 'group-hover/node:pr-20 group-focus-within/node:pr-20 group-data-[centered=true]/node:pr-20'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="truncate text-[13px] font-medium text-ink">
                      {node.item.title}
                    </div>
                    {node.isReference ? (
                      <div className="truncate font-mono text-[11px] text-ink-tertiary">
                        {node.item.project} · {node.item.rarity.tier}
                      </div>
                    ) : estPct !== null && isCentered ? (
                      <div className="tabular-mono truncate text-[11px] text-ink-tertiary">
                        EST {estPct}%
                      </div>
                    ) : null}
                  </div>
                </button>

                {/* Micro-ações rápidas ao focar/passar cursor (não iniciam arraste) */}
                {!node.isReference && node.neighbor ? (
                  <div
                    data-no-drag="true"
                    onClick={(e) => e.stopPropagation()}
                    className="honeycomb-node-actions absolute right-3 bottom-3 z-20 flex items-center gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPair(reference.id, node.item.id)}
                      aria-label={`Comparar par com ${node.item.title}`}
                      className="lab-pressable flex h-8 w-8 items-center justify-center rounded-xl border border-border-hover bg-canvas/90 text-tier-s hover:border-border-strong cursor-pointer"
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectItem(node.item)}
                      aria-label={`Inspecionar ${node.item.title}`}
                      className="lab-pressable flex h-8 w-8 items-center justify-center rounded-xl border border-border-hover bg-canvas/90 text-ink hover:border-border-strong hover:text-ink cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* HUD contextual da lente + dica de interação */}
      <div
        data-no-drag="true"
        className="relative z-20 flex flex-col items-center gap-1.5"
      >
        {focusedNode ? (
          <div className="club-glass-pill flex max-w-full flex-wrap items-center justify-center gap-2 px-3 py-1.5 shadow-2xl">
            {focusedNode.isReference ? (
              <>
                <span className="tabular-mono rounded-full border border-tier-s/35 bg-tier-s/12 px-2 py-0.5 text-[10px] font-medium text-tier-s-bright">
                  REFERÊNCIA CENTRAL
                </span>
                <span className="max-w-[180px] truncate text-[11px] font-medium text-ink sm:max-w-[260px]">
                  {focusedNode.item.title}
                </span>
                <button
                  type="button"
                  onClick={() => onInspectItem(focusedNode.item)}
                  className="lab-pressable inline-flex items-center gap-1 rounded-full border border-border-hover bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white/[0.12] cursor-pointer"
                >
                  <Maximize2 className="h-3 w-3 text-tier-s" />
                  <span>Inspecionar</span>
                </button>
              </>
            ) : focusedNode.neighbor ? (
              <>
                <span className="tabular-mono rounded-full border border-border-hover bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-tier-s">
                  SEM {Math.round(focusedNode.neighbor.semanticSim * 100)}% · EST{' '}
                  {Math.round(focusedNode.neighbor.structuralSim * 100)}%
                </span>
                <span className="max-w-[160px] truncate text-[11px] font-medium text-ink sm:max-w-[220px]">
                  {focusedNode.item.title}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const el = buttonRefs.current.get(focusedNode.id)
                    const r = el ? el.getBoundingClientRect() : null
                    onFollowNeighbor(
                      focusedNode.neighbor!,
                      r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
                    )
                  }}
                  className="lab-pressable inline-flex items-center gap-1 rounded-full bg-tier-s px-2.5 py-0.5 text-[10px] font-semibold text-canvas hover:brightness-105 cursor-pointer"
                >
                  <span>Tornar referência</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPair(reference.id, focusedNode.item.id)}
                  className="lab-pressable inline-flex items-center gap-1 rounded-full border border-border-hover bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white/[0.1] cursor-pointer"
                >
                  <GitCompare className="h-3 w-3 text-tier-s" />
                  <span>Comparar par</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="text-center text-[11px] text-ink-tertiary">
          arraste para explorar a colmeia · clique em um card para trocar a referência ·{' '}
          <kbd className="rounded border border-border-hover bg-white/[0.06] px-1.5 py-0.2 font-mono text-[10px] text-ink">
            Esc
          </kbd>{' '}
          para voltar
        </div>
      </div>
    </div>
  )
}
