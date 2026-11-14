import React, { useEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'

import { SourceChip } from '../../shared/components/SourceChip'
import { gridFile, useData, type GridCell, type ProvincesGeo } from '../../shared/data/load'
import { AQUA, TRUST, WARN, inferno } from '../../shared/lib/colors'
import { MONTHS, MONTHS_LONG, fmtInt, fmtNum } from '../../shared/lib/format'
import { useWidth } from '../../shared/lib/useWidth'

const HALF_CELL_DEG = 5 / 111.195 // half of a 10 km cell in degrees of latitude (KM_DEG, harmonize_fire_v2.py)
const OFFSHORE_LON = 110.5 // parts east of this are the archipelagos (same rule as export_data.py)
const ARCHIPELAGO: Record<string, string> = { 'Đà Nẵng': 'Hoàng Sa', 'Khánh Hòa': 'Trường Sa' }

type FC = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { name: string }; geometry: GeoPermissibleObjects }[] }

/** Planar signed area of a [lon, lat] ring (> 0 = counter-clockwise). */
const signed = (r: number[][]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
/**
 * d3-geo uses the spherical convention (exterior rings clockwise); geoBoundaries follows RFC 7946
 * (counter-clockwise). Rewind every polygon so d3 does not read it as "the whole globe minus Vietnam".
 */
const rewind = (poly: number[][][]) => poly.map((r, i) => ((i === 0) === signed(r) > 0 ? [...r].reverse() : r))

/** Split provinces into the mainland and the two offshore archipelagos. */
function split(geo: ProvincesGeo) {
  const main: FC = { type: 'FeatureCollection', features: [] }
  const off: Record<string, FC> = {}
  for (const f of geo.features) {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(rewind)
    const near = polys.filter((p) => Math.min(...p[0].map((c) => c[0])) <= OFFSHORE_LON)
    const far = polys.filter((p) => Math.min(...p[0].map((c) => c[0])) > OFFSHORE_LON)
    if (near.length) main.features.push({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: near } as GeoPermissibleObjects })
    if (far.length) {
      const k = ARCHIPELAGO[f.properties.name] ?? f.properties.name
      off[k] = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: far } as GeoPermissibleObjects }] }
    }
  }
  return { main, off }
}

export function HarmonizedMap() {
  const cellsF = useData('grid_cells.json')
  const geoF = useData('provinces.geojson')
  const natF = useData('national.json')
  const trustF = useData('trust.json')
  const [year, setYear] = useState(0)
  const [month, setMonth] = useState(0) // 0 = full year, 1..12
  const yearF = useData(year ? gridFile(year) : null)

  const years = useMemo(() => {
    if (cellsF.status !== 'ready') return []
    const a = Number(cellsF.data.meta.first_month.slice(0, 4)), b = Number(cellsF.data.meta.last_month.slice(0, 4))
    return Array.from({ length: b - a + 1 }, (_, i) => b - i)
  }, [cellsF])
  useEffect(() => {
    if (!year && years.length) {
      setYear(years[1] ?? years[0]) // latest complete year
      setMonth(3)
    }
  }, [year, years])

  const values = useMemo(() => {
    const v = new Map<string, number>()
    if (yearF.status !== 'ready') return v
    for (const [lat, lon, m, h] of yearF.data.rows) {
      if (month && m !== month - 1) continue
      const k = `${lat},${lon}`
      v.set(k, (v.get(k) ?? 0) + h)
    }
    return v
  }, [yearF, month])

  if ([cellsF, geoF, natF, trustF].some((s) => s.status === 'error')) return null
  if (cellsF.status !== 'ready' || geoF.status !== 'ready' || natF.status !== 'ready' || trustF.status !== 'ready' || !year)
    return <section id="data-map" className="min-h-[900px]" />

  const cells = cellsF.data.cells
  let total = 0, active = 0
  const byProv = new Map<string, number>()
  for (const c of cells) {
    const v = values.get(`${c[1]},${c[2]}`) ?? 0
    if (v > 0) {
      active++
      total += v
      byProv.set(c[3], (byProv.get(c[3]) ?? 0) + v)
    }
  }
  const top = [...byProv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const ym = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`
  const mi = month ? natF.data.months.indexOf(ym) : -1
  const gap = mi >= 0 && natF.data.regions.Vietnam.aqua_gap[mi]
  const drift = year > trustF.data.calibration_R.calib_end
  const loading = yearF.status !== 'ready'

  return (
    <section id="data-map" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[11px] text-muted">Seasons · map</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h2 className="max-w-[16ch] text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] lg:col-span-7">
            {fmtInt(cells.length)} cells, 10 km each
          </h2>
          <p className="max-w-[48ch] text-sm leading-relaxed text-bone-dim lg:col-span-5 md:text-base">
            Harmonized fire-active cell-days per 10 km cell, drawn at true size on the province map. The grid starts with VIIRS in{' '}
            {MONTHS[Number(cellsF.data.meta.first_month.slice(5)) - 1]} {cellsF.data.meta.first_month.slice(0, 4)}.
          </p>
        </div>

        <div className="mt-12 grid gap-px border border-line bg-line lg:grid-cols-12">
          <div className="relative min-w-0 bg-[#0b0b0a] lg:col-span-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
              <p className="font-mono text-[11px] tabular-nums text-bone">
                {ym} · {fmtInt(active)} active cells · {fmtInt(total)} cell-days
              </p>
              {(gap || drift) && (
                <p className="border border-dashed px-2 py-0.5 font-mono text-[10px]" style={{ borderColor: WARN, color: WARN }}>
                  {gap ? 'Aqua gap month: VIIRS-filled' : `After ${trustF.data.calibration_R.calib_end}: calibration extrapolated (Aqua drift)`}
                </p>
              )}
            </div>
            <MapCanvas geo={geoF.data} cells={cells} values={values} dim={loading} />
          </div>

          <div className="flex min-w-0 flex-col bg-ink p-6 lg:col-span-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-2 block font-mono text-[11px] text-muted">Year</span>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full border border-line bg-ink-2 px-2 py-2 font-mono text-xs text-bone [color-scheme:dark] focus:border-bone-dim focus:outline-none">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-[11px] text-muted">Month</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full border border-line bg-ink-2 px-2 py-2 font-mono text-xs text-bone [color-scheme:dark] focus:border-bone-dim focus:outline-none">
                  <option value={0}>Full year</option>
                  {MONTHS_LONG.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                </select>
              </label>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-px border border-line bg-line">
              <div className="bg-ink p-4"><dt className="font-mono text-[10px] text-muted">active cells</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{fmtInt(active)}</dd></div>
              <div className="bg-ink p-4"><dt className="font-mono text-[10px] text-muted">cell-days</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{fmtInt(total)}</dd></div>
            </dl>

            <h3 className="mt-8 font-mono text-[11px] text-muted">Top provinces, {month ? MONTHS_LONG[month - 1] : 'full year'} {year}</h3>
            <ol className="mt-3 space-y-2">
              {top.map(([p, v]) => (
                <li key={p} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
                  <span className="truncate text-bone">{p}</span>
                  <span className="font-mono text-[11px] tabular-nums text-bone-dim">{fmtNum(v, 0)}</span>
                  <span className="col-span-2 h-1 bg-line"><span className="block h-full bg-bone-dim" style={{ width: `${(v / top[0][1]) * 100}%` }} /></span>
                </li>
              ))}
            </ol>

            <div className="mt-8">
              <div className="font-mono text-[10px] text-bone-dim">cell-days per cell · √ scale · max {fmtNum(Math.max(0, ...values.values()), 1)}</div>
              <div className="mt-1 h-1.5" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => inferno(0.12 + (0.88 * i) / 8)).join(',')})` }} />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>low</span><span>high</span></div>
            </div>
            <p className="mt-auto pt-8 text-xs leading-relaxed text-muted">
              Point estimates; cell-level bands are not computed. Province outlines: geoBoundaries ADM1.
            </p>
          </div>
        </div>
        <SourceChip csv="grid10km_monthly_harmonized.csv" className="mt-3" extra={`grid/${year}.json · point estimate`} />
      </div>
    </section>
  )
}

function MapCanvas({ geo, cells, values, dim }: { geo: ProvincesGeo; cells: GridCell[]; values: Map<string, number>; dim: boolean }) {
  const [wrap, W] = useWidth()
  const cvRef = useRef<HTMLCanvasElement>(null)
  const { main, off } = useMemo(() => split(geo), [geo])
  const [hover, setHover] = useState<{ x: number; y: number; c: GridCell; v: number } | null>(null)

  // layout: mainland on the left ~70%, insets in the sea to the right
  const layout = useMemo(() => {
    const mainW = Math.round(W * 0.72)
    const proj = geoMercator().fitWidth(mainW - 24, main as unknown as GeoPermissibleObjects)
    const b = geoPath(proj).bounds(main as unknown as GeoPermissibleObjects)
    const H = Math.ceil(b[1][1] - b[0][1]) + 32
    proj.translate([proj.translate()[0] + 12 - b[0][0], proj.translate()[1] + 16 - b[0][1]])
    const iw = Math.max(92, Math.round(W * 0.22))
    const insets = Object.entries(off).map(([name, fc]) => {
      const anchorLat = name === 'Hoàng Sa' ? 17.2 : 11.6
      const y0 = (proj([108, anchorLat]) ?? [0, 0])[1]
      const box: [[number, number], [number, number]] = [[W - iw - 10, y0], [W - 10, y0 + iw * 0.8]]
      const p = geoMercator().fitExtent([[box[0][0] + 8, box[0][1] + 8], [box[1][0] - 8, box[1][1] - 8]], fc as unknown as GeoPermissibleObjects)
      return { name, fc, box, p }
    })
    // cell squares: centre + side from the projected size of 10 km of latitude
    const sq = cells.map((c) => {
      const p = proj([c[2], c[1]]) ?? [0, 0]
      const a = proj([c[2], c[1] + HALF_CELL_DEG]) ?? p
      const s = Math.abs(p[1] - a[1]) * 2
      return { x: p[0], y: p[1], s }
    })
    const H2 = Math.max(H, ...insets.map((i) => i.box[1][1] + 56))
    return { proj, H: H2, insets, sq }
  }, [W, main, off, cells])

  const vmax = Math.max(0.001, ...values.values())

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = W * dpr
    cv.height = layout.H * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, layout.H)
    const path = geoPath(layout.proj, ctx)
    ctx.fillStyle = '#121210'
    ctx.strokeStyle = 'rgba(236,235,228,0.16)'
    ctx.lineWidth = 0.6
    ctx.beginPath(); path(main as unknown as GeoPermissibleObjects); ctx.fill(); ctx.stroke()
    // cells
    cells.forEach((c, i) => {
      const v = values.get(`${c[1]},${c[2]}`) ?? 0
      const q = layout.sq[i]
      const s = Math.max(1, q.s * 0.92)
      ctx.fillStyle = v > 0 ? inferno(0.12 + 0.88 * Math.sqrt(v / vmax)) : 'rgba(236,235,228,0.05)'
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s)
    })
    // insets
    for (const ins of layout.insets) {
      const [[x0, y0], [x1, y1]] = ins.box
      ctx.strokeStyle = 'rgba(236,235,228,0.35)'
      ctx.lineWidth = 0.8
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1)
      const ip = geoPath(ins.p, ctx)
      ctx.fillStyle = 'rgba(236,235,228,0.55)'
      ctx.strokeStyle = 'rgba(236,235,228,0.7)'
      ctx.beginPath(); ip(ins.fc as unknown as GeoPermissibleObjects); ctx.fill(); ctx.stroke()
      // islands are far smaller than a pixel at this scale: mark each one
      ctx.fillStyle = 'rgba(236,235,228,0.85)'
      for (const f of ins.fc.features) {
        const g = f.geometry as unknown as { coordinates: number[][][][] }
        for (const poly of g.coordinates) {
          const c = ip.centroid({ type: 'Polygon', coordinates: poly } as GeoPermissibleObjects)
          if (Number.isFinite(c[0])) { ctx.beginPath(); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2); ctx.fill() }
        }
      }
    }
  }, [W, layout, values, vmax, cells, main])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    let best = -1
    for (let i = 0; i < layout.sq.length; i++) {
      const q = layout.sq[i]
      if (Math.abs(q.x - mx) <= q.s / 2 && Math.abs(q.y - my) <= q.s / 2) { best = i; break }
    }
    if (best < 0) return setHover(null)
    const c = cells[best]
    setHover({ x: layout.sq[best].x, y: layout.sq[best].y, c, v: values.get(`${c[1]},${c[2]}`) ?? 0 })
  }

  return (
    <div ref={wrap} className="relative">
      <canvas
        ref={cvRef}
        style={{ width: W, height: layout.H, opacity: dim ? 0.5 : 1 }}
        className="block transition-opacity duration-300"
        role="img"
        aria-label="Map of Vietnam's provinces with harmonized fire-active cell-days per 10 km cell; insets for Hoàng Sa and Trường Sa"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      />
      {layout.insets.map((ins) => (
        <div key={ins.name} className="pointer-events-none absolute font-mono text-[10px] leading-tight" style={{ left: ins.box[0][0], top: ins.box[1][1] + 4, width: ins.box[1][0] - ins.box[0][0] }}>
          <div className="text-bone">{ins.name}</div>
          <div className="text-bone-dim">({ins.fc.features[0].properties.name})</div>
          <div className="text-muted">inset, not to scale</div>
        </div>
      ))}
      {hover && (
        <div className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-ink/95 px-2.5 py-1.5 font-mono text-[11px] tabular-nums" style={{ left: Math.min(hover.x + 10, W - 190), top: hover.y + 10 }}>
          <div className="text-bone">{hover.c[3]}</div>
          <div className="text-muted">{hover.c[4]} · {fmtNum(hover.c[1], 2)}°N {fmtNum(hover.c[2], 2)}°E</div>
          <div style={{ color: hover.v > 0 ? TRUST : AQUA }}>{hover.v > 0 ? `${fmtNum(hover.v, 2)} cell-days` : 'no detection'}</div>
        </div>
      )}
    </div>
  )
}
