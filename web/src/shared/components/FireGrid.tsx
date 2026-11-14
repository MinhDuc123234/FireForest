import React, { useEffect, useMemo, useRef, useState } from 'react'

import { GRID, inferno } from '../lib/colors'
import { fmtInt, fmtNum } from '../lib/format'
import { useData, type GridCells, type GridMarch, type ProvincesGeo, type Trust } from '../data/load'
import type { FireGridScene, GridInput } from '../three/fireGridScene'

const KM_PER_DEG = 111.195 // harmonize_fire_v2.py KM_DEG (also in method.json)
const ARCHIPELAGO: Record<string, string> = { 'Đà Nẵng': 'Hoàng Sa', 'Khánh Hòa': 'Trường Sa' }
const LEGEND_TICKS = [1, 4, 9]

function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return r
}

/** decimal hours (13.3) -> "13:18" */
const hhmm = (h: number) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}:${String(mm).padStart(2, '0')}`
}

function rings(geo: ProvincesGeo): [number, number][][] {
  const out: [number, number][][] = []
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const p of polys) for (const r of p) out.push(r as [number, number][])
  }
  return out
}

type Prepared = { input: GridInput; years: number[]; totals: number[]; labels: Record<string, string> }

function prepare(cells: GridCells, march: GridMarch, geo: ProvincesGeo): Prepared {
  let vmax = 0
  for (const row of march.values) for (const v of row) vmax = Math.max(vmax, v)
  const offshore = (geo.meta.offshore ?? []) as { province: string; bbox: [number, number, number, number] }[]
  const anchors: Record<string, [number, number]> = {}
  const labels: Record<string, string> = {}
  for (const o of offshore) {
    const name = ARCHIPELAGO[o.province] ?? o.province
    anchors[name] = [(o.bbox[0] + o.bbox[2]) / 2, o.bbox[1]]
    labels[name] = o.province
  }
  return {
    input: {
      cells: cells.cells.map((c) => [c[1], c[2]]),
      values: march.values,
      vmax,
      rings: rings(geo),
      cellSize: 10 / KM_PER_DEG,
      anchors,
    },
    years: march.years,
    totals: march.values.map((row) => row.reduce((s, v) => s + v, 0)),
    labels,
  }
}

export function FireGrid({ className = '' }: { className?: string }) {
  const cells = useData('grid_cells.json')
  const march = useData('grid_march.json')
  const geo = useData('provinces.geojson')
  const trust = useData('trust.json')
  const reduced = useReducedMotion()

  const prep = useMemo(
    () => (cells.status === 'ready' && march.status === 'ready' && geo.status === 'ready' ? prepare(cells.data, march.data, geo.data) : null),
    [cells, march, geo]
  )
  const [yi, setYi] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [webgl, setWebgl] = useState<'pending' | 'ok' | 'failed'>('pending')
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<FireGridScene | null>(null)
  const labelRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const sweepRef = useRef<HTMLSpanElement>(null)

  // default to the latest year once loaded
  useEffect(() => {
    if (prep) setYi(prep.years.length - 1)
  }, [prep])

  // three.js scene (dynamic import keeps three out of the main bundle)
  useEffect(() => {
    if (!prep || reduced || !hostRef.current) return
    let disposed = false
    const host = hostRef.current
    import('../three/fireGridScene')
      .then(({ createFireGrid }) => {
        if (disposed) return
        try {
          sceneRef.current = createFireGrid(host, prep.input, prep.years.length - 1, (anchors, sweep) => {
            const w = host.clientWidth
            for (const [k, p] of Object.entries(anchors)) {
              const el = labelRefs.current[k]
              if (!el) continue
              // flip the label to the left of its anchor only when it would not fit on the right
              const left = p.x + el.offsetWidth > w - 8
              el.dataset.side = left ? 'l' : 'r'
              el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)${left ? ' translateX(-100%)' : ''}`
            }
            const s = sweepRef.current
            if (s) {
              s.style.opacity = sweep.on ? '1' : '0'
              if (sweep.on) s.style.transform = `translate(${sweep.x.toFixed(1)}px, ${(sweep.y - 18).toFixed(1)}px)`
            }
          })
          setWebgl('ok')
        } catch {
          setWebgl('failed')
        }
      })
      .catch(() => setWebgl('failed'))
    // pause rendering while offscreen
    const io = new IntersectionObserver(([e]) => sceneRef.current?.setPaused(!e.isIntersecting))
    io.observe(host)
    return () => {
      disposed = true
      io.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [prep, reduced])

  useEffect(() => {
    sceneRef.current?.setYear(yi, !reduced)
  }, [yi, reduced, webgl])

  useEffect(() => {
    if (!playing || !prep) return
    const id = window.setInterval(() => setYi((i) => (i + 1) % prep.years.length), 1800)
    return () => window.clearInterval(id)
  }, [playing, prep])

  const year = prep?.years[yi]
  const overpass = trust.status === 'ready' && year ? trust.data.overpass.rows.find((r) => r.year === year)?.median_local_hour : undefined
  const static2d = reduced || webgl === 'failed'
  const failed = cells.status === 'error' || march.status === 'error' || geo.status === 'error'

  if (failed) return null

  return (
    <figure className={`relative flex flex-col overflow-hidden border border-line bg-[#0b0b0a] ${className}`}>
      <div className="relative min-h-0 flex-1">
        {!prep && <div className="absolute inset-0 animate-pulse bg-bone/[0.02]" aria-hidden />}
        {prep && !static2d && <div ref={hostRef} className="absolute inset-0" />}
        {prep && static2d && <StaticGrid prep={prep} yi={yi} />}

        {/* HTML labels anchored in the scene */}
        {prep && !static2d &&
          Object.keys(prep.input.anchors).map((k) => (
            <span
              key={k}
              ref={(el) => {
                labelRefs.current[k] = el
              }}
              className="group pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] text-bone-dim will-change-transform"
            >
              <span className="flex -translate-y-1/2 items-center gap-1.5">
                <span className="h-px w-3 bg-bone-dim/60 group-data-[side=l]:order-2" />
                <span>
                  {k}
                  <span className="hidden sm:inline"> ({prep.labels[k]})</span>
                </span>
              </span>
            </span>
          ))}
        {prep && !static2d && (
          <span
            ref={sweepRef}
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] text-bone opacity-0 will-change-transform"
          >
            <span className="block -translate-x-full pr-1">Aqua · {overpass !== undefined ? `${hhmm(overpass)} local` : 'afternoon pass'}</span>
          </span>
        )}

        <figcaption className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] leading-5 text-bone-dim md:left-auto md:right-5 md:top-5 md:text-right">
          <span className="text-bone">Vietnam · March · fire-active 10 km cells</span>
          <span className="block text-[clamp(1.75rem,3vw,2.5rem)] font-medium leading-none tracking-tight text-bone tabular-nums">{year ?? ''}</span>
          {prep && <span className="mt-1 block tabular-nums">{fmtInt(prep.totals[yi])} cell-days, all cells</span>}
        </figcaption>
        <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] text-muted md:left-5">point estimate · NASA FIRMS</p>
      </div>

      {prep && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play years'}
            className="grid h-8 w-8 shrink-0 place-items-center border border-line text-bone transition-colors hover:border-bone-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember"
          >
            {playing ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 1.5v9l7-4.5z" fill="currentColor" /></svg>
            )}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-muted">{prep.years[0]}</span>
          <input
            type="range"
            min={0}
            max={prep.years.length - 1}
            step={1}
            value={yi}
            onChange={(e) => {
              setPlaying(false)
              setYi(Number(e.target.value))
            }}
            aria-label="Year"
            aria-valuetext={String(year)}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-[#ecebe4] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ember"
          />
          <span className="font-mono text-[11px] tabular-nums text-muted">{prep.years[prep.years.length - 1]}</span>
          <Legend vmax={prep.input.vmax} className="ml-4 hidden md:block" />
        </div>
      )}
      {prep && <Legend vmax={prep.input.vmax} className="mx-4 mb-3 md:hidden" />}
    </figure>
  )
}

function Legend({ vmax, className = '' }: { vmax: number; className?: string }) {
  const ticks = LEGEND_TICKS.filter((t) => t < vmax)
  return (
    <div className={`w-44 shrink-0 font-mono text-[10px] text-muted ${className}`}>
      <div className="mb-1 whitespace-nowrap text-bone-dim">cell-days per cell · √ scale</div>
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => inferno(0.12 + (0.88 * i) / 8)).join(',')})` }}
      />
      <div className="relative mt-1 h-3">
        <span className="absolute left-0">0</span>
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

/** Static top-down rendering of the same data (reduced motion / no WebGL). */
function StaticGrid({ prep, yi }: { prep: Prepared; yi: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth
      const h = cv.clientHeight
      cv.width = w * dpr
      cv.height = h * dpr
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const px = (lon: number, lat: number) => lon * Math.cos((lat * Math.PI) / 180)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const r of prep.input.rings) for (const [lon, lat] of r) {
        const x = px(lon, lat)
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat)
      }
      const pad = 24
      const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad - 40) / (y1 - y0))
      const ox = (w - (x1 - x0) * s) / 2
      const oy = (h - (y1 - y0) * s) / 2
      const P = (lon: number, lat: number) => [ox + (px(lon, lat) - x0) * s, oy + (y1 - lat) * s] as const
      ctx.strokeStyle = 'rgba(236,235,228,0.18)'
      ctx.lineWidth = 0.6
      for (const r of prep.input.rings) {
        ctx.beginPath()
        r.forEach(([lon, lat], i) => {
          const [x, y] = P(lon, lat)
          if (i) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.stroke()
      }
      const cs = Math.max(1, prep.input.cellSize * s * 0.9)
      const row = prep.input.values[yi]
      prep.input.cells.forEach(([lat, lon], i) => {
        const v = row[i]
        const [x, y] = P(lon, lat)
        ctx.fillStyle = v > 0 ? inferno(0.12 + 0.88 * Math.sqrt(Math.min(v, prep.input.vmax) / prep.input.vmax)) : GRID
        ctx.fillRect(x - cs / 2, y - cs / 2, cs, cs)
      })
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [prep, yi])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" role="img" aria-label="Map of March fire-active 10 km cells in Vietnam for the selected year" />
}
