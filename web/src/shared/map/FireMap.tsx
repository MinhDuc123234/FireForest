import React, { useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, Map as MLMap, MapGeoJSONFeature, PaddingOptions } from 'maplibre-gl'

import type { GridCells, ProvincesGeo } from '../data/load'
import { inferno } from '../lib/colors'
import { fmtNum } from '../lib/format'
import { prepare, type MapGeometry } from './mapData'
import { LAND, buildStyle, colorExpr, heightExpr } from './mapStyle'

export type Focus = { kind: 'all' } | { kind: 'region'; name: string } | { kind: 'province'; name: string }

type Props = {
  grid: GridCells
  geo: ProvincesGeo
  /** value per cell, in grid_cells.json order; null while a frame is loading (the last frame stays) */
  values: ArrayLike<number> | null
  /** fixed colour / height domain */
  vmax: number
  variant: 'hero' | 'explore'
  focus?: Focus
  onSelectProvince?: (name: string | null) => void
  /** space covered by overlays, so the camera frames the free area */
  padding?: Partial<PaddingOptions>
  className?: string
  children?: React.ReactNode
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * MapLibre map shared by the home hero and /explore: dark OpenFreeMap basemap, province outlines,
 * heatmap at country scale and true-size extruded 10 km squares when zoomed in.
 * If the basemap cannot load (offline), our own layers still draw on a plain background; if WebGL
 * is unavailable, a static 2D canvas of the same data is shown instead.
 */
export function FireMap({ grid, geo, values, vmax, variant, focus, onSelectProvince, padding, className = '', children }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const geom = useMemo(() => prepare(grid, geo), [grid, geo])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; p: string; r: string; v: number } | null>(null)
  const kRef = useRef(0) // column growth factor 0..1
  const vmaxRef = useRef(vmax)
  vmaxRef.current = vmax
  const padRef = useRef(padding)
  padRef.current = padding
  const selectRef = useRef(onSelectProvince)
  selectRef.current = onSelectProvince

  // ---- create the map once
  useEffect(() => {
    const el = host.current
    if (!el) return
    let map: MLMap | null = null
    let cancelled = false
    let raf = 0
    const markers: { remove: () => void }[] = []

    import('maplibre-gl')
      .then(({ default: maplibregl }) => {
        if (cancelled) return
        const still = reducedMotion()
        const hero = variant === 'hero'
        try {
          map = new maplibregl.Map({
            container: el,
            style: buildStyle({ provinces: geom.provinces, provinceLabels: geom.provinceLabels, islands: geom.islands, cells: geom.cells, cellPoints: geom.points }),
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
        map.addControl(new maplibregl.AttributionControl({ compact: true }), hero ? 'top-right' : 'bottom-left')
        if (!hero) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-left')
        // basemap tiles or glyphs may fail offline: keep drawing our own layers, never surface an error
        map.on('error', () => undefined)

        /**
         * National camera for the pitched view. cameraForBounds ignores pitch, so iterate instead: project the
         * points that must be visible (cells and both archipelagos), then pan and zoom until their screen box
         * fills the area left free by the overlays.
         */
        const target = () => {
          const pad = { top: 24, bottom: 24, left: 24, right: 24, ...padRef.current }
          const w = el.clientWidth, h = el.clientHeight
          const availW = Math.max(60, w - pad.left - pad.right), availH = Math.max(60, h - pad.top - pad.bottom)
          const cam = { center: [107.6, 16.0] as [number, number], zoom: 4.4, pitch: hero ? 50 : 45, bearing: hero ? -8 : 0 }
          for (let i = 0; i < 14; i++) {
            map!.jumpTo(cam)
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
            for (const p of geom.fitPoints) {
              const q = map!.project(p)
              x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
            }
            const c = map!.unproject([w / 2 + ((x0 + x1) / 2 - (pad.left + availW / 2)), h / 2 + ((y0 + y1) / 2 - (pad.top + availH / 2))])
            cam.center = [c.lng, c.lat]
            cam.zoom += Math.log2(Math.min(availW / (x1 - x0), availH / (y1 - y0))) * 0.85
            cam.zoom = Math.max(3, Math.min(7.5, cam.zoom))
          }
          return cam
        }

        // 'style.load', not 'load': 'load' waits for the basemap, which may never arrive offline
        map.once('style.load', () => {
          if (cancelled || !map) return
          map.setLight({ anchor: 'viewport', intensity: 0.28, position: [1.4, 210, 35] })
          // the compact attribution starts expanded; keep it collapsed behind its (i) button
          const attrib = el.querySelector('.maplibregl-ctrl-attrib')
          attrib?.classList.remove('maplibregl-compact-show')
          attrib?.removeAttribute('open')
          // the two archipelagos are labelled by this app only (HTML, so they also show offline)
          for (const a of geom.archipelagos) {
            const d = document.createElement('div')
            d.className = 'ff-island-label'
            d.textContent = a.label
            markers.push(new maplibregl.Marker({ element: d, anchor: 'top-right' }).setLngLat([a.lon, a.lat]).addTo(map))
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
          map.on('mousemove', (e) => {
            if (pending) return
            pending = true
            requestAnimationFrame(() => {
              pending = false
              if (!map) return
              const f = map.queryRenderedFeatures(e.point, { layers: ['cells-flat'] })[0] as MapGeoJSONFeature | undefined
              map.getCanvas().style.cursor = f || map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] }).length ? 'pointer' : ''
              setTip(f ? { x: e.point.x, y: e.point.y, p: String(f.properties.p), r: String(f.properties.r), v: Number(f.properties.v) } : null)
            })
          })
          map.on('mouseout', () => setTip(null))
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

  // ---- data frame
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !values) return
    for (let i = 0; i < geom.cells.features.length; i++) {
      const v = values[i] ?? 0
      geom.cells.features[i].properties.v = v
      const p = geom.points.features[i].properties
      p.v = v
      p.w = v > 0 ? Math.sqrt(Math.min(v, vmax) / vmax) : 0
    }
    ;(map.getSource('cells') as GeoJSONSource).setData(geom.cells)
    ;(map.getSource('cellPoints') as GeoJSONSource).setData(geom.points)
    map.setPaintProperty('cells-3d', 'fill-extrusion-color', colorExpr(vmax))
    map.setPaintProperty('cells-3d', 'fill-extrusion-height', heightExpr(vmax, kRef.current))
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
    const b = focus.kind === 'province' ? geom.provinceBounds.get(focus.name) : focus.kind === 'region' ? geom.regionBounds.get(focus.name) : geom.bounds
    if (!b) return
    const pad = { top: 40, bottom: 40, left: 40, right: 40, ...padRef.current }
    map.fitBounds(b, { padding: pad, pitch: 45, bearing: map.getBearing(), maxZoom: 8.2, duration: reducedMotion() ? 0 : 1200 })
  }, [focusKey, ready, geom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // the caller positions this box (e.g. "absolute inset-0"); no `relative` here or it would win over `absolute`
    <div className={`overflow-hidden ${className}`} style={{ background: LAND }}>
      {/* maplibre-gl.css makes its container position:relative, so the sized box is this wrapper */}
      {!failed && (
        <div className="absolute inset-0">
          <div ref={host} className="h-full w-full" role="img" aria-label="Map of Vietnam: fire activity per 10 km square" />
        </div>
      )}
      {failed && <StaticMap geom={geom} values={values} vmax={vmax} />}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-ink/95 px-2.5 py-1.5 font-mono text-[11px] tabular-nums"
          style={{ left: Math.min(tip.x + 12, (host.current?.clientWidth ?? 600) - 200), top: tip.y + 12 }}
        >
          <div className="text-bone">{tip.p}</div>
          <div className="text-muted">{tip.r}</div>
          <div className="text-bone-dim">{tip.v > 0 ? `${fmtNum(tip.v, 2)} cell-days` : 'no detection'}</div>
        </div>
      )}
      {children}
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
        const [x, y] = P(f.geometry.coordinates[0], f.geometry.coordinates[1])
        const side = Math.max(1.5, 0.085 * s)
        ctx.fillStyle = v > 0 ? inferno(0.12 + 0.88 * Math.sqrt(Math.min(v, vmax) / vmax)) : 'rgba(236,235,228,0.05)'
        ctx.fillRect(x - side / 2, y - side / 2, side, side)
      })
      ctx.fillStyle = '#a9a8a0'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      for (const a of geom.archipelagos) {
        const [x, y] = P(a.lon, a.lat)
        ctx.fillText(a.label, Math.min(x, w - 110), y + 14)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [geom, values, vmax])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" role="img" aria-label="Map of Vietnam: fire activity per 10 km square" />
}
