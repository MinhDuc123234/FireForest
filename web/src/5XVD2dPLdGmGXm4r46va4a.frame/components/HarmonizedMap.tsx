import React, { useEffect, useMemo, useState } from 'react'

import { gridFile, sourceChip, useData } from '../../shared/data/load'

type GridRow = {
  cell: string
  month: string
  value: number
  lat: number
  lon: number
  region: string
  province: string
}

const W = 520
const H = 720
const MIN_LON = 101.8
const MAX_LON = 109.8
const MIN_LAT = 8.1
const MAX_LAT = 23.8
const X_PAD = 84
const Y_PAD = 48
const X_SCALE = (H - Y_PAD * 2) / (MAX_LAT - MIN_LAT) * 0.58
const Y_SCALE = (H - Y_PAD * 2) / (MAX_LAT - MIN_LAT)
const MAP_WIDTH = (MAX_LON - MIN_LON) * X_SCALE
const MAP_LEFT = (W - MAP_WIDTH) / 2

function point(lon: number, lat: number) {
  return {
    x: MAP_LEFT + (lon - MIN_LON) * X_SCALE,
    y: H - Y_PAD - (lat - MIN_LAT) * Y_SCALE,
  }
}

// Simplified Vietnam silhouette to orient the observed 10 km grid cells.
const OUTLINE: [number, number][] = [
  [102.15, 22.4], [103.0, 22.9], [103.6, 22.8], [104.3, 22.1], [105.1, 21.7],
  [106.0, 22.0], [106.7, 21.6], [107.4, 21.0], [107.5, 20.2], [106.7, 19.7],
  [106.4, 18.8], [107.0, 17.7], [108.0, 16.4], [108.2, 15.2], [107.8, 14.3],
  [109.3, 12.1], [109.2, 11.2], [108.4, 10.5], [107.8, 9.2], [106.8, 8.6],
  [105.8, 9.0], [105.1, 9.5], [104.5, 10.0], [103.8, 9.5], [103.0, 9.3],
  [102.5, 10.0], [103.0, 11.3], [104.0, 12.4], [105.1, 13.2], [105.8, 14.5],
  [105.6, 15.5], [106.3, 16.5], [107.3, 17.6], [107.0, 18.7], [105.8, 19.8],
  [105.2, 20.9], [104.1, 21.5], [103.2, 22.1], [102.15, 22.4],
]

export function HarmonizedMap() {
  const cellsFile = useData('grid_cells.json')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('all')
  const yearFile = useData(year ? gridFile(Number(year)) : null)

  // years available in the grid (first_month..last_month of grid_cells.json), latest first
  const years = useMemo(() => {
    if (cellsFile.status !== 'ready') return []
    const a = Number(cellsFile.data.meta.first_month.slice(0, 4))
    const b = Number(cellsFile.data.meta.last_month.slice(0, 4))
    return Array.from({ length: b - a + 1 }, (_, i) => String(b - i))
  }, [cellsFile])
  useEffect(() => {
    if (!year && years.length) setYear(years[0])
  }, [year, years])

  // province / region of each cell, keyed by its rounded centre
  const cellInfo = useMemo(() => {
    const m = new Map<string, { cell: string; region: string; province: string }>()
    if (cellsFile.status === 'ready')
      for (const [cell10, lat, lon, province, region] of cellsFile.data.cells) m.set(`${lat},${lon}`, { cell: String(cell10), region, province })
    return m
  }, [cellsFile])

  const rows = useMemo<GridRow[]>(() => {
    if (!year || yearFile.status !== 'ready' || !cellInfo.size) return []
    return yearFile.data.rows.map(([lat, lon, m, harm]) => {
      const info = cellInfo.get(`${lat},${lon}`)
      return { cell: info?.cell ?? `${lat},${lon}`, month: `${year}-${String(m + 1).padStart(2, '0')}`, value: harm, lat, lon,
        region: info?.region ?? '', province: info?.province ?? '' }
    })
  }, [yearFile, cellInfo, year])
  const error = cellsFile.status === 'error' ? cellsFile.error.message : year && yearFile.status === 'error' ? yearFile.error.message : ''

  const visible = useMemo(() => {
    const byCell = new Map<string, GridRow>()
    for (const row of rows) {
      if (year && row.month.slice(0, 4) !== year) continue
      if (month !== 'all' && row.month.slice(5, 7) !== month) continue
      const current = byCell.get(row.cell)
      if (current) current.value += row.value
      else byCell.set(row.cell, { ...row })
    }
    return [...byCell.values()]
  }, [rows, year, month])

  const max = Math.max(0, ...visible.map((row) => row.value))
  const total = visible.reduce((sum, row) => sum + row.value, 0)
  const outline = OUTLINE.map(([lon, lat]) => {
    const p = point(lon, lat)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')

  return (
    <section id="data-map" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ember">Vietnam · 10 km grid</p>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.5rem,6vw,5.25rem)] font-semibold leading-[0.92] tracking-[-0.04em]">A national record, cell by cell.</h2>
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-bone-dim md:text-base">Harmonized fire-active cell-days from the project output, positioned at each 10 km grid-cell center. Select a year and month to explore where activity was recorded.</p>
        </div>

        <div className="mt-12 grid overflow-hidden border border-line bg-ink-2/40 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="relative flex min-h-[520px] justify-center border-b border-line p-4 sm:p-8 lg:border-b-0 lg:border-r">
            {rows.length ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="h-[min(78vh,760px)] w-auto max-w-full" role="img" aria-label={`Map of harmonized fire activity across Vietnam for ${month === 'all' ? 'all months' : `month ${month}`} ${year}`}>
                <defs>
                  <pattern id="vn-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#292923" strokeWidth="1" /></pattern>
                </defs>
                <rect width={W} height={H} fill="url(#vn-grid)" />
                <path d={`M${outline.replaceAll(' ', ' L')} Z`} fill="#161f19" stroke="#677a64" strokeWidth="1.3" />
                {[10, 15, 20].map((lat) => {
                  const p = point(MIN_LON, lat)
                  return <g key={lat}><line x1={MAP_LEFT} x2={MAP_LEFT + MAP_WIDTH} y1={p.y} y2={p.y} stroke="#35372f" strokeDasharray="3 5" /><text x={MAP_LEFT - 8} y={p.y + 3} textAnchor="end" fill="#77766e" fontFamily="monospace" fontSize="9">{lat}°N</text></g>
                })}
                {visible.map((row) => {
                  const p = point(row.lon, row.lat)
                  const t = max ? Math.sqrt(row.value / max) : 0
                  const radius = 1.6 + t * 4.4
                  return <circle key={row.cell} cx={p.x} cy={p.y} r={radius} fill="#ff6a1f" fillOpacity={0.18 + t * 0.78} stroke="#ffb17e" strokeOpacity={t * 0.65} strokeWidth="0.5"><title>{`${row.province}, ${row.region}\n${Number(row.value.toFixed(2))} harmonized cell-days`}</title></circle>
                })}
                <text x={W / 2} y={H - 14} textAnchor="middle" fill="#77766e" fontFamily="monospace" fontSize="9">Cell markers · 10 km resolution · stylized boundary</text>
              </svg>
            ) : error ? (
              <p className="m-auto max-w-sm text-center text-sm text-ember">{error}</p>
            ) : (
              <p className="m-auto font-mono text-xs text-muted">Loading harmonized grid…</p>
            )}
          </div>

          <div className="flex flex-col p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
              <div><h3 className="text-sm font-medium">Harmonized activity</h3><p className="mt-1 font-mono text-[10px] text-muted">MODIS-equivalent cell-days · monthly source data</p></div>
              <span className="border border-ember/50 px-2 py-1 font-mono text-[10px] text-ember">{year || '…'}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-px border border-line bg-line">
              <Stat label="Active cells" value={visible.length.toLocaleString()} />
              <Stat label="Cell-days" value={total.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-muted">Year</span><select value={year} onChange={(e) => setYear(e.target.value)} className="w-full border border-line bg-ink px-3 py-2 font-mono text-sm text-bone [color-scheme:dark] focus:border-ember">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
              <label className="block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-muted">Month</span><select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full border border-line bg-ink px-3 py-2 font-mono text-sm text-bone [color-scheme:dark] focus:border-ember"><option value="all">Full year</option>{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m} value={m}>{new Date(2000, Number(m) - 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
            </div>
            <div className="mt-8 border-t border-line pt-6">
              <div className="flex items-center justify-between font-mono text-[10px] text-muted"><span>Lower activity</span><span>Higher activity</span></div>
              <div className="mt-2 h-2 w-full bg-gradient-to-r from-[#2a241e] via-[#a84419] to-[#ffb17e]" />
              <p className="mt-5 text-xs leading-relaxed text-muted">{month === 'all' ? `Annual total across ${year || 'selected year'};` : `Monthly value for ${new Date(2000, Number(month) - 1).toLocaleString('en', { month: 'long' })} ${year || ''};`} each marker is a grid cell with harmonized detections in the source output. The outline is simplified for orientation.</p>
            </div>
          </div>
        </div>
        <p className="mt-3 font-mono text-[10px] text-muted">{sourceChip('out/grid10km_monthly_harmonized.csv')} · point estimate · grid/{year || '…'}.json</p>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-ink p-4"><dt className="font-mono text-[9px] uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tracking-tight text-bone">{value}</dd></div>
}
