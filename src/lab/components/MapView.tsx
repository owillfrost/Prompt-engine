import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Compass, Copy, Layers, MapPin, Maximize2, RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import { formatTagPt } from '../../core/promptTagsPt'
import { formatRarityLabel, QUADRANT_META } from '../../core/rarityEngine'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import { MapSimilarityStage, type FlyOriginRect } from './MapSimilarityStage'
import { PromptThumb } from './PromptThumb'
import {
  TIER_COLOR_META,
  getLabPaletteBundle,
  hexToRgba,
  pulseRingStroke,
  useLabPaletteId,
} from '../utils/themeTokens'
import {
  ATTRIBUTE_META,
  type MapClusterRegion,
  type MapPayload,
  type MapPointCompact,
  type MapPointsResponse,
  type MapVoidGapZone,
  type PromptDetailResponse,
  type PromptItem,
  type PromptNeighborDetail,
  type RarityQuadrant,
  type SourceLibFilter,
} from '../../types/promptEngine'

interface MapViewProps {
  mapData: MapPayload
  sourceLib: SourceLibFilter
  activeProjectFilter: string | 'all'
  onInspectItem: (item: PromptItem) => void
  onOpenPair: (idA: string, idB: string) => void
  onOpenGap: (gapId?: string) => void
}

type ProjectionMode = 'semantic' | 'structural' | 'engine'
type QuickFilter = 'all' | 'tier_s' | 'raro_maduro' | 'raro_imaturo'

interface LabEngineCluster extends MapClusterRegion {
  engineId: string
  family: string
  color: string
  description: string
  sharePct: number
}

interface LabEngineMapResponse {
  total: number
  clusters: LabEngineCluster[]
  points: Array<{ id: string; c: number; x: number; y: number; f?: string }>
}

const DIALECT_FALLBACK_LABEL: Record<string, string> = {
  fdr_v2: 'Power FDR v2.x',
  fdr_direct: 'FDR v1.3 Direct',
  nano_banana_g6: 'Nano Banana',
  studio_editorial_v5: 'Studio Editorial',
  body_mechanics_12block: 'Body Mechanics',
  latente_v02: 'Latente v0.2',
  numbered_sections: 'Seções',
  plain_prose: 'Prosa Natural',
  json_generic: 'JSON',
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? `${s[0].toUpperCase()}${s.slice(1)}` : s
}

const PULSE_DURATION_MS = 900

export const MapView: React.FC<MapViewProps> = ({
  mapData,
  sourceLib,
  activeProjectFilter,
  onInspectItem,
  onOpenPair,
  onOpenGap,
}) => {
  const paletteId = useLabPaletteId()
  const paletteBundle = useMemo(() => getLabPaletteBundle(paletteId), [paletteId])

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [viewportSize, setViewportSize] = useState({ w: 960, h: 640 })

  const [points, setPoints] = useState<MapPointCompact[]>([])
  const [loadingPoints, setLoadingPoints] = useState(true)
  const [pointsError, setPointsError] = useState<string | null>(null)
  const [reloadPointsNonce, setReloadPointsNonce] = useState(0)

  const [projection, setProjection] = useState<ProjectionMode>('semantic')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [engineData, setEngineData] = useState<LabEngineMapResponse | null>(null)
  const [engineScopeKey, setEngineScopeKey] = useState<string | null>(null)
  const [loadingEngine, setLoadingEngine] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const currentEngineScopeKey = `${sourceLib}::${activeProjectFilter}::${reloadPointsNonce}`

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.24)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.24 })
  cameraRef.current = { x: pan.x, y: pan.y, zoom }

  const dragRef = useRef<{
    dragging: boolean
    pointerId: number | null
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  }>({ dragging: false, pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false })

  const [hoveredPoint, setHoveredPoint] = useState<{
    pt: MapPointCompact
    sx: number
    sy: number
  } | null>(null)
  const [hoverThumbTarget, setHoverThumbTarget] = useState<{ id: string; sourceLib: string } | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<PromptDetailResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingNeighbors, setLoadingNeighbors] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const [trail, setTrail] = useState<PromptItem[]>([])
  const [hoveredNeighborId, setHoveredNeighborId] = useState<string | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [hoveredClusterId, setHoveredClusterId] = useState<number | null>(null)
  const [selectedVoidId, setSelectedVoidId] = useState<string | null>(null)
  const { copiedKey, copyText } = useCopyFeedback()

  const selectedUniqueTags = useMemo(() => {
    if (!selectedDetail) return []
    const item = selectedDetail.item
    const combined = [
      ...ATTRIBUTE_META.flatMap((m) => item.attributes[m.key]?.tags || []),
      ...(item.eagleTags || []),
    ].filter(Boolean)
    return Array.from(new Set(combined)).slice(0, 14)
  }, [selectedDetail])

  const pulseStateRef = useRef<{ clusterId: number; startTime: number } | null>(null)
  const pulseRafRef = useRef<number | null>(null)
  const flyRafRef = useRef<number | null>(null)
  const detailReqSeqRef = useRef(0)
  const explicitFlyOriginsRef = useRef<Record<string, FlyOriginRect>>({})
  const drawCanvasRef = useRef<(now?: number) => void>(() => {})

  const isEngineReady = projection === 'engine' && engineScopeKey === currentEngineScopeKey && Boolean(engineData)

  const engineClusterById = useMemo(() => {
    const map = new Map<number, LabEngineCluster>()
    if (engineScopeKey !== currentEngineScopeKey || !engineData) return map
    for (const c of engineData.clusters) {
      map.set(c.clusterId, c)
    }
    return map
  }, [engineData, engineScopeKey, currentEngineScopeKey])

  const enginePointById = useMemo(() => {
    const map = new Map<string, { x: number; y: number; cid: number; folder?: string }>()
    if (engineScopeKey !== currentEngineScopeKey || !engineData) return map
    for (const ep of engineData.points) {
      map.set(ep.id, { x: ep.x, y: ep.y, cid: ep.c, folder: ep.f })
    }
    return map
  }, [engineData, engineScopeKey, currentEngineScopeKey])

  const activeClusters: MapClusterRegion[] = useMemo(() => {
    if (projection === 'semantic') return mapData.clusters
    if (projection === 'structural') return mapData.structuralClusters
    return engineScopeKey === currentEngineScopeKey && engineData ? engineData.clusters : []
  }, [projection, mapData.clusters, mapData.structuralClusters, engineData, engineScopeKey, currentEngineScopeKey])

  const getClusterColor = useCallback(
    (clusterId: number): string =>
      paletteBundle.clusterAccentPalette[
        (Math.max(1, clusterId) - 1) % paletteBundle.clusterAccentPalette.length
      ],
    [paletteBundle]
  )

  const totalActiveClusterCount = useMemo(
    () => activeClusters.reduce((sum, c) => sum + c.count, 0),
    [activeClusters]
  )

  // Pré-carrega classificação Engine e subpasta em background para todas as projeções do /lab
  useEffect(() => {
    if (engineScopeKey === currentEngineScopeKey && engineData) return
    let active = true
    setLoadingEngine(true)
    setEngineError(null)
    const params = new URLSearchParams({ sourceLib, project: activeProjectFilter })
    fetch(`/api/lab-engine-map?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as LabEngineMapResponse
      })
      .then((data) => {
        if (!active) return
        setEngineData(data)
        setEngineScopeKey(currentEngineScopeKey)
        setLoadingEngine(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setEngineError(err instanceof Error ? err.message : 'Falha ao mapear engines.')
        setLoadingEngine(false)
      })
    return () => {
      active = false
    }
  }, [sourceLib, activeProjectFilter, currentEngineScopeKey, engineScopeKey, engineData])

  // Carrega miniatura apenas para o ponto sob o cursor após 60ms para evitar floods ao varrer clusters
  const hoveredId = hoveredPoint?.pt.id ?? null
  const hoveredSourceLib = hoveredPoint?.pt.sourceLib ?? null
  useEffect(() => {
    if (!hoveredId || !hoveredSourceLib || stageOpen) {
      setHoverThumbTarget(null)
      return
    }
    const timer = window.setTimeout(() => {
      setHoverThumbTarget({ id: hoveredId, sourceLib: hoveredSourceLib })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [hoveredId, hoveredSourceLib, stageOpen])

  // Busca os pontos do SQLite em RAM via /api/map-points
  useEffect(() => {
    let active = true
    setLoadingPoints(true)
    setPointsError(null)
    const params = new URLSearchParams({ sourceLib, project: activeProjectFilter })
    fetch(`/api/map-points?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as MapPointsResponse
      })
      .then((data) => {
        if (!active) return
        setPoints(data.points || [])
        setLoadingPoints(false)
      })
      .catch((err: unknown) => {
        if (!active) return
        setPointsError(err instanceof Error ? err.message : 'Falha ao carregar nuvem de pontos.')
        setLoadingPoints(false)
      })
    return () => {
      active = false
    }
  }, [sourceLib, activeProjectFilter, reloadPointsNonce])

  const getPointCoords = useCallback(
    (p: MapPointCompact) => {
      if (projection === 'engine') {
        const ep = enginePointById.get(p.id)
        if (ep) return ep
        return { x: p.structX, y: p.structY, cid: 0 }
      }
      return projection === 'semantic'
        ? { x: p.x, y: p.y, cid: p.clusterId }
        : { x: p.structX, y: p.structY, cid: p.structClusterId }
    },
    [projection, enginePointById]
  )

  const resolveItemCoords = useCallback(
    (item: {
      id: string
      x?: number
      y?: number
      structX?: number
      structY?: number
      mapClusterId?: number | null
      structClusterId?: number | null
    }) => {
      if (projection === 'engine') {
        const ep = enginePointById.get(item.id)
        if (ep) return { x: ep.x, y: ep.y, cid: ep.cid }
        return { x: item.structX ?? 0, y: item.structY ?? 0, cid: null }
      }
      return projection === 'semantic'
        ? { x: item.x ?? 0, y: item.y ?? 0, cid: item.mapClusterId ?? null }
        : { x: item.structX ?? 0, y: item.structY ?? 0, cid: item.structClusterId ?? null }
    },
    [projection, enginePointById]
  )

  const stageOpenRef = useRef(stageOpen)
  stageOpenRef.current = stageOpen

  const cancelFlyTo = useCallback(() => {
    if (flyRafRef.current !== null) {
      cancelAnimationFrame(flyRafRef.current)
      flyRafRef.current = null
    }
  }, [])

  // Limpa animação de voo ao desmontar
  useEffect(() => () => cancelFlyTo(), [cancelFlyTo])

  // Reseta seleção quando escopo de biblioteca/projeto muda
  useEffect(() => {
    cancelFlyTo()
    detailReqSeqRef.current += 1
    setSelectedDetail(null)
    setStageOpen(false)
    setTrail([])
    setHoveredNeighborId(null)
    setSelectedClusterId(null)
    setSelectedVoidId(null)
  }, [sourceLib, activeProjectFilter, cancelFlyTo])

  const fitMapToViewport = useCallback(
    (clustersToFit: MapClusterRegion[]) => {
      if (clustersToFit.length === 0) return
      cancelFlyTo()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const c of clustersToFit) {
        minX = Math.min(minX, c.cx - c.radius)
        maxX = Math.max(maxX, c.cx + c.radius)
        minY = Math.min(minY, c.cy - c.radius)
        maxY = Math.max(maxY, c.cy + c.radius)
      }
      const spanW = Math.max(500, maxX - minX)
      const spanH = Math.max(500, maxY - minY)
      const nextZoom = Math.max(
        0.1,
        Math.min(0.75, Math.min((viewportSize.w * 0.78) / spanW, (viewportSize.h * 0.7) / spanH))
      )
      const midX = (minX + maxX) * 0.5
      const midY = (minY + maxY) * 0.5
      setZoom(Number(nextZoom.toFixed(4)))
      setPan({ x: -midX * nextZoom, y: -midY * nextZoom - 12 })
    },
    [viewportSize.h, viewportSize.w, cancelFlyTo]
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setViewportSize({
        w: Math.max(320, Math.round(rect.width)),
        h: Math.max(320, Math.round(rect.height)),
      })
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Resize canvas backing store apenas quando viewport muda
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(viewportSize.w * dpr)
    canvas.height = Math.round(viewportSize.h * dpr)
  }, [viewportSize])

  useEffect(() => {
    fitMapToViewport(activeClusters)
  }, [projection, activeClusters, fitMapToViewport])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (stageOpenRef.current) return
      if ((e.target as HTMLElement | null)?.closest('[data-map-interactive="true"]')) return
      e.preventDefault()
      cancelFlyTo()
      const rect = el.getBoundingClientRect()
      const curr = cameraRef.current
      const factor = e.deltaY < 0 ? 1.16 : 0.86
      const nextZoom = Math.max(0.08, Math.min(3.0, Number((curr.zoom * factor).toFixed(4))))
      const mx = e.clientX - rect.left - rect.width * 0.5
      const my = e.clientY - rect.top - rect.height * 0.5
      const wx = (mx - curr.x) / curr.zoom
      const wy = (my - curr.y) / curr.zoom
      setZoom(nextZoom)
      setPan({ x: mx - wx * nextZoom, y: my - wy * nextZoom })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cancelFlyTo])

  const flyTo = useCallback(
    (wx: number, wy: number, targetZoom: number) => {
      cancelFlyTo()
      const targetPanX = -wx * targetZoom
      const targetPanY = -wy * targetZoom
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (reduced) {
        setZoom(targetZoom)
        setPan({ x: targetPanX, y: targetPanY })
        return
      }

      const start = { ...cameraRef.current }
      const durationMs = 280
      const startTime = performance.now()

      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs)
        const eased = 1 - Math.pow(1 - t, 3)
        const z = start.zoom + (targetZoom - start.zoom) * eased
        const px = start.x + (targetPanX - start.x) * eased
        const py = start.y + (targetPanY - start.y) * eased
        setZoom(Number(z.toFixed(4)))
        setPan({ x: px, y: py })
        if (t < 1) {
          flyRafRef.current = requestAnimationFrame(tick)
        } else {
          flyRafRef.current = null
        }
      }

      flyRafRef.current = requestAnimationFrame(tick)
    },
    [cancelFlyTo]
  )

  const toScreenX = useCallback(
    (wx: number) => viewportSize.w * 0.5 + pan.x + wx * zoom,
    [viewportSize.w, pan.x, zoom]
  )
  const toScreenY = useCallback(
    (wy: number) => viewportSize.h * 0.5 + pan.y + wy * zoom,
    [viewportSize.h, pan.y, zoom]
  )

  const getPointOriginRect = useCallback(
    (item: { id: string; x?: number; y?: number; structX?: number; structY?: number }): FlyOriginRect => {
      const vpRect = viewportRef.current?.getBoundingClientRect()
      const c = resolveItemCoords(item)
      const sx = toScreenX(c.x)
      const sy = toScreenY(c.y)
      const size = 40
      return {
        left: (vpRect ? vpRect.left : 0) + sx - size * 0.5,
        top: (vpRect ? vpRect.top : 0) + sy - size * 0.5,
        width: size,
        height: size,
      }
    },
    [resolveItemCoords, toScreenX, toScreenY]
  )

  const matchingIdSet = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const hasFilter = quickFilter !== 'all' || Boolean(q)
    if (!hasFilter) return null
    const set = new Set<string>()
    for (const p of points) {
      if (quickFilter === 'tier_s' && p.tier !== 'S') continue
      if (quickFilter === 'raro_maduro' && p.quadrant !== 'raro_maduro') continue
      if (quickFilter === 'raro_imaturo' && p.quadrant !== 'raro_imaturo') continue
      if (q) {
        const hay = `${p.title} ${p.project} ${p.dialect}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      set.add(p.id)
    }
    return set
  }, [points, quickFilter, searchQuery])

  const selectedVoid: MapVoidGapZone | null = useMemo(
    () => mapData.voidZones.find((v) => v.id === selectedVoidId) || null,
    [mapData.voidZones, selectedVoidId]
  )

  const selectPromptById = useCallback(
    (
      id: string,
      opts?: {
        openStage?: boolean
        originRect?: FlyOriginRect | null
        optimisticItem?: PromptItem
        pushTrail?: PromptItem | null
        resetTrail?: boolean
      }
    ) => {
      const reqSeq = ++detailReqSeqRef.current
      setSelectedVoidId(null)
      setHoveredPoint(null)

      if (opts?.originRect) {
        explicitFlyOriginsRef.current[id] = opts.originRect
      }
      if (opts?.resetTrail) {
        setTrail([])
      } else if (opts?.pushTrail) {
        const prevRef = opts.pushTrail
        setTrail((prev) => {
          const deduped = prev.filter((p) => p.id !== prevRef.id && p.id !== id)
          return [...deduped, prevRef].slice(-6)
        })
      }

      if (opts?.optimisticItem) {
        setSelectedDetail({ item: opts.optimisticItem, neighbors: [] })
        setLoadingDetail(false)
        setLoadingNeighbors(true)
        if (opts.openStage !== false) {
          setStageOpen(true)
        }
      } else {
        setLoadingDetail(true)
        setLoadingNeighbors(true)
      }

      const params = new URLSearchParams({ limit: '18', sourceLib })
      fetch(`/api/prompt/${encodeURIComponent(id)}?${params.toString()}`)
        .then((r) => (r.ok ? (r.json() as Promise<PromptDetailResponse>) : Promise.reject(new Error('404'))))
        .then((detail) => {
          if (reqSeq !== detailReqSeqRef.current) return
          setSelectedDetail(detail)
          setLoadingDetail(false)
          setLoadingNeighbors(false)
          if (opts?.openStage !== false) {
            setStageOpen(true)
          }
        })
        .catch(() => {
          if (reqSeq !== detailReqSeqRef.current) return
          setLoadingDetail(false)
          setLoadingNeighbors(false)
        })
    },
    [sourceLib]
  )

  const handleFollowNeighbor = useCallback(
    (nb: PromptNeighborDetail, cardRect: FlyOriginRect | null) => {
      const prevRef = selectedDetail?.item ?? null
      const coords = resolveItemCoords(nb.item)

      if (coords.cid !== null) {
        setSelectedClusterId(coords.cid)
      }
      flyTo(coords.x, coords.y, Math.max(cameraRef.current.zoom, 0.56))
      selectPromptById(nb.item.id, {
        openStage: true,
        originRect: cardRect,
        optimisticItem: nb.item,
        pushTrail: prevRef,
      })
    },
    [selectedDetail, resolveItemCoords, flyTo, selectPromptById]
  )

  const handleSelectTrailItem = useCallback(
    (item: PromptItem, cardRect: FlyOriginRect | null) => {
      const coords = resolveItemCoords(item)

      setTrail((prev) => {
        const idx = prev.findIndex((p) => p.id === item.id)
        return idx >= 0 ? prev.slice(0, idx) : prev
      })
      if (coords.cid !== null) {
        setSelectedClusterId(coords.cid)
      }
      flyTo(coords.x, coords.y, Math.max(cameraRef.current.zoom, 0.56))
      selectPromptById(item.id, {
        openStage: true,
        originRect: cardRect,
        optimisticItem: item,
      })
    },
    [resolveItemCoords, flyTo, selectPromptById]
  )

  const handleMinimizeToMap = useCallback(() => {
    setStageOpen(false)
    setHoveredNeighborId(null)
    requestAnimationFrame(() => {
      viewportRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const handleClearReference = useCallback(() => {
    detailReqSeqRef.current += 1
    setStageOpen(false)
    setSelectedDetail(null)
    setSelectedClusterId(null)
    setTrail([])
    setHoveredNeighborId(null)
    setLoadingDetail(false)
    setLoadingNeighbors(false)
    requestAnimationFrame(() => {
      viewportRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const neighborIdSet = useMemo(() => {
    if (!selectedDetail) return new Set<string>()
    return new Set(selectedDetail.neighbors.map((n) => n.item.id))
  }, [selectedDetail])

  // Renderização de 22.282 pontos no <canvas> 2D a 60 FPS
  const drawCanvas = useCallback(
    (now: number = performance.now()) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, viewportSize.w, viewportSize.h)

      if (projection === 'engine' && !isEngineReady) {
        return
      }

      // 1. Regiões dos Clusters
      for (const c of activeClusters) {
        const sx = toScreenX(c.cx)
        const sy = toScreenY(c.cy)
        const rPx = c.radius * zoom
        if (sx + rPx < -60 || sx - rPx > viewportSize.w + 60 || sy + rPx < -60 || sy - rPx > viewportSize.h + 60) {
          continue
        }
        const isActive = selectedClusterId === c.clusterId
        const accent = getClusterColor(c.clusterId)
        ctx.beginPath()
        ctx.arc(sx, sy, rPx, 0, Math.PI * 2)
        ctx.fillStyle = hexToRgba(accent, isActive ? 0.085 : 0.024)
        ctx.fill()
        ctx.lineWidth = isActive ? 1.5 : 1
        ctx.strokeStyle = hexToRgba(accent, isActive ? 0.68 : 0.25)
        ctx.stroke()
      }

      // 2. Manchas Vazias (Void Gap Zones) na projeção semântica
      if (projection === 'semantic') {
        ctx.save()
        ctx.setLineDash([4, 4])
        for (const vz of mapData.voidZones) {
          const sx = toScreenX(vz.x)
          const sy = toScreenY(vz.y)
          const rPx = vz.radius * zoom
          const isSel = selectedVoidId === vz.id
          ctx.beginPath()
          ctx.arc(sx, sy, rPx, 0, Math.PI * 2)
          ctx.fillStyle = isSel
            ? paletteBundle.mapCanvasColors.voidFillSelected
            : paletteBundle.mapCanvasColors.voidFillIdle
          ctx.fill()
          ctx.lineWidth = isSel ? 1.5 : 1
          ctx.strokeStyle = isSel
            ? paletteBundle.mapCanvasColors.voidStrokeSelected
            : paletteBundle.mapCanvasColors.voidStrokeIdle
          ctx.stroke()
        }
        ctx.restore()
      }

      // 3. Pontos em lotes rápidos por cluster (dimmed / B-D / Tier A / Tier S)
      const dotR = Math.max(1.3, Math.min(4.2, zoom * 6.5))
      const dotRA = Math.max(1.5, Math.min(4.5, zoom * 7.0))
      const dotRS = Math.max(2.1, Math.min(5.2, zoom * 8.2))
      const selectedId = selectedDetail?.item.id || null

      // Dimmed points
      ctx.fillStyle = paletteBundle.mapCanvasColors.dimmedPoint
      ctx.beginPath()
      for (const p of points) {
        const { x, y, cid } = getPointCoords(p)
        const sx = toScreenX(x)
        const sy = toScreenY(y)
        if (sx < -6 || sx > viewportSize.w + 6 || sy < -6 || sy > viewportSize.h + 6) continue
        const isMatched = !matchingIdSet || matchingIdSet.has(p.id)
        const clusterOk = selectedClusterId === null || selectedClusterId === cid
        if (!isMatched || !clusterOk) {
          ctx.moveTo(sx + dotR, sy)
          ctx.arc(sx, sy, dotR, 0, Math.PI * 2)
        }
      }
      ctx.fill()

      const baseByCid = new Map<number, number[]>()
      const tierAByCid = new Map<number, number[]>()
      for (const p of points) {
        if (p.tier === 'S' || p.id === selectedId || neighborIdSet.has(p.id)) continue
        const { x, y, cid } = getPointCoords(p)
        const sx = toScreenX(x)
        const sy = toScreenY(y)
        if (sx < -6 || sx > viewportSize.w + 6 || sy < -6 || sy > viewportSize.h + 6) continue
        const isMatched = !matchingIdSet || matchingIdSet.has(p.id)
        const clusterOk = selectedClusterId === null || selectedClusterId === cid
        if (!isMatched || !clusterOk) continue
        const bucketMap = p.tier === 'A' ? tierAByCid : baseByCid
        let arr = bucketMap.get(cid)
        if (!arr) {
          arr = []
          bucketMap.set(cid, arr)
        }
        arr.push(sx, sy)
      }
      for (const [cid, coords] of baseByCid.entries()) {
        ctx.fillStyle = hexToRgba(getClusterColor(cid), 0.56)
        ctx.beginPath()
        for (let i = 0; i < coords.length; i += 2) {
          ctx.moveTo(coords[i] + dotR, coords[i + 1])
          ctx.arc(coords[i], coords[i + 1], dotR, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      for (const [cid, coords] of tierAByCid.entries()) {
        ctx.fillStyle = hexToRgba(getClusterColor(cid), 0.88)
        ctx.beginPath()
        for (let i = 0; i < coords.length; i += 2) {
          ctx.moveTo(coords[i] + dotRA, coords[i + 1])
          ctx.arc(coords[i], coords[i + 1], dotRA, 0, Math.PI * 2)
        }
        ctx.fill()
      }

      // Active Tier S points
      ctx.fillStyle = paletteBundle.tierHex.S
      ctx.beginPath()
      for (const p of points) {
        if (p.tier !== 'S' || p.id === selectedId || neighborIdSet.has(p.id)) continue
        const { x, y, cid } = getPointCoords(p)
        const sx = toScreenX(x)
        const sy = toScreenY(y)
        if (sx < -6 || sx > viewportSize.w + 6 || sy < -6 || sy > viewportSize.h + 6) continue
        const isMatched = !matchingIdSet || matchingIdSet.has(p.id)
        const clusterOk = selectedClusterId === null || selectedClusterId === cid
        if (isMatched && clusterOk) {
          ctx.moveTo(sx + dotRS, sy)
          ctx.arc(sx, sy, dotRS, 0, Math.PI * 2)
        }
      }
      ctx.fill()

      // 3b. Pulso dourado em anéis expansivos nos pontos Tier S do cluster selecionado
      const pulse = pulseStateRef.current
      if (pulse && pulse.clusterId === selectedClusterId) {
        const elapsed = Math.max(0, now - pulse.startTime)
        const progress = Math.min(1, elapsed / PULSE_DURATION_MS)
        if (progress < 1) {
          const pulseCoords: Array<[number, number]> = []
          for (const p of points) {
            if (p.tier !== 'S') continue
            const { x, y, cid } = getPointCoords(p)
            if (cid !== pulse.clusterId) continue
            if (matchingIdSet && !matchingIdSet.has(p.id)) continue
            const sx = toScreenX(x)
            const sy = toScreenY(y)
            if (sx < -32 || sx > viewportSize.w + 32 || sy < -32 || sy > viewportSize.h + 32) continue
            pulseCoords.push([sx, sy])
          }

          if (pulseCoords.length > 0) {
            const rings = [
              {
                radius: dotRS + 3 + (1 - Math.pow(1 - progress, 3)) * 18,
                alpha: (1 - progress) * 0.85,
                lineWidth: Math.max(1, 1.8 * (1 - progress * 0.5)),
              },
            ]
            if (progress > 0.18) {
              const subProgress = (progress - 0.18) / 0.82
              rings.push({
                radius: dotRS + 2 + (1 - Math.pow(1 - subProgress, 3)) * 14,
                alpha: (1 - subProgress) * 0.45,
                lineWidth: 1,
              })
            }

            ctx.save()
            for (const ring of rings) {
              ctx.strokeStyle = pulseRingStroke(ring.alpha, paletteBundle.mapCanvasColors.pulseRgb)
              ctx.lineWidth = ring.lineWidth
              ctx.beginPath()
              for (const [sx, sy] of pulseCoords) {
                ctx.moveTo(sx + ring.radius, sy)
                ctx.arc(sx, sy, ring.radius, 0, Math.PI * 2)
              }
              ctx.stroke()
            }
            ctx.restore()
          }
        }
      }

      // 4. Ponto selecionado + marcadores e linhas para vizinhos (substitui miniaturas no canvas)
      if (selectedDetail) {
        const selPt = points.find((p) => p.id === selectedDetail.item.id)
        const sc = selPt ? getPointCoords(selPt) : resolveItemCoords(selectedDetail.item)
        const ax = toScreenX(sc.x)
        const ay = toScreenY(sc.y)

        if (selectedDetail.neighbors.length > 0) {
          ctx.save()
          ctx.strokeStyle = paletteBundle.mapCanvasColors.neighborLine
          ctx.lineWidth = 1.2
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          for (const nb of selectedDetail.neighbors) {
            const nbc = resolveItemCoords(nb.item)
            ctx.moveTo(ax, ay)
            ctx.lineTo(toScreenX(nbc.x), toScreenY(nbc.y))
          }
          ctx.stroke()
          ctx.restore()

          const nbRadius = dotRS + 1.1
          ctx.save()
          ctx.fillStyle = paletteBundle.mapCanvasColors.neighborFill
          ctx.strokeStyle = paletteBundle.mapCanvasColors.pointStroke
          ctx.lineWidth = 1.5
          for (const nb of selectedDetail.neighbors) {
            const nbc = resolveItemCoords(nb.item)
            const nx = toScreenX(nbc.x)
            const ny = toScreenY(nbc.y)
            ctx.beginPath()
            ctx.arc(nx, ny, nbRadius, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
          ctx.restore()
        }

        ctx.save()
        ctx.beginPath()
        ctx.arc(ax, ay, dotRS + 4.5, 0, Math.PI * 2)
        ctx.strokeStyle = paletteBundle.mapCanvasColors.selectedHalo
        ctx.lineWidth = 1.6
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(ax, ay, dotRS + 1.6, 0, Math.PI * 2)
        ctx.fillStyle = paletteBundle.mapCanvasColors.selectedFill
        ctx.strokeStyle = paletteBundle.mapCanvasColors.pointStroke
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    },
    [
      paletteBundle,
      points,
      activeClusters,
      mapData.voidZones,
      projection,
      isEngineReady,
      getClusterColor,
      viewportSize,
      zoom,
      toScreenX,
      toScreenY,
      getPointCoords,
      resolveItemCoords,
      matchingIdSet,
      selectedClusterId,
      selectedVoidId,
      selectedDetail,
      neighborIdSet,
    ]
  )

  drawCanvasRef.current = drawCanvas

  useEffect(() => {
    if (pulseRafRef.current !== null) {
      cancelAnimationFrame(pulseRafRef.current)
      pulseRafRef.current = null
    }
    if (selectedClusterId === null) {
      pulseStateRef.current = null
      return
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      pulseStateRef.current = null
      return
    }

    const startTime = performance.now()
    pulseStateRef.current = { clusterId: selectedClusterId, startTime }

    const tick = (now: number) => {
      const pulse = pulseStateRef.current
      if (!pulse || pulse.clusterId !== selectedClusterId) {
        pulseRafRef.current = null
        return
      }
      const elapsed = now - pulse.startTime
      if (elapsed >= PULSE_DURATION_MS) {
        pulseStateRef.current = null
        pulseRafRef.current = null
        drawCanvasRef.current(now)
        return
      }
      drawCanvasRef.current(now)
      pulseRafRef.current = requestAnimationFrame(tick)
    }

    pulseRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (pulseRafRef.current !== null) {
        cancelAnimationFrame(pulseRafRef.current)
        pulseRafRef.current = null
      }
      pulseStateRef.current = null
    }
  }, [selectedClusterId])

  useEffect(() => {
    drawCanvas(performance.now())
  }, [drawCanvas])

  const hitTestPoint = useCallback(
    (clientX: number, clientY: number): { pt: MapPointCompact; sx: number; sy: number } | null => {
      const el = viewportRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const wx = (mx - viewportSize.w * 0.5 - pan.x) / zoom
      const wy = (my - viewportSize.h * 0.5 - pan.y) / zoom
      const maxWorldDist = 14 / zoom
      let best: MapPointCompact | null = null
      let bestDist = maxWorldDist

      for (const p of points) {
        const c = getPointCoords(p)
        const d = Math.hypot(c.x - wx, c.y - wy)
        if (d < bestDist) {
          bestDist = d
          best = p
        }
      }
      if (!best) return null
      const c = getPointCoords(best)
      return { pt: best, sx: toScreenX(c.x), sy: toScreenY(c.y) }
    },
    [points, getPointCoords, viewportSize.w, viewportSize.h, pan.x, pan.y, zoom, toScreenX, toScreenY]
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stageOpen) return
    if ((e.target as HTMLElement).closest('[data-map-interactive="true"]')) return
    cancelFlyTo()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      dragging: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: cameraRef.current.x,
      origY: cameraRef.current.y,
      moved: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stageOpen) return
    if (dragRef.current.dragging && dragRef.current.pointerId === e.pointerId) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true
      setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
      setHoveredPoint(null)
      return
    }
    if ((e.target as HTMLElement | null)?.closest('[data-map-interactive="true"]')) {
      setHoveredPoint(null)
      return
    }
    const hit = hitTestPoint(e.clientX, e.clientY)
    setHoveredPoint(hit)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || dragRef.current.pointerId !== e.pointerId) return
    const wasClick = !dragRef.current.moved
    dragRef.current.dragging = false
    dragRef.current.pointerId = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!wasClick) return

    const hit = hitTestPoint(e.clientX, e.clientY)
    if (hit) {
      const c = getPointCoords(hit.pt)
      setSelectedClusterId(c.cid)
      const vpRect = viewportRef.current?.getBoundingClientRect()
      const originRect: FlyOriginRect | null = vpRect
        ? { left: vpRect.left + hit.sx - 18, top: vpRect.top + hit.sy - 18, width: 36, height: 36 }
        : null
      selectPromptById(hit.pt.id, { openStage: true, originRect, resetTrail: true })
      return
    }

    // Verifica se clicou em uma mancha vazia (Void Gap Zone)
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect && projection === 'semantic') {
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const wx = (mx - viewportSize.w * 0.5 - pan.x) / zoom
      const wy = (my - viewportSize.h * 0.5 - pan.y) / zoom
      const hitVoid = mapData.voidZones.find((vz) => Math.hypot(vz.x - wx, vz.y - wy) <= vz.radius)
      if (hitVoid) {
        setSelectedVoidId(hitVoid.id)
        setSelectedDetail(null)
        setStageOpen(false)
        setTrail([])
        setSelectedClusterId(null)
        return
      }
    }

    setSelectedDetail(null)
    setStageOpen(false)
    setTrail([])
    setHoveredNeighborId(null)
    setSelectedClusterId(null)
    setSelectedVoidId(null)
  }

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col lg:h-[calc(100dvh-56px)] lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline bg-canvas px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="section-eyebrow">
              Mapa Espacial · {points.length.toLocaleString('pt-BR')} Pontos (60 FPS)
            </span>
            <h1 className="text-[14px] font-medium text-ink">
              {projection === 'engine'
                ? 'Engines & Linhagens de Construção (Obsidian)'
                : projection === 'semantic'
                  ? 'Clusters Semânticos & Manchas Vazias (Gaps)'
                  : 'Clusters Estruturais & Arquiteturas de Formato'}
            </h1>
          </div>

          <div className="inline-flex gap-0.5 rounded-xl border border-hairline bg-canvas p-0.5">
            {(
              [
                { id: 'semantic', label: 'Semântica' },
                { id: 'structural', label: 'Estrutural' },
                { id: 'engine', label: 'Engine' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-active={projection === opt.id}
                onClick={() => {
                  setProjection(opt.id)
                  setSelectedClusterId(null)
                  setSelectedVoidId(null)
                }}
                className="btn-ghost min-h-[28px] rounded-lg px-2.5 py-1 text-[11px]"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'tier_s', label: 'Tier S' },
                { id: 'raro_maduro', label: 'Raro + Maduro' },
                { id: 'raro_imaturo', label: 'Raro + Imaturo' },
              ] as const
            ).map((f) => {
              const active = quickFilter === f.id
              const isS = f.id === 'tier_s'
              return (
                <button
                  key={f.id}
                  type="button"
                  data-active={active}
                  onClick={() => setQuickFilter(f.id)}
                  className={[
                    'btn-ghost min-h-[28px] rounded-lg px-2 py-1 text-[11px]',
                    active && isS ? TIER_COLOR_META.S.badgeClass : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-44 sm:w-52 xl:w-60">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Localizar nos pontos..."
              className="w-full rounded-xl border border-hairline bg-canvas py-1.5 pr-2.5 pl-8 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:border-border-hover focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => fitMapToViewport(activeClusters)}
            className="btn-secondary min-h-[32px] px-2.5 text-[11px]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Enquadrar mapa</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={viewportRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !stageOpen && (selectedDetail || selectedVoidId)) {
              handleClearReference()
              setSelectedVoidId(null)
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHoveredPoint(null)}
          className={[
            'relative min-h-[360px] flex-1 overflow-hidden bg-canvas select-none focus:outline-none lg:min-h-0',
            stageOpen ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          ].join(' ')}
        >
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {/* Rótulos com culling por colisão (ocultos quando palco focado está aberto) */}
          {!stageOpen
            ? (() => {
                const ordered = [...activeClusters].sort((a, b) => {
                  const pa = a.clusterId === selectedClusterId ? 2 : a.clusterId === hoveredClusterId ? 1 : 0
                  const pb = b.clusterId === selectedClusterId ? 2 : b.clusterId === hoveredClusterId ? 1 : 0
                  if (pa !== pb) return pb - pa
                  return b.count - a.count
                })
                const placed: Array<{ l: number; r: number; t: number; b: number }> = []
                return ordered.map((c) => {
                  const sx = toScreenX(c.cx)
                  const sy = toScreenY(c.cy - c.radius)
                  if (sx < -120 || sx > viewportSize.w + 120 || sy < -30 || sy > viewportSize.h + 30) {
                    return null
                  }
                  const isPriority = c.clusterId === selectedClusterId || c.clusterId === hoveredClusterId
                  const maxW = isPriority
                    ? 240
                    : Math.max(195, Math.min(220, Math.round(c.radius * zoom * 2.15)))
                  const pillTop = sy - 24
                  const rect = {
                    l: sx - maxW * 0.5 - 6,
                    r: sx + maxW * 0.5 + 6,
                    t: pillTop - 12,
                    b: pillTop + 14,
                  }
                  const collides =
                    !isPriority &&
                    placed.some((p) => !(rect.r < p.l || rect.l > p.r || rect.b < p.t || rect.t > p.b))
                  if (collides) return null
                  placed.push(rect)

                  const engCluster = projection === 'engine' ? engineClusterById.get(c.clusterId) : undefined
                  const accentColor = getClusterColor(c.clusterId)

                  return (
                    <button
                      key={`lbl-${c.clusterId}`}
                      type="button"
                      data-map-interactive="true"
                      onMouseEnter={() => setHoveredClusterId(c.clusterId)}
                      onMouseLeave={() => setHoveredClusterId((prev) => (prev === c.clusterId ? null : prev))}
                      onClick={() => {
                        setSelectedClusterId(c.clusterId)
                        setSelectedVoidId(null)
                        flyTo(c.cx, c.cy, Math.max(0.45, zoom))
                      }}
                      style={{
                        left: sx,
                        top: pillTop,
                        maxWidth: maxW,
                        borderColor: isPriority ? hexToRgba(accentColor, 0.72) : undefined,
                      }}
                      className={[
                        'absolute inline-flex items-center gap-1.5 -translate-x-1/2 truncate rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-[opacity,border-color,color] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] cursor-pointer',
                        isPriority
                          ? 'z-20 border-border-hover bg-elevated/95 text-ink shadow-lg'
                          : 'border-hairline bg-surface/90 text-ink-secondary hover:border-border-hover hover:text-ink',
                      ].join(' ')}
                      aria-label={
                        engCluster
                          ? `${engCluster.label} · ${engCluster.family} (${engCluster.count.toLocaleString('pt-BR')} · ${engCluster.sharePct}%)`
                          : `${c.label} (${c.count.toLocaleString('pt-BR')})`
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: accentColor }}
                      />
                      <span className="truncate">
                        {c.label} ({c.count})
                      </span>
                    </button>
                  )
                })
              })()
            : null}

          {/* Pins Territoriais das Manchas Vazias (visíveis em zoom ≥ 0.22 ou quando selecionado) */}
          {!stageOpen && projection === 'semantic'
            ? mapData.voidZones.map((vz) => {
                const isSelected = selectedVoidId === vz.id
                if (zoom < 0.22 && !isSelected) return null
                const sx = toScreenX(vz.x)
                const sy = toScreenY(vz.y)
                if (sx < -60 || sx > viewportSize.w + 60 || sy < -60 || sy > viewportSize.h + 60) return null
                return (
                  <button
                    key={`vz-${vz.id}`}
                    type="button"
                    data-map-interactive="true"
                    aria-label={`${vz.label} · ${formatTagPt(vz.tagA)} × ${formatTagPt(vz.tagB)}`}
                    onClick={() => {
                      setSelectedVoidId(vz.id)
                      setSelectedDetail(null)
                      setStageOpen(false)
                      setTrail([])
                      setHoveredNeighborId(null)
                      setSelectedClusterId(null)
                      flyTo(vz.x, vz.y, Math.max(0.55, zoom))
                    }}
                    style={{ left: sx, top: sy }}
                    className={[
                      'press-scale absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-0.5 font-mono text-[9px] font-medium tracking-wide transition-colors cursor-pointer',
                      isSelected
                        ? 'z-20 border-tier-s bg-tier-s/18 text-tier-s-bright shadow-md'
                        : 'border-tier-s/60 bg-canvas/90 text-tier-s hover:border-tier-s hover:bg-tier-s/10',
                    ].join(' ')}
                  >
                    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-tier-s" />
                    </span>
                    <span>GAP · E={vz.expectedCount}</span>
                  </button>
                )
              })
            : null}

          {/* Hover Tooltip (Wireframe: miniatura à esquerda + Rank/Tier, "Mais raro que %" e Engine + Pasta) */}
          {!stageOpen && hoveredPoint && !dragRef.current.dragging ? (
            (() => {
              const CARD_W = 300
              const CARD_H = 104
              const preferRight = hoveredPoint.sx + 16 + CARD_W <= viewportSize.w - 12
              const left = preferRight ? hoveredPoint.sx + 16 : Math.max(12, hoveredPoint.sx - CARD_W - 16)
              const top = Math.max(12, Math.min(viewportSize.h - CARD_H - 12, hoveredPoint.sy - CARD_H * 0.5))

              const ep = enginePointById.get(hoveredPoint.pt.id)
              const engCluster = ep ? engineClusterById.get(ep.cid) : undefined
              const engineLabel =
                engCluster?.label ||
                DIALECT_FALLBACK_LABEL[hoveredPoint.pt.dialect] ||
                hoveredPoint.pt.format.toUpperCase()
              const engineColor = ep ? getClusterColor(ep.cid) : paletteBundle.mapCanvasColors.fallbackClusterSoft
              const folderLabel = ep?.folder || hoveredPoint.pt.project
              const rarityPhrase = capitalizeFirst(formatRarityLabel(hoveredPoint.pt.percentile))
              const showThumb = Boolean(hoverThumbTarget && hoverThumbTarget.id === hoveredPoint.pt.id)

              return (
                <>
                  <div
                    style={{ left: hoveredPoint.sx, top: hoveredPoint.sy }}
                    className="pointer-events-none absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink ring-1 ring-tier-s/60"
                  />
                  <div
                    data-map-hover-card="true"
                    style={{ left, top }}
                    className="pointer-events-none absolute z-40 flex w-[300px] items-stretch gap-3 rounded-2xl border border-hairline bg-surface/95 p-2.5 shadow-2xl"
                  >
                    <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl border border-hairline bg-elevated">
                      {showThumb && hoverThumbTarget ? (
                        <PromptThumb
                          key={hoverThumbTarget.id}
                          src={`/api/thumbnail/${hoverThumbTarget.sourceLib}/${hoverThumbTarget.id}`}
                          alt=""
                          fallbackLabel="Sem img"
                          loading="eager"
                        />
                      ) : (
                        <div className="lab-skeleton-shimmer h-full w-full" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={[
                            'tabular-mono inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
                            TIER_COLOR_META[hoveredPoint.pt.tier].badgeClass,
                          ].join(' ')}
                        >
                          TIER {hoveredPoint.pt.tier} · P{Math.round(hoveredPoint.pt.percentile)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[12px] font-medium leading-[1.3] text-ink">
                        {rarityPhrase}
                      </p>
                      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-ink-tertiary">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: engineColor }}
                        />
                        <span className="truncate">
                          {engineLabel} · {folderLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()
          ) : null}

          {loadingPoints || (projection === 'engine' && loadingEngine) ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="tabular-mono rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-[11px] text-ink-secondary">
                {projection === 'engine' && loadingEngine
                  ? 'Mapeando engines dos prompts...'
                  : 'Carregando nuvem de pontos...'}
              </span>
            </div>
          ) : pointsError || (projection === 'engine' && engineError) ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
              <div className="flex max-w-sm flex-col items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-4 text-center">
                <span className="section-eyebrow">Erro ao carregar mapa</span>
                <p className="font-mono text-[11px] text-ink-secondary">{pointsError || engineError}</p>
                <button
                  type="button"
                  onClick={() => setReloadPointsNonce((n) => n + 1)}
                  className="btn-secondary text-[11px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Tentar novamente</span>
                </button>
              </div>
            </div>
          ) : null}

          {/* Pílula flutuante para reabrir palco quando minimizado */}
          {selectedDetail && !stageOpen ? (
            <div
              data-map-interactive="true"
              className="club-glass-pill absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 px-2 py-1 shadow-xl"
            >
              <button
                type="button"
                onClick={() => setStageOpen(true)}
                className="lab-pressable inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-white/[0.08] cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5 text-tier-s" />
                <span>Palco de similares ({selectedDetail.neighbors.length})</span>
              </button>
              <span className="h-3.5 w-px bg-white/12" />
              <button
                type="button"
                onClick={handleClearReference}
                aria-label="Limpar seleção"
                className="lab-pressable flex h-6 w-6 items-center justify-center rounded-full text-ink-tertiary hover:bg-white/[0.08] hover:text-ink cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {!stageOpen ? (
            <div
              data-map-interactive="true"
              className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-hairline bg-canvas/95 px-3 py-1.5"
            >
              <button
                type="button"
                onClick={() => {
                  cancelFlyTo()
                  setZoom((z) => Math.max(0.08, Number((z * 0.82).toFixed(3))))
                }}
                className="text-ink-tertiary hover:text-ink cursor-pointer"
                aria-label="Diminuir zoom"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="tabular-mono w-11 text-center text-[10px] text-ink-tertiary">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelFlyTo()
                  setZoom((z) => Math.min(3.0, Number((z * 1.22).toFixed(3))))
                }}
                className="text-ink-tertiary hover:text-ink cursor-pointer"
                aria-label="Aumentar zoom"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <span className="mx-1 h-3 w-px bg-white/10" />
              <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-secondary">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: paletteBundle.tierHex.S }}
                />
                Tier S
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-tertiary">
                Cor = {projection === 'engine' ? 'Engine' : projection === 'semantic' ? 'Cluster' : 'Estrutura'}
              </span>
              {projection === 'semantic' ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] text-tier-s/80">
                  <span className="h-2 w-2 rounded-full border border-dashed border-tier-s/80" />
                  Gap (O=0)
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Palco focado: Referência + Pontos Similares expansíveis (FLIP + Stagger) */}
          {stageOpen && selectedDetail ? (
            <MapSimilarityStage
              viewportSize={viewportSize}
              reference={selectedDetail.item}
              neighbors={selectedDetail.neighbors}
              loadingNeighbors={loadingNeighbors}
              trail={trail}
              hoveredNeighborId={hoveredNeighborId}
              onHoverNeighbor={setHoveredNeighborId}
              getPointOriginRect={getPointOriginRect}
              explicitFlyOriginsRef={explicitFlyOriginsRef}
              onFollowNeighbor={handleFollowNeighbor}
              onSelectTrailItem={handleSelectTrailItem}
              onInspectItem={onInspectItem}
              onOpenPair={onOpenPair}
              onMinimizeToMap={handleMinimizeToMap}
              onClearReference={handleClearReference}
            />
          ) : null}
        </div>

        {/* Painel Contextual */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-hairline bg-surface p-4 lg:w-72 lg:border-t-0 lg:border-l xl:w-84 2xl:w-96">
          {loadingDetail && !selectedDetail ? (
            <div className="py-12 text-center font-mono text-[11px] text-ink-muted">
              Consultando prompt e vizinhos no SQLite...
            </div>
          ) : selectedDetail ? (
            <div key={selectedDetail.item.id} className="lab-state-swap space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'tabular-mono shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        TIER_COLOR_META[selectedDetail.item.rarity.tier].badgeClass,
                      ].join(' ')}
                    >
                      TIER {selectedDetail.item.rarity.tier}
                    </span>
                    <span
                      className={[
                        'tabular-mono text-[11px]',
                        TIER_COLOR_META[selectedDetail.item.rarity.tier].textClass,
                      ].join(' ')}
                    >
                      {selectedDetail.item.rarity.label}
                    </span>
                  </div>
                  <h2 className="mt-1.5 truncate text-[14px] font-medium text-ink">
                    {selectedDetail.item.title}
                  </h2>
                  <p className="text-[11px] text-ink-muted">
                    {selectedDetail.item.project} · {QUADRANT_META[selectedDetail.item.quadrant as RarityQuadrant].label}
                  </p>
                  {(() => {
                    if (projection === 'engine') {
                      const ep = enginePointById.get(selectedDetail.item.id)
                      const eng = ep ? engineClusterById.get(ep.cid) : undefined
                      if (!eng) return null
                      return (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-ink">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: ep
                                ? getClusterColor(ep.cid)
                                : paletteBundle.mapCanvasColors.fallbackClusterSoft,
                            }}
                          />
                          <span>{eng.label}</span>
                          <span className="text-ink-muted">· {eng.family}</span>
                        </div>
                      )
                    }
                    const selCoords = resolveItemCoords(selectedDetail.item)
                    const cluster =
                      selCoords.cid !== null ? activeClusters.find((c) => c.clusterId === selCoords.cid) : undefined
                    if (!cluster) return null
                    return (
                      <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-ink">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getClusterColor(cluster.clusterId) }}
                        />
                        <span className="truncate">{cluster.label}</span>
                      </div>
                    )
                  })()}
                </div>
                {selectedDetail.item.thumbnailUrl ? (
                  <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl border border-hairline bg-elevated">
                    <PromptThumb
                      src={selectedDetail.item.thumbnailUrl}
                      alt={selectedDetail.item.title}
                      fallbackLabel="Sem img"
                    />
                  </div>
                ) : null}
              </div>

              {/* Preview de Raridade, Rank e Metadados Técnicos */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-hairline bg-canvas p-3 text-[11px]">
                <div>
                  <div className="text-ink-muted">Nível / Percentil</div>
                  <div className="tabular-mono mt-0.5 font-medium text-ink">
                    Tier {selectedDetail.item.rarity.tier} · P{Math.round(selectedDetail.item.rarity.percentile)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">Rank no Corpus</div>
                  <div className="tabular-mono mt-0.5 font-medium text-tier-s">
                    #{selectedDetail.item.rarity.corpusRank.toLocaleString('pt-BR')} /{' '}
                    {selectedDetail.item.rarity.corpusSize.toLocaleString('pt-BR')}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">IDF Médio · Bônus</div>
                  <div className="tabular-mono mt-0.5 text-ink">
                    {selectedDetail.item.rarity.meanIdf} · +{selectedDetail.item.rarity.pairRarityBonus}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">Maturidade · Formato</div>
                  <div className="tabular-mono mt-0.5 text-ink">
                    MAT {Math.round(selectedDetail.item.maturity.score)} ·{' '}
                    {selectedDetail.item.attributes.estrutura.macroFormat.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Tags do Prompt */}
              {selectedUniqueTags.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="section-eyebrow">Tags ({selectedUniqueTags.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUniqueTags.map((tag) => (
                      <span
                        key={tag}
                        className="tabular-mono rounded-full border border-hairline bg-white/[0.03] px-2 py-0.5 text-[10px] text-ink-secondary"
                      >
                        #{formatTagPt(tag)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Preview do Prompt + Copiar */}
              <div className="space-y-2 border-t border-hairline pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow">
                    Prompt ({selectedDetail.item.attributes.estrutura.tokenCount} tokens)
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyText(selectedDetail.item.rawPrompt, 'aside-prompt')}
                    className="club-btn-primary cursor-pointer px-3 py-1 text-[11px]"
                  >
                    <span
                      key={copiedKey === 'aside-prompt' ? 'copied' : 'copy'}
                      className="lab-state-swap inline-flex items-center gap-1.5"
                    >
                      {copiedKey === 'aside-prompt' ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedKey === 'aside-prompt' ? 'Copiado' : 'Copiar prompt'}</span>
                    </span>
                  </button>
                </div>

                <pre className="max-h-56 overflow-y-auto rounded-xl border border-hairline bg-canvas p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink-secondary">
                  {selectedDetail.item.rawPrompt}
                </pre>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onInspectItem(selectedDetail.item)}
                  className="btn-secondary w-full text-[11px]"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-tier-s" />
                  <span>Abrir inspetor completo</span>
                </button>

                {!stageOpen ? (
                  <button
                    type="button"
                    onClick={() => setStageOpen(true)}
                    className="btn-ghost w-full border border-hairline text-[11px] text-ink"
                  >
                    <Layers className="h-3.5 w-3.5 text-tier-s" />
                    <span>
                      Abrir colmeia ({loadingNeighbors && selectedDetail.neighbors.length === 0 ? '…' : selectedDetail.neighbors.length})
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : selectedVoid ? (
            <div className="space-y-4">
              <div>
                <span className="section-eyebrow inline-flex items-center gap-1.5 text-tier-s">
                  <MapPin className="h-3 w-3" />
                  Mancha Vazia · Gap Estrutural
                </span>
                <h2 className="mt-1 text-[14px] font-medium text-ink">{selectedVoid.label}</h2>
                <p className="mt-1 text-[12px] text-ink-tertiary">
                  Cavidade entre Cluster {String(selectedVoid.betweenClusters[0]).padStart(2, '0')} e
                  Cluster {String(selectedVoid.betweenClusters[1]).padStart(2, '0')}.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-tier-s/35 bg-canvas p-3 font-mono text-[11px]">
                <div>
                  <div className="text-ink-muted">Ocorrências</div>
                  <div className="text-ink">0 (O = 0)</div>
                </div>
                <div>
                  <div className="text-ink-muted">Esperado (E)</div>
                  <div className="text-tier-s">{selectedVoid.expectedCount}</div>
                </div>
                <div className="col-span-2 border-t border-hairline pt-2 text-[10px] text-ink-tertiary">
                  {formatTagPt(selectedVoid.tagA)} × {formatTagPt(selectedVoid.tagB)} ({selectedVoid.scopeLabel})
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenGap(selectedVoid.gapId)}
                className="btn-primary w-full text-[12px]"
              >
                <Compass className="h-4 w-4" />
                <span>Abrir na matriz de gaps</span>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="section-eyebrow">
                    {projection === 'semantic'
                      ? 'Regiões Semânticas (K=12)'
                      : projection === 'structural'
                        ? 'Regiões Estruturais (K=8)'
                        : `Engines de Construção (${activeClusters.length})`}
                  </span>
                  {selectedClusterId !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClusterId(null)
                        fitMapToViewport(activeClusters)
                      }}
                      className="font-mono text-[10px] text-ink-tertiary hover:text-ink cursor-pointer"
                    >
                      Mostrar todas
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] text-ink-tertiary">
                  {projection === 'engine'
                    ? `${points.length.toLocaleString('pt-BR')} pontos agrupados pelo kernel construtor (Studio Editorial e Body Mechanics separados). Clique em uma engine ou ponto para inspecionar.`
                    : `${points.length.toLocaleString('pt-BR')} pontos plotados. Clique em uma região ou ponto para inspecionar vizinhos e comparar pares.`}
                </p>
              </div>

              <div className="space-y-2">
                {activeClusters.map((c) => {
                  const active = selectedClusterId === c.clusterId
                  const eng = projection === 'engine' ? (c as LabEngineCluster) : null
                  const accentColor = getClusterColor(c.clusterId)
                  const sharePct = eng
                    ? eng.sharePct
                    : totalActiveClusterCount > 0
                      ? Number(((c.count / totalActiveClusterCount) * 100).toFixed(1))
                      : 0
                  const description = eng
                    ? eng.description
                    : c.dominantTags.length > 0
                      ? c.dominantTags.map(formatTagPt).join(' · ')
                      : `Coesão ${Math.round(c.cohesion * 100)}% · Maturidade média ${Math.round(c.avgMaturity)}`
                  const badgeLabel = eng
                    ? eng.family
                    : projection === 'structural'
                      ? c.dominantFormat.toUpperCase()
                      : `Coesão ${Math.round(c.cohesion * 100)}%`

                  return (
                    <button
                      key={c.clusterId}
                      type="button"
                      onClick={() => {
                        if (active) {
                          setSelectedClusterId(null)
                        } else {
                          setSelectedClusterId(c.clusterId)
                          flyTo(c.cx, c.cy, 0.56)
                        }
                      }}
                      style={{
                        borderColor: active ? hexToRgba(accentColor, 0.55) : undefined,
                      }}
                      className={[
                        'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                        active
                          ? 'border-border-hover bg-elevated'
                          : 'border-hairline bg-canvas hover:border-border-hover',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] font-medium text-ink">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: accentColor }}
                          />
                          <span className="truncate">{c.label}</span>
                        </span>
                        <span className="tabular-mono shrink-0 text-[10px] text-ink-tertiary">
                          {c.count.toLocaleString('pt-BR')} pts · {sharePct}%
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-ink-tertiary">
                        {description}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <span className="shrink-0 rounded border border-hairline bg-white/[0.03] px-1.5 py-px font-mono text-[9px] text-ink-secondary">
                            {badgeLabel}
                          </span>
                          <span className="truncate">{c.dominantProject}</span>
                        </span>
                        <span className="tabular-mono shrink-0">
                          P{Math.round(c.avgPercentile)} · Tier S: {c.tierSCount}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {projection === 'semantic' && mapData.voidZones.length > 0 ? (
                <div className="space-y-2 border-t border-hairline pt-4">
                  <span className="section-eyebrow">Manchas Vazias Detectadas (Gaps)</span>
                  <div className="space-y-1.5">
                    {mapData.voidZones.map((vz) => (
                      <button
                        key={vz.id}
                        type="button"
                        onClick={() => {
                          setSelectedVoidId(vz.id)
                          setSelectedDetail(null)
                          setSelectedClusterId(null)
                          flyTo(vz.x, vz.y, 0.62)
                        }}
                        className="press-scale flex w-full items-start justify-between gap-2.5 rounded-xl border border-dashed border-tier-s/35 bg-canvas px-3 py-2 text-left transition-colors hover:border-tier-s/80 hover:bg-tier-s/[0.05] cursor-pointer"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tier-s" />
                          <div className="min-w-0">
                            <div className="truncate font-mono text-[10px] font-medium text-ink">
                              {vz.label}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] text-ink-tertiary">
                              {formatTagPt(vz.tagA)} × {formatTagPt(vz.tagB)}
                            </div>
                          </div>
                        </div>
                        <span className="tabular-mono shrink-0 rounded-md border border-tier-s/35 bg-tier-s/10 px-1.5 py-0.5 text-[10px] text-tier-s">
                          E={vz.expectedCount}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
