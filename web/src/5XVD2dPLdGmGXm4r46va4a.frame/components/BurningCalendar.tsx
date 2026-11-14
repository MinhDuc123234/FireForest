import React, { useEffect, useMemo, useRef, useState } from 'react'

type MonthlyRow = {
  month: string
  region: string
  aquaObserved: number
  viirsRaw: number
  naiveSplice: number
  harmonized: number
  low: number
  high: number
  source: string
  aquaGap: boolean
  anomaly: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const REGIONS = ['Vietnam', 'South', 'Central', 'North-Central', 'North']
const W = 780
const H = 300
const PAD = { left: 44, right: 16, top: 18, bottom: 32 }

function parseCsv(text: string): MonthlyRow[] {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [month, region, aquaObserved, viirsRaw, naiveSplice, harmonized, low, high, source, aquaGap, , , anomaly] = line.split(',')
    return {
      month, region, aquaObserved: Number(aquaObserved), viirsRaw: Number(viirsRaw), naiveSplice: Number(naiveSplice),
      harmonized: Number(harmonized), low: Number(low), high: Number(high), source, aquaGap: aquaGap === 'True', anomaly: anomaly ?? '',
    }
  }).filter((row) => row.month && row.region && Number.isFinite(row.harmonized))
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function BurningCalendar() {
  const [rows, setRows] = useState<MonthlyRow[]>([])
  const [error, setError] = useState('')
  const [region, setRegion] = useState('Vietnam')
  const [from, setFrom] = useState('2003-01')
  const [to, setTo] = useState('2026-10')
  const chartRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/monthly_series.csv', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load monthly series (${response.status})`)
        return response.text()
      })
      .then((csv) => {
        const parsed = parseCsv(csv)
        setRows(parsed)
        if (parsed.length) {
          const min = parsed.reduce((a, b) => a.month < b.month ? a : b).month
          const max = parsed.reduce((a, b) => a.month > b.month ? a : b).month
          setFrom(min)
          setTo(max)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [])

  const availableMonths = useMemo(() => rows.map((row) => row.month).sort(), [rows])
  const rangeStart = availableMonths[0] ?? '2003-01'
  const rangeEnd = availableMonths[availableMonths.length - 1] ?? '2026-10'
  const selectedRows = useMemo(() => rows.filter((row) => row.region === region && row.month >= from && row.month <= to).sort((a, b) => a.month.localeCompare(b.month)), [rows, region, from, to])
  const years = useMemo(() => [...new Set(selectedRows.map((row) => Number(row.month.slice(0, 4))))], [selectedRows])
  const byMonth = useMemo(() => new Map(selectedRows.map((row) => [row.month, row])), [selectedRows])
  const max = Math.max(1, ...selectedRows.map((row) => row.harmonized))
  const total = selectedRows.reduce((sum, row) => sum + row.harmonized, 0)
  const latest = selectedRows.at(-1)
  const historical = latest ? rows.filter((row) => row.region === region && row.month < latest.month && row.month.slice(5) === latest.month.slice(5)).map((row) => row.harmonized).sort((a, b) => a - b) : []
  const median = historical.length ? historical.length % 2 ? historical[(historical.length - 1) / 2] : (historical[historical.length / 2 - 1] + historical[historical.length / 2]) / 2 : null

  const chart = useMemo(() => {
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const maxValue = Math.max(1, ...selectedRows.map((row) => row.high))
    const yMax = Math.ceil(maxValue / 5) * 5
    const x = (i: number) => PAD.left + (selectedRows.length <= 1 ? plotW / 2 : i / (selectedRows.length - 1) * plotW)
    const y = (v: number) => PAD.top + plotH - v / yMax * plotH
    const line = selectedRows.map((row, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(row.harmonized).toFixed(1)}`).join(' ')
    const bandTop = selectedRows.map((row, i) => `${x(i).toFixed(1)},${y(row.high).toFixed(1)}`)
    const bandBottom = [...selectedRows].reverse().map((row, j) => `${x(selectedRows.length - 1 - j).toFixed(1)},${y(row.low).toFixed(1)}`)
    const band = [...bandTop, ...bandBottom].join(' ')
    const tickStep = yMax <= 20 ? 5 : Math.ceil(yMax / 4 / 10) * 10
    const ticks = Array.from({ length: 5 }, (_, i) => i * tickStep).filter((value) => value <= yMax)
    const markIndices = new Set<number>()
    selectedRows.forEach((row, i) => { if (row.month.endsWith('-01') || i === 0 || i === selectedRows.length - 1) markIndices.add(i) })
    return { x, y, line, band, yMax, ticks, markIndices }
  }, [selectedRows])

  const exportCsv = () => {
    const fields: (keyof MonthlyRow)[] = ['month', 'region', 'aquaObserved', 'viirsRaw', 'naiveSplice', 'harmonized', 'low', 'high', 'source', 'aquaGap', 'anomaly']
    const header = ['month', 'region', 'aqua_observed', 'viirs_raw', 'naive_splice', 'harmonized', 'harmonized_lo', 'harmonized_hi', 'source', 'aqua_gap', 'anomaly']
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [header.join(','), ...selectedRows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n')
    download(`fire-activity-${region.toLowerCase().replaceAll(' ', '-')}-${from}-to-${to}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const exportSvg = () => {
    const svg = chartRef.current
    if (!svg) return
    const content = new XMLSerializer().serializeToString(svg)
    download(`fire-activity-${region.toLowerCase().replaceAll(' ', '-')}-${from}-to-${to}.svg`, content, 'image/svg+xml;charset=utf-8')
  }

  return (
    <section id="calendar" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32" data-ui="burning-calendar">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.68fr)] lg:items-end">
          <div>
            <h2 className="max-w-[15ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.04em]">A calendar of burning activity.</h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-bone-dim md:text-base">Follow harmonized activity from the start of the MODIS record through the latest VIIRS observations. Choose a region and date range; the sensor handoff is already calibrated into one series.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-l border-line pl-6">
            <label className="col-span-2 block"><span className="mb-2 block text-xs text-bone-dim">Region</span><select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full border border-line bg-ink-2 px-3 py-2.5 text-sm text-bone [color-scheme:dark] focus:border-ember">{REGIONS.map((name) => <option key={name}>{name}</option>)}</select></label>
            <label className="block"><span className="mb-2 block text-xs text-bone-dim">From</span><input type="month" min={rangeStart} max={rangeEnd} value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-line bg-ink-2 px-3 py-2.5 font-mono text-xs text-bone [color-scheme:dark] focus:border-ember" /></label>
            <label className="block"><span className="mb-2 block text-xs text-bone-dim">To</span><input type="month" min={rangeStart} max={rangeEnd} value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-line bg-ink-2 px-3 py-2.5 font-mono text-xs text-bone [color-scheme:dark] focus:border-ember" /></label>
          </div>
        </div>

        {error ? <p className="mt-10 text-sm text-ember">{error}</p> : !rows.length ? <p className="mt-10 font-mono text-xs text-muted">Loading harmonized history…</p> : (
          <>
            <div className="mt-12 border-y border-line py-5" aria-live="polite">
              <div className="grid grid-cols-2 gap-y-5 md:grid-cols-4 md:gap-0">
                <Summary label="Region" value={region} />
                <Summary label="Selected period" value={`${selectedRows.length} months`} />
                <Summary label="Harmonized cell-days" value={total.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                <Summary label={latest ? `Latest month · ${latest.month}` : 'Latest month'} value={latest ? latest.harmonized.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'} detail={median !== null ? `${median.toFixed(1)} median for prior ${MONTHS[Number(latest?.month.slice(5)) - 1]}s` : 'No prior month for comparison'} />
              </div>
            </div>

            <div className="mt-10 grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.36fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div><h3 className="text-lg font-medium">Monthly harmonized activity</h3><p className="mt-1 text-xs text-muted">MODIS-equivalent active 10 km cell-days · uncertainty band shown in orange tint</p></div>
                  <div className="flex gap-2"><button type="button" onClick={exportSvg} className="border border-line px-3 py-2 text-xs text-bone-dim transition-colors hover:border-bone-dim hover:text-bone">Download chart SVG</button><button type="button" onClick={exportCsv} disabled={!selectedRows.length} className="bg-ember px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-bone disabled:opacity-40">Download CSV</button></div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="block min-w-[640px] w-full" role="img" aria-label={`Harmonized monthly fire-active cell-days in ${region}, ${from} to ${to}`}>
                    <rect width={W} height={H} fill="#080807" />
                    {chart.ticks.map((tick) => <g key={tick}><line x1={PAD.left} x2={W - PAD.right} y1={chart.y(tick)} y2={chart.y(tick)} stroke="#2a2a26" strokeWidth="1" /><text x={PAD.left - 8} y={chart.y(tick) + 4} textAnchor="end" fill="#75746d" fontSize="10">{tick}</text></g>)}
                    {selectedRows.length > 1 && <polygon points={chart.band} fill="#ff6a1f" fillOpacity=".12" />}
                    {selectedRows.length > 0 && <path d={chart.line} fill="none" stroke="#ff6a1f" strokeWidth="2" strokeLinejoin="round" />}
                    {selectedRows.map((row, i) => <g key={row.month}><title>{`${row.month} · ${row.harmonized.toFixed(2)} cell-days${row.anomaly ? ` · ${row.anomaly} anomaly` : ''}`}</title>{chart.markIndices.has(i) && <circle cx={chart.x(i)} cy={chart.y(row.harmonized)} r="2.5" fill="#ffb17e" />}</g>)}
                    {selectedRows.length > 0 && [0, selectedRows.length - 1].map((i) => <text key={i} x={chart.x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : 'end'} fill="#a9a8a0" fontSize="10">{selectedRows[i].month}</text>)}
                  </svg>
                </div>
                {!selectedRows.length && <p className="mt-3 text-sm text-muted">No harmonized months fall inside this range.</p>}
              </div>

              <div className="min-w-0">
                <div className="flex items-end justify-between gap-3"><div><h3 className="text-lg font-medium">Burning calendar</h3><p className="mt-1 text-xs text-muted">Monthly totals by year</p></div><span className="text-xs text-bone-dim">{years.length} years</span></div>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[480px]">
                    <div className="grid grid-cols-[44px_repeat(12,minmax(0,1fr))] gap-1"><span />{MONTHS.map((name) => <span key={name} className="text-center text-[10px] text-muted">{name[0]}</span>)}
                      {years.map((y) => <React.Fragment key={y}><span className="flex items-center text-[10px] tabular-nums text-bone-dim">{y}</span>{MONTHS.map((_, m) => {
                        const key = `${y}-${String(m + 1).padStart(2, '0')}`
                        const row = byMonth.get(key)
                        const insideRange = key >= from && key <= to
                        const strength = row ? Math.sqrt(row.harmonized / max) : 0
                        const bg = row && insideRange ? `rgba(255,106,31,${0.12 + strength * 0.78})` : 'rgba(120,118,109,0.06)'
                        return <button key={key} type="button" disabled={!row || !insideRange} title={row ? `${key}: ${row.harmonized.toFixed(2)} cell-days${row.anomaly ? ` · ${row.anomaly} anomaly` : ''}` : `${key}: no data`} aria-label={row ? `${key}, ${row.harmonized.toFixed(2)} harmonized cell-days${row.anomaly ? `, ${row.anomaly} anomaly` : ''}` : `${key}, no data`} className="h-5 min-w-0 disabled:cursor-default" style={{ backgroundColor: bg }} onClick={() => { setFrom(key); setTo(key) }} />
                      })}</React.Fragment>)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] text-muted"><span>Lower activity</span><span className="mx-3 h-2 flex-1 bg-gradient-to-r from-[#2a241e] to-[#ff6a1f]" /><span>Higher activity</span></div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
              <p className="max-w-3xl">Harmonized values are estimated fire-active 10 km cell-days, not raw satellite pixel counts. Before VIIRS coverage, the series uses Aqua observations; the overlap period calibrates VIIRS to MODIS-equivalent activity.</p>
              <p>Data: out/monthly_series.csv · {selectedRows[0]?.month ?? '—'} to {selectedRows.at(-1)?.month ?? '—'}</p>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0 border-r border-line pr-4 first:pl-0 last:border-r-0 md:pl-5"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-xl font-medium tabular-nums text-bone">{value}</dd>{detail && <dd className="mt-1 text-[10px] text-bone-dim">{detail}</dd>}</div>
}
