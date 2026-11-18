import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Maximize2, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react'
import { formatTagPt } from '../core/promptTagsPt'
import { QUADRANT_META } from '../core/rarityEngine'
import type {
  MapClusterRegion,
  MapPayload,
  MapPointCompact,
  MapPointsResponse,
  MapVoidGapZone,
  PromptDetailResponse,
  PromptItem,
  RarityQuadrant,
  SourceLibFilter,
} from '../types/promptEngine'

interface MapViewProps {
  mapData: MapPayload
  sourceLib: SourceLibFilter
  activeProjectFilter: string | 'all'
  onInspectItem: (item: PromptItem) => void
  onOpenPair: (idA: string, idB: string) => void
  onOpenGap: (gapId?: string) => void
}

type ProjectionMode = 'semantic' | 'structural'
type QuickFilter = 'all' | 'tier_s' | 'raro_maduro' | 'raro_imaturo'

export const MapView: React.FC<MapViewProps> = ({
  mapData,
  sourceLib,
  activeProjectFilter,
  onInspectItem,
  onOpenPair,
  onOpenGap,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [viewportSize, setViewportSize] = useState({ w: 960, h: 640 })

  const [points, setPoints] = useState<MapPointCompact[]>([])
  const [loadingPoints, setLoadingPoints] = useState(true)

  const [projection, setProjection] = useState<ProjectionMode>('semantic')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.24)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.24 })
  cameraRef.current = { x: pan.x, y: pan.y, zoom }

  const dragRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  }>({ active: false, pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false })

  const [hoveredPoint, setHoveredPoint] = useState<{
    pt: MapPointCompact
    sx: number
    sy: number
  } | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<PromptDetailResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [selectedVoidId, setSelectedVoidId] = useState<string | null>(null)

  const activeClusters: MapClusterRegion[] =
    projection === 'semantic' ? mapData.clusters : mapData.structuralClusters

  // Busca os pontos do SQLite em RAM via /api/map-points
  useEffect(() => {
    let active = true
    setLoadingPoints(true)
    const params = new URLSearchParams({ sourceLib, project: activeProjectFilter })
    fetch(`/api/map-points?${params.toString()}`)
      .then((r) => r.json() as Promise<MapPointsResponse>)
      .then((data) => {
        if (!active) return
        setPoints(data.points || [])
        setLoadingPoints(false)
      })
      .catch(() => {
        if (active) setLoadingPoints(false)
      })
    return () => {
      active = false
    }
  }, [sourceLib, activeProjectFilter])

  const getPointCoords = useCallback(
    (p: MapPointCompact) =>
      projection === 'semantic'
        ? { x: p.x, y: p.y, cid: p.clusterId }
        : { x: p.structX, y: p.structY, cid: p.structClusterId },
    [projection]
  )

  const fitMapToViewport = useCallback(
    (clustersToFit: MapClusterRegion[]) => {
      if (clustersToFit.length === 0) return
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
        Math.min(0.75, Math.min((viewportSize.w * 0.8) / spanW, (viewportSize.h * 0.78) / spanH))
      )
      const midX = (minX + maxX) * 0.5
      const midY = (minY + maxY) * 0.5
      setZoom(Number(nextZoom.toFixed(4)))
      setPan({ x: -midX * nextZoom, y: -midY * nextZoom })
    },
    [viewportSize.h, viewportSize.w]
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
      e.preventDefault()
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
  }, [])

  const flyTo = useCallback((wx: number, wy: number, targetZoom: number) => {
    setZoom(targetZoom)
    setPan({ x: -wx * targetZoom, y: -wy * targetZoom })
  }, [])

  const toScreenX = useCallback(
    (wx: number) => viewportSize.w * 0.5 + pan.x + wx * zoom,
    [viewportSize.w, pan.x, zoom]
  )
  const toScreenY = useCallback(
    (wy: number) => viewportSize.h * 0.5 + pan.y + wy * zoom,
    [viewportSize.h, pan.y, zoom]
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

  const selectPromptById = useCallback((id: string) => {
    setLoadingDetail(true)
    setSelectedVoidId(null)
    fetch(`/api/prompt/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<PromptDetailResponse>) : Promise.reject(new Error('404'))))
      .then((detail) => {
        setSelectedDetail(detail)
        setLoadingDetail(false)
      })
      .catch(() => {
        setLoadingDetail(false)
      })
  }, [])

  const neighborIdSet = useMemo(() => {
    if (!selectedDetail) return new Set<string>()
    return new Set(selectedDetail.neighbors.map((n) => n.item.id))
  }, [selectedDetail])

  // Renderização de 22.282 pontos no <canvas> 2D a 60 FPS
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewportSize.w, viewportSize.h)

    // 1. Regiões dos Clusters
    for (const c of activeClusters) {
      const sx = toScreenX(c.cx)
      const sy = toScreenY(c.cy)
      const rPx = c.radius * zoom
      if (sx + rPx < -60 || sx - rPx > viewportSize.w + 60 || sy + rPx < -60 || sy - rPx > viewportSize.h + 60) {
        continue
      }
      const isActive = selectedClusterId === c.clusterId
      ctx.beginPath()
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? 'rgba(244,244,246,0.035)' : 'rgba(244,244,246,0.012)'
      ctx.fill()
      ctx.lineWidth = isActive ? 1.5 : 1
      ctx.strokeStyle = isActive ? 'rgba(244,244,246,0.28)' : 'rgba(255,255,255,0.06)'
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
        ctx.fillStyle = isSel ? 'rgba(229,169,60,0.06)' : 'rgba(5,5,7,0.72)'
        ctx.fill()
        ctx.lineWidth = isSel ? 1.5 : 1
        ctx.strokeStyle = isSel ? 'rgba(229,169,60,0.7)' : 'rgba(255,255,255,0.16)'
        ctx.stroke()
      }
      ctx.restore()
    }

    // 3. Pontos em lotes rápidos por camada (normal / dimmed / Tier S)
    const dotR = Math.max(1.3, Math.min(4.2, zoom * 6.5))
    const dotRS = Math.max(2.1, Math.min(5.2, zoom * 8.2))
    const selectedId = selectedDetail?.item.id || null

    // Dimmed points
    ctx.fillStyle = 'rgba(113,113,122,0.18)'
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

    // Active non-S points
    ctx.fillStyle = 'rgba(161,161,170,0.68)'
    ctx.beginPath()
    for (const p of points) {
      if (p.tier === 'S' || p.id === selectedId || neighborIdSet.has(p.id)) continue
      const { x, y, cid } = getPointCoords(p)
      const sx = toScreenX(x)
      const sy = toScreenY(y)
      if (sx < -6 || sx > viewportSize.w + 6 || sy < -6 || sy > viewportSize.h + 6) continue
      const isMatched = !matchingIdSet || matchingIdSet.has(p.id)
      const clusterOk = selectedClusterId === null || selectedClusterId === cid
      if (isMatched && clusterOk) {
        ctx.moveTo(sx + dotR, sy)
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2)
      }
    }
    ctx.fill()

    // Active Tier S points (único acento cromático #e5a93c)
    ctx.fillStyle = '#e5a93c'
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

    // 4. Linhas para vizinhos do ponto selecionado
    if (selectedDetail && selectedDetail.neighbors.length > 0) {
      const selPt = points.find((p) => p.id === selectedDetail.item.id)
      if (selPt) {
        const sc = getPointCoords(selPt)
        const ax = toScreenX(sc.x)
        const ay = toScreenY(sc.y)
        ctx.save()
        ctx.strokeStyle = 'rgba(244,244,246,0.34)'
        ctx.lineWidth = 1.2
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        for (const nb of selectedDetail.neighbors) {
          const nbc =
            projection === 'semantic'
              ? { x: nb.item.x ?? 0, y: nb.item.y ?? 0 }
              : { x: nb.item.structX ?? 0, y: nb.item.structY ?? 0 }
          ctx.moveTo(ax, ay)
          ctx.lineTo(toScreenX(nbc.x), toScreenY(nbc.y))
        }
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [
    points,
    activeClusters,
    mapData.voidZones,
    projection,
    viewportSize,
    pan,
    zoom,
    toScreenX,
    toScreenY,
    getPointCoords,
    matchingIdSet,
    selectedClusterId,
    selectedVoidId,
    selectedDetail,
    neighborIdSet,
  ])

  // LOD 3: Overlay de miniaturas apenas em zoom alto (>= 0.85) ou para ponto selecionado + vizinhos
  const floatingThumbNodes = useMemo(() => {
    const out: Array<{ id: string; sourceLib: string; title: string; sx: number; sy: number; kind: 'selected' | 'neighbor' | 'lod' }> = []
    const added = new Set<string>()

    if (selectedDetail) {
      const sel = selectedDetail.item
      const sx = toScreenX(projection === 'semantic' ? sel.x ?? 0 : sel.structX ?? 0)
      const sy = toScreenY(projection === 'semantic' ? sel.y ?? 0 : sel.structY ?? 0)
      out.push({ id: sel.id, sourceLib: sel.sourceLib, title: sel.title, sx, sy, kind: 'selected' })
      added.add(sel.id)
      for (const nb of selectedDetail.neighbors) {
        if (added.has(nb.item.id)) continue
        const nbx = toScreenX(projection === 'semantic' ? nb.item.x ?? 0 : nb.item.structX ?? 0)
        const nby = toScreenY(projection === 'semantic' ? nb.item.y ?? 0 : nb.item.structY ?? 0)
        out.push({ id: nb.item.id, sourceLib: nb.item.sourceLib, title: nb.item.title, sx: nbx, sy: nby, kind: 'neighbor' })
        added.add(nb.item.id)
      }
    }

    if (zoom >= 0.88) {
      for (const p of points) {
        if (out.length >= 22) break
        if (added.has(p.id)) continue
        const { x, y, cid } = getPointCoords(p)
        const sx = toScreenX(x)
        const sy = toScreenY(y)
        if (sx < 24 || sx > viewportSize.w - 24 || sy < 24 || sy > viewportSize.h - 24) continue
        if (matchingIdSet && !matchingIdSet.has(p.id)) continue
        if (selectedClusterId !== null && selectedClusterId !== cid) continue
        // Em LOD prioriza Tier S ou espaçamento mínimo de 54px
        const tooClose = out.some((o) => Math.hypot(o.sx - sx, o.sy - sy) < 54)
        if (tooClose) continue
        out.push({ id: p.id, sourceLib: p.sourceLib, title: p.title, sx, sy, kind: 'lod' })
        added.add(p.id)
      }
    }
    return out
  }, [selectedDetail, zoom, points, projection, toScreenX, toScreenY, viewportSize, getPointCoords, matchingIdSet, selectedClusterId])

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
    if ((e.target as HTMLElement).closest('[data-map-interactive="true"]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: cameraRef.current.x,
      origY: cameraRef.current.y,
      moved: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.active && dragRef.current.pointerId === e.pointerId) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true
      setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
      setHoveredPoint(null)
      return
    }
    const hit = hitTestPoint(e.clientX, e.clientY)
    setHoveredPoint(hit)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return
    const wasClick = !dragRef.current.moved
    dragRef.current.active = false
    dragRef.current.pointerId = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!wasClick) return

    const hit = hitTestPoint(e.clientX, e.clientY)
    if (hit) {
      const c = getPointCoords(hit.pt)
      setSelectedClusterId(c.cid)
      selectPromptById(hit.pt.id)
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
        setSelectedClusterId(null)
        return
      }
    }

    setSelectedDetail(null)
    setSelectedClusterId(null)
    setSelectedVoidId(null)
  }

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0b0b0e] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="section-eyebrow">
              Mapa Espacial · {points.length.toLocaleString('pt-BR')} Pontos (60 FPS LOD)
            </span>
            <h1 className="text-[14px] font-medium text-zinc-100">
              Regiões, Clusters & Manchas Vazias (Gaps)
            </h1>
          </div>

          <div className="inline-flex rounded-xl border border-white/[0.08] bg-[#09090b] p-0.5">
            {(
              [
                { id: 'semantic', label: 'Semântica' },
                { id: 'structural', label: 'Estrutural' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setProjection(opt.id)
                  setSelectedClusterId(null)
                  setSelectedVoidId(null)
                }}
                className={[
                  'rounded-lg px-2.5 py-1 text-[11px] transition-colors cursor-pointer',
                  projection === opt.id
                    ? 'bg-[#1a1a20] font-medium text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
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
                  onClick={() => setQuickFilter(f.id)}
                  className={[
                    'rounded-lg border px-2 py-1 text-[11px] transition-colors cursor-pointer',
                    active
                      ? isS
                        ? 'border-[#e5a93c]/60 bg-[#e5a93c]/10 text-[#e5a93c]'
                        : 'border-white/25 bg-white/[0.06] text-zinc-100'
                      : 'border-white/[0.07] bg-[#0f0f13] text-zinc-400 hover:border-white/[0.16]',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-52 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Localizar nos pontos..."
              className="w-full rounded-xl border border-white/[0.08] bg-[#09090b] py-1.5 pr-2.5 pl-8 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => fitMapToViewport(activeClusters)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#111115] px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-white/[0.18] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Enquadrar</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHoveredPoint(null)}
          className="relative flex-1 overflow-hidden bg-[#08080a] select-none cursor-grab active:cursor-grabbing"
        >
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {/* Rótulos limpos das regiões */}
          {activeClusters.map((c) => {
            const sx = toScreenX(c.cx)
            const sy = toScreenY(c.cy - c.radius)
            if (sx < -120 || sx > viewportSize.w + 120 || sy < -30 || sy > viewportSize.h + 30) {
              return null
            }
            return (
              <button
                key={`lbl-${c.clusterId}`}
                type="button"
                data-map-interactive="true"
                onClick={() => {
                  setSelectedClusterId(c.clusterId)
                  setSelectedVoidId(null)
                  flyTo(c.cx, c.cy, Math.max(0.45, zoom))
                }}
                style={{ left: sx, top: sy - 10, maxWidth: Math.max(150, Math.round(c.radius * zoom * 1.9)) }}
                className="absolute -translate-x-1/2 truncate rounded-full border border-white/[0.08] bg-[#0c0c10]/95 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-200 cursor-pointer"
              >
                {c.label} ({c.count})
              </button>
            )
          })}

          {/* Rótulos das Manchas Vazias */}
          {projection === 'semantic'
            ? mapData.voidZones.map((vz) => {
                const sx = toScreenX(vz.x)
                const sy = toScreenY(vz.y)
                if (sx < -60 || sx > viewportSize.w + 60 || sy < -60 || sy > viewportSize.h + 60) return null
                return (
                  <button
                    key={`vz-${vz.id}`}
                    type="button"
                    data-map-interactive="true"
                    onClick={() => {
                      setSelectedVoidId(vz.id)
                      setSelectedDetail(null)
                      setSelectedClusterId(null)
                      flyTo(vz.x, vz.y, Math.max(0.55, zoom))
                    }}
                    style={{ left: sx, top: sy }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/[0.14] bg-[#070709]/85 px-2 py-0.5 font-mono text-[9px] text-zinc-400 hover:border-[#e5a93c]/60 cursor-pointer"
                  >
                    GAP · O=0
                  </button>
                )
              })
            : null}

          {/* Miniaturas LOD em zoom alto ou ao selecionar ponto + vizinhos */}
          {floatingThumbNodes.map((node) => {
            const size = node.kind === 'selected' ? 52 : node.kind === 'neighbor' ? 38 : 30
            return (
              <button
                key={`thumb-${node.id}`}
                type="button"
                data-map-interactive="true"
                onClick={() => selectPromptById(node.id)}
                style={{ left: node.sx - size * 0.5, top: node.sy - size * 0.5, width: size, height: size }}
                title={node.title}
                className={[
                  'absolute overflow-hidden rounded-lg border bg-[#101013] cursor-pointer',
                  node.kind === 'selected'
                    ? 'z-30 border-white ring-2 ring-white/25'
                    : node.kind === 'neighbor'
                      ? 'z-20 border-zinc-300'
                      : 'z-10 border-white/20 hover:z-20',
                ].join(' ')}
              >
                <img
                  src={`/api/thumbnail/${node.sourceLib}/${node.id}`}
                  alt={node.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            )
          })}

          {/* Hover Tooltip */}
          {hoveredPoint && !dragRef.current.active ? (
            <div
              style={{
                left: Math.min(viewportSize.w - 240, hoveredPoint.sx + 12),
                top: Math.max(12, hoveredPoint.sy - 18),
              }}
              className="pointer-events-none absolute z-40 w-56 rounded-xl border border-white/[0.12] bg-[#0c0c10]/95 p-2.5 shadow-xl"
            >
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className={hoveredPoint.pt.tier === 'S' ? 'text-[#e5a93c]' : 'text-zinc-300'}>
                  TIER {hoveredPoint.pt.tier} · P{hoveredPoint.pt.percentile}
                </span>
                <span className="text-zinc-500">MAT {Math.round(hoveredPoint.pt.maturity)}</span>
              </div>
              <div className="mt-1 truncate text-[11px] font-medium text-zinc-100">
                {hoveredPoint.pt.title}
              </div>
              <div className="truncate text-[10px] text-zinc-500">
                {hoveredPoint.pt.project} · {hoveredPoint.pt.format.toUpperCase()}
              </div>
            </div>
          ) : null}

          {loadingPoints ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="tabular-mono rounded-xl border border-white/10 bg-[#0b0b0e] px-3 py-1.5 text-[11px] text-zinc-300">
                Carregando nuvem de pontos...
              </span>
            </div>
          ) : null}

          <div
            data-map-interactive="true"
            className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b0b0e]/90 px-3 py-1.5 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.08, Number((z * 0.82).toFixed(3))))}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              aria-label="Diminuir zoom"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="tabular-mono w-11 text-center text-[10px] text-zinc-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.0, Number((z * 1.22).toFixed(3))))}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              aria-label="Aumentar zoom"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <span className="mx-1 h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-[#e5a93c]" />
              Tier S
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="h-2 w-2 rounded-full border border-dashed border-white/40" />
              Gap (O=0)
            </span>
          </div>
        </div>

        {/* Painel Contextual */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-white/[0.07] bg-[#0c0c0f] p-4 lg:w-96 lg:border-t-0 lg:border-l">
          {loadingDetail ? (
            <div className="py-12 text-center font-mono text-[11px] text-zinc-500">
              Consultando prompt e vizinhos no SQLite...
            </div>
          ) : selectedDetail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'tabular-mono rounded-full border px-2 py-0.5 text-[10px]',
                        selectedDetail.item.rarity.tier === 'S'
                          ? 'border-[#e5a93c]/60 text-[#e5a93c]'
                          : 'border-white/10 text-zinc-300',
                      ].join(' ')}
                    >
                      TIER {selectedDetail.item.rarity.tier}
                    </span>
                    <span className="tabular-mono text-[11px] text-zinc-400">
                      {selectedDetail.item.rarity.label}
                    </span>
                  </div>
                  <h2 className="mt-1.5 truncate text-[14px] font-medium text-zinc-100">
                    {selectedDetail.item.title}
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    {selectedDetail.item.project} · MAT {Math.round(selectedDetail.item.maturity.score)} ·{' '}
                    {QUADRANT_META[selectedDetail.item.quadrant as RarityQuadrant].label}
                  </p>
                </div>
                {selectedDetail.item.thumbnailUrl ? (
                  <img
                    src={selectedDetail.item.thumbnailUrl}
                    alt={selectedDetail.item.title}
                    className="h-16 w-14 shrink-0 rounded-xl border border-white/10 object-cover"
                  />
                ) : null}
              </div>

              <p className="rounded-xl border border-white/[0.06] bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {selectedDetail.item.excerpt}
              </p>

              <button
                type="button"
                onClick={() => onInspectItem(selectedDetail.item)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#15151a] py-2 text-[12px] font-medium text-zinc-100 hover:border-white/25 cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Inspecionar 8 Atributos</span>
              </button>

              <div className="space-y-2 border-t border-white/[0.07] pt-3">
                <span className="section-eyebrow">Vizinhos Semânticos & Estruturais</span>
                <div className="space-y-1.5">
                  {selectedDetail.neighbors.map((nb) => (
                    <div
                      key={nb.item.id}
                      className="flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.06] bg-[#101014] p-2"
                    >
                      <button
                        type="button"
                        onClick={() => selectPromptById(nb.item.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
                      >
                        {nb.item.thumbnailUrl ? (
                          <img
                            src={nb.item.thumbnailUrl}
                            alt={nb.item.title}
                            className="h-10 w-9 shrink-0 rounded-lg object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-zinc-200">
                            {nb.item.title}
                          </div>
                          <div className="tabular-mono text-[10px] text-zinc-500">
                            SEM {Math.round(nb.semanticSim * 100)}% · EST {Math.round(nb.structuralSim * 100)}%
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPair(selectedDetail.item.id, nb.item.id)}
                        className="shrink-0 rounded-lg border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-300 hover:border-white/20 cursor-pointer"
                      >
                        Comparar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : selectedVoid ? (
            <div className="space-y-4">
              <div>
                <span className="section-eyebrow">Mancha Vazia · Gap Estrutural</span>
                <h2 className="mt-1 text-[15px] font-medium text-zinc-100">{selectedVoid.label}</h2>
                <p className="mt-1 text-[12px] text-zinc-400">
                  Cavidade entre Cluster {String(selectedVoid.betweenClusters[0]).padStart(2, '0')} e
                  Cluster {String(selectedVoid.betweenClusters[1]).padStart(2, '0')}.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-[#101014] p-3 font-mono text-[11px]">
                <div>
                  <div className="text-zinc-500">Ocorrências</div>
                  <div className="text-zinc-100">0 (O = 0)</div>
                </div>
                <div>
                  <div className="text-zinc-500">Esperado (E)</div>
                  <div className="text-[#e5a93c]">{selectedVoid.expectedCount}</div>
                </div>
                <div className="col-span-2 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-400">
                  {formatTagPt(selectedVoid.tagA)} × {formatTagPt(selectedVoid.tagB)} ({selectedVoid.scopeLabel})
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenGap(selectedVoid.gapId)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#15151a] py-2 text-[12px] font-medium text-zinc-100 hover:border-white/25 cursor-pointer"
              >
                <span>Abrir na Matriz de Gaps</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <span className="section-eyebrow">
                  {projection === 'semantic' ? 'Regiões Semânticas (K=12)' : 'Regiões Estruturais (K=8)'}
                </span>
                <p className="mt-1 text-[12px] text-zinc-400">
                  {points.length.toLocaleString('pt-BR')} pontos plotados. Clique em uma região ou ponto para inspecionar vizinhos e comparar pares.
                </p>
              </div>

              <div className="space-y-2">
                {activeClusters.map((c) => {
                  const active = selectedClusterId === c.clusterId
                  return (
                    <button
                      key={c.clusterId}
                      type="button"
                      onClick={() => {
                        setSelectedClusterId(c.clusterId)
                        flyTo(c.cx, c.cy, 0.56)
                      }}
                      className={[
                        'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                        active
                          ? 'border-white/25 bg-[#15151a]'
                          : 'border-white/[0.07] bg-[#101014] hover:border-white/[0.16]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] font-medium text-zinc-200">
                          {c.label}
                        </span>
                        <span className="tabular-mono shrink-0 text-[10px] text-zinc-400">
                          {c.count.toLocaleString('pt-BR')} pts
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{c.dominantProject}</span>
                        <span className="tabular-mono">
                          P{Math.round(c.avgPercentile)} · Tier S: {c.tierSCount}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {projection === 'semantic' && mapData.voidZones.length > 0 ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-4">
                  <span className="section-eyebrow">Manchas Vazias Detectadas (Gaps)</span>
                  <div className="space-y-1.5">
                    {mapData.voidZones.map((vz) => (
                      <button
                        key={vz.id}
                        type="button"
                        onClick={() => {
                          setSelectedVoidId(vz.id)
                          setSelectedClusterId(null)
                          flyTo(vz.x, vz.y, 0.62)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-white/[0.12] bg-[#09090b] px-3 py-2 text-left hover:border-white/25 cursor-pointer"
                      >
                        <span className="truncate font-mono text-[10px] text-zinc-300">
                          {vz.label}
                        </span>
                        <span className="tabular-mono shrink-0 text-[10px] text-zinc-500">
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
