import React, { useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MLMap, MapGeoJSONFeature, PaddingOptions } from 'maplibre-gl'

import type { GridCells, ProvincesGeo } from '../data/load'
import { fire } from '../lib/colors'
import { fmtNum } from '../lib/format'
import { prepare, type MapGeometry } from './mapData'
import { DRAW_MIN, LAND, buildStyle, colorExpr, heightExpr } from './mapStyle'

export type Focus = { kind: 'all' } | { kind: 'region'; name: string } | { kind: 'province'; name: string }

type Props = {
  grid: GridCells
  geo: ProvincesGeo
  /** value per cell, in grid_cells.json order; null while a frame is loading (the last frame stays) */
  values: ArrayLike<number> | null
  /** fixed colour / height domain */
  vmax: number
  variant: 'hero' | 'explore'
  /** shown in the tooltip, e.g. "Mar 2026" */
  monthLabel?: string
  focus?: Focus
  onSelectProvince?: (name: string | null) => void
  /** space covered by overlays (text, panel, HUD): the camera frames Vietnam in what is left */
  padding?: Partial<PaddingOptions>
  className?: string
  children?: React.ReactNode
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = (t: number) => 1 - Math.pow(1 - t, 3)
const BEARING = -12
const TWEEN_MS = 400

/**
 * MapLibre map shared by the home hero and /explore: dark OpenFreeMap basemap with a faint hillshade,
 * province outlines, a heatmap at country scale and true-size extruded 10 km squares when zoomed in.
 * If the basemap cannot load (offline), our own layers still draw on a plain background; if WebGL
 * is unavailable, a static 2D canvas of the same data is shown instead.
 */
export function FireMap({ grid, geo, values, vmax, variant, monthLabel, focus, onSelectProvince, padding, className = '', children }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const geom = useMemo(() => prepare(grid, geo), [grid, geo])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; p: string; v: number } | null>(null)
  const kRef = useRef(0) // column growth factor 0..1
  const vmaxRef = useRef(vmax)
  vmaxRef.current = vmax
  const padRef = useRef(padding)
  padRef.current = padding
  const selectRef = useRef(onSelectProvince)
  selectRef.current = onSelectProvince
  const shown = useRef<Float32Array | null>(null) // values currently drawn (tween origin)

  // ---- create the map once
  useEffect(() => {
    const el = host.current
    if (!el) return
    let map: MLMap | null = null
    let cancelled = false
    let raf = 0
    const markers: { el: HTMLElement; remove: () => void }[] = []

    import('maplibre-gl')
      .then(({ default: maplibregl }) => {
        if (cancelled) return
        const still = reducedMotion()
        const hero = variant === 'hero'
        try {
          map = new maplibregl.Map({
            container: el,
            style: buildStyle({ provinces: geom.provinces, provinceLabels: geom.provinceLabels, islands: geom.islands, cells: geom.cells, cellPoints: geom.points }, variant),
            center: [106.6, 16.2],
            zoom: 3.4,
            pitch: 0,
            bearing: 0,
            minZoom: 2.5,
            maxZoom: 10,
            maxPitch: 60,
            interactive: !hero,
            attributionControl: false,
            fadeDuration: still ? 0 : 200,
          })
        } catch {
          setFailed(true)
          return
        }
        mapRef.current = map
        map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right')
        if (!hero) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-left')
        // basemap, terrain tiles or glyphs may fail offline: keep drawing our own layers, never surface an error
        map.on('error', () => undefined)

        /** Frame the mainland in the free area, then zoom out until both archipelago labels are fully visible. */
        const target = () => {
          const pad = { top: 24, bottom: 24, left: 24, right: 24, ...padRef.current }
          const w = el.clientWidth, h = el.clientHeight
          const availW = Math.max(60, w - pad.left - pad.right), availH = Math.max(60, h - pad.top - pad.bottom)
          // portrait frames are width-bound (Trường Sa lies at 115°E): a lower pitch keeps the S tall instead of foreshortened
          const portrait = availW / availH < 0.8
          const cam = { center: [106.4, 16.0] as [number, number], zoom: 4.6, pitch: portrait ? 28 : hero ? 50 : 45, bearing: BEARING }
          const frame = () => {
            map!.jumpTo(cam)
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
            for (const p of geom.fitPoints) {
              const q = map!.project(p)
              x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
            }
            return { x0, x1, y0, y1 }
          }
          for (let i = 0; i < 16; i++) {
            const b = frame()
            const c = map!.unproject([w / 2 + ((b.x0 + b.x1) / 2 - (pad.left + availW / 2)), h / 2 + ((b.y0 + b.y1) / 2 - (pad.top + availH / 2))])
            cam.center = [c.lng, c.lat]
            cam.zoom += Math.log2(Math.min(availW / (b.x1 - b.x0), availH / (b.y1 - b.y0))) * 0.85
            cam.zoom = Math.max(3, Math.min(7.5, cam.zoom))
          }
          // archipelago labels: inside the canvas and clear of the overlays on the right and bottom
          const box = el.getBoundingClientRect()
          const fits = () =>
            markers.every((m) => {
              const r = m.el.getBoundingClientRect()
              return r.left - box.left >= 6 && r.right - box.left <= w - Math.max(6, Math.min(pad.right, 400) - 8) && r.top - box.top >= 6 && r.bottom - box.top <= h - Math.max(6, pad.bottom - 24)
            })
          for (let i = 0; i < 30; i++) {
            frame()
            if (fits()) break
            cam.zoom -= 0.05
          }
          // share of the free map height taken by the mainland, for layout checks
          const b = frame()
          el.dataset.mainlandShare = ((b.y1 - b.y0) / availH).toFixed(2)
          el.dataset.mainlandShareOfCanvas = ((b.y1 - b.y0) / h).toFixed(2)
          return cam
        }

        // 'style.load', not 'load': 'load' waits for the basemap, which may never arrive offline
        map.once('style.load', () => {
          if (cancelled || !map) return
          map.setLight({ anchor: 'viewport', intensity: 0.4, color: '#ffffff', position: [1.5, 200, 40] })
          // the two archipelagos are labelled by this app only (HTML, so they also show offline)
          for (const a of geom.archipelagos) {
            const d = document.createElement('div')
            d.className = 'ff-island-label'
            const cut = a.label.indexOf(' (')
            d.innerHTML = ''
            d.append(a.label.slice(0, cut), document.createElement('br'), a.label.slice(cut + 1))
            const mk = new maplibregl.Marker({ element: d, anchor: 'top-right' }).setLngLat([a.lon, a.lat]).addTo(map)
            markers.push({ el: d, remove: () => mk.remove() })
          }
          const t = target()
          const grow = (ms: number) => {
            const t0 = performance.now()
            const tick = (now: number) => {
              kRef.current = EASE(Math.min(1, (now - t0) / ms))
              map?.setPaintProperty('cells-3d', 'fill-extrusion-height', heightExpr(vmaxRef.current, kRef.current))
              if (kRef.current < 1) raf = requestAnimationFrame(tick)
            }
            raf = requestAnimationFrame(tick)
          }
          if (still) {
            map.jumpTo(t)
            kRef.current = 1
          } else if (hero) {
            map.jumpTo({ ...t, zoom: t.zoom - 1.1, pitch: 0, bearing: 0 })
            map.easeTo({ ...t, duration: 2500, easing: EASE })
            window.setTimeout(() => !cancelled && grow(1100), 1300)
          } else {
            map.jumpTo(t)
            grow(700)
          }
          setReady(true)
        })

        if (!hero) {
          let pending = false
          let hovered = ''
          map.on('mousemove', (e) => {
            if (pending) return
            pending = true
            requestAnimationFrame(() => {
              pending = false
              if (!map) return
              const cell = map.queryRenderedFeatures(e.point, { layers: ['cells-flat'] })[0] as MapGeoJSONFeature | undefined
              const prov = map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0] as MapGeoJSONFeature | undefined
              const name = prov ? String(prov.properties.name) : ''
              if (name !== hovered) {
                hovered = name
                map.setFilter('prov-hover', ['==', ['get', 'name'], name])
              }
              map.getCanvas().style.cursor = prov ? 'pointer' : ''
              setTip(cell ? { x: e.point.x, y: e.point.y, p: String(cell.properties.p), v: Number(cell.properties.v) } : null)
            })
          })
          map.on('mouseout', () => {
            setTip(null)
            hovered = ''
            map?.setFilter('prov-hover', ['==', ['get', 'name'], ''])
          })
          map.on('click', (e) => {
            const f = map!.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0]
            const name = f ? String(f.properties.name) : null
            selectRef.current?.(name && geom.provinceBounds.has(name) ? name : null)
          })
        }
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      markers.forEach((m) => m.remove())
      map?.remove()
      mapRef.current = null
    }
  }, [geom, variant])

  // ---- data frame: interpolate heights and colours from the frame on screen (400 ms)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !values) return
    const n = geom.cells.features.length
    const to = Float32Array.from({ length: n }, (_, i) => values[i] ?? 0)
    const from = shown.current ?? to
    const apply = (k: number) => {
      const cur = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const v = from[i] + (to[i] - from[i]) * k
        cur[i] = v
        geom.cells.features[i].properties.v = v
        const p = geom.points.features[i].properties
        p.v = v
        p.w = v >= DRAW_MIN ? Math.sqrt(Math.min(v, vmax) / vmax) : 0
      }
      shown.current = cur
      ;(map.getSource('cells') as GeoJSONSource).setData(geom.cells)
      ;(map.getSource('cellPoints') as GeoJSONSource).setData(geom.points)
    }
    map.setPaintProperty('cells-3d', 'fill-extrusion-color', colorExpr(vmax))
    map.setPaintProperty('cells-3d', 'fill-extrusion-height', heightExpr(vmax, kRef.current))
    if (reducedMotion() || from === to) {
      apply(1)
      return
    }
    let raf = 0
    let last = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / TWEEN_MS)
      // about 20 frames a second is enough for 3,509 squares and keeps the worker free
      if (k === 1 || now - last > 48) {
        last = now
        apply(EASE(k))
      }
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [values, vmax, ready, geom])

  // ---- focus: fly to a province / region, highlight the province outline
  const focusKey = focus ? `${focus.kind}:${'name' in focus ? focus.name : ''}` : ''
  const first = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focus) return
    map.setFilter('prov-selected', ['==', ['get', 'name'], focus.kind === 'province' ? focus.name : ''])
    if (first.current) {
      first.current = false
      if (focus.kind === 'all') return // initial national view is set on load
    }
    const b = focus.kind === 'province' ? geom.provinceBounds.get(focus.name) : focus.kind === 'region' ? geom.regionBounds.get(focus.name) : geom.mainland
    if (!b) return
    const pad = { top: 40, bottom: 40, left: 40, right: 40, ...padRef.current }
    map.fitBounds(b, { padding: pad, pitch: 45, bearing: BEARING, maxZoom: 8.2, duration: reducedMotion() ? 0 : 1200 })
  }, [focusKey, ready, geom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // the caller positions this box (e.g. "absolute inset-0"); no `relative` here or it would win over `absolute`
    <div className={`overflow-hidden ${className}`} style={{ background: LAND }}>
      {/* maplibre-gl.css makes its container position:relative, so the sized box is this wrapper */}
      {!failed && (
        <div className="absolute inset-0">
          <div ref={host} className="h-full w-full" role="img" aria-label="Map of Vietnam: days with fire per 10 km square" />
        </div>
      )}
      {failed && <StaticMap geom={geom} values={values} vmax={vmax} />}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-ink/95 px-2.5 py-1.5 font-mono text-[11px] leading-5 tabular-nums"
          style={{ left: Math.min(tip.x + 14, (host.current?.clientWidth ?? 600) - 210), top: tip.y + 14 }}
        >
          <div className="text-muted">{monthLabel}</div>
          <div className="text-bone">{tip.p}</div>
          <div className="text-bone">{tip.v >= DRAW_MIN ? `${fmtNum(tip.v, tip.v < 10 ? 2 : 1)} fire days` : tip.v > 0 ? `< ${DRAW_MIN} fire days` : 'no fire detected'}</div>
          <div className="text-muted">10 km square · point estimate</div>
        </div>
      )}
      {children}
    </div>
  )
}

/** Fire-day legend for the map (√ scale on a fixed maximum). */
export function MapLegend({ vmax, className = '' }: { vmax: number; className?: string }) {
  const ticks = [1, 4, 9].filter((t) => Math.sqrt(t / vmax) < 0.8)
  return (
    <div className={`font-mono text-[10px] text-muted ${className}`}>
      <div className="mb-1 flex justify-between gap-2 whitespace-nowrap">
        <span className="text-bone-dim">fire days per square</span>
        <span>√ · &lt;{DRAW_MIN} hidden</span>
      </div>
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => fire(0.1 + (0.9 * i) / 8)).join(',')})` }} />
      <div className="relative mt-1 h-3 tabular-nums">
        <span className="absolute left-0">{DRAW_MIN}</span>
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${Math.sqrt(t / vmax) * 100}%` }}>
            {t}
          </span>
        ))}
        <span className="absolute right-0">{fmtNum(vmax, 1)}</span>
      </div>
    </div>
  )
}

/** Static top-down drawing of the same data (WebGL unavailable). */
function StaticMap({ geom, values, vmax }: { geom: MapGeometry; values: ArrayLike<number> | null; vmax: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      cv.width = w * dpr
      cv.height = h * dpr
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const [[x0, y0], [x1, y1]] = geom.bounds
      const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
      const s = Math.min((w - 48) / ((x1 - x0) * kx), (h - 48) / (y1 - y0))
      const ox = (w - (x1 - x0) * kx * s) / 2, oy = (h - (y1 - y0) * s) / 2
      const P = (lon: number, lat: number) => [ox + (lon - x0) * kx * s, oy + (y1 - lat) * s] as const
      ctx.strokeStyle = 'rgba(236,235,228,0.2)'
      ctx.lineWidth = 0.6
      for (const f of geom.provinces.features) {
        const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
        for (const poly of polys) {
          ctx.beginPath()
          poly[0].forEach(([lon, lat], i) => {
            const [x, y] = P(lon, lat)
            if (i) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          })
          ctx.stroke()
        }
      }
      geom.points.features.forEach((f, i) => {
        const v = values?.[i] ?? 0
        if (v < DRAW_MIN) return
        const [x, y] = P(f.geometry.coordinates[0], f.geometry.coordinates[1])
        const side = Math.max(1.5, 0.085 * s)
        ctx.fillStyle = fire(0.1 + 0.9 * Math.sqrt(Math.min(v, vmax) / vmax))
        ctx.fillRect(x - side / 2, y - side / 2, side, side)
      })
      ctx.fillStyle = '#a9a8a0'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.textAlign = 'right'
      for (const a of geom.archipelagos) {
        const [x, y] = P(a.lon, a.lat)
        ctx.fillText(a.label, Math.min(x, w - 8), y + 14)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [geom, values, vmax])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" role="img" aria-label="Map of Vietnam: days with fire per 10 km square" />
}
