import React, { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'

import { MonthYearSelect } from '../../shared/components/MonthYearSelect'
import { SourceChip } from '../../shared/components/SourceChip'
import { sourceChip, useData, type National, type Region } from '../../shared/data/load'
import { AQUA, GRID, TRUST, WARN, inferno } from '../../shared/lib/colors'
import { MONTHS, MONTHS_LONG, fmtInt, fmtMonth, fmtNum } from '../../shared/lib/format'
import { useWidth } from '../../shared/lib/useWidth'

type Row = {
  month: string
  aqua: number | null
  raw: number | null
  naive: number | null
  harmonized: number
  lo: number
  hi: number
  source: string
  gap: boolean
  z: number | null
  anomaly: string
}

/** Rows of one region from national.json; `source` labels are those harmonize_fire_v2.py writes. */
function rowsOf(d: National, region: Region): Row[] {
  const s = d.regions[region]
  return d.months.flatMap((month, i) => {
    const h = s.harmonized[i]
    if (h === null) return []
    return [{
      month, aqua: s.aqua_observed[i], raw: s.snpp_raw[i], naive: s.naive_splice[i], harmonized: h,
      lo: s.lo[i] ?? h, hi: s.hi[i] ?? h,
      source: month >= d.meta.viirs_start ? 'VIIRS->MODIS-equivalent' : 'Aqua observed',
      gap: s.aqua_gap[i], z: s.z[i], anomaly: s.anomaly[i] ?? '',
    }]
  })
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null
}

export function BurningCalendar() {
  const national = useData('national.json')
  const [region, setRegion] = useState<Region>('Vietnam')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const chartRef = useRef<SVGSVGElement>(null)

  const d = national.status === 'ready' ? national.data : null
  useEffect(() => {
    if (d && !from) setFrom(d.meta.first_month)
    if (d && !to) setTo(d.meta.last_month)
  }, [d, from, to])

  const all = useMemo(() => (d ? rowsOf(d, region) : []), [d, region])
  const sel = useMemo(() => all.filter((r) => r.month >= from && r.month <= to), [all, from, to])

  if (national.status === 'error') return null
  if (!d || !from || !to) return <section id="calendar" className="min-h-[900px]" />

  const total = sel.reduce((s, r) => s + r.harmonized, 0)
  const latest = sel[sel.length - 1]
  const prior = latest ? all.filter((r) => r.month < latest.month && r.month.slice(5) === latest.month.slice(5)).map((r) => r.harmonized) : []
  const med = median(prior)
  const tag = `${region.toLowerCase().replace(/\s+/g, '-')}-${from}-to-${to}`

  const exportCsv = () => {
    const header = ['month', 'region', 'aqua_observed', 'snpp_raw', 'naive_splice', 'harmonized', 'harmonized_lo', 'harmonized_hi', 'source', 'aqua_gap', 'z', 'anomaly']
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const body = sel.map((r) => [r.month, region, r.aqua, r.raw, r.naive, r.harmonized, r.lo, r.hi, r.source, r.gap, r.z, r.anomaly].map(q).join(','))
    download(`fireforest-${tag}.csv`, [`# ${sourceChip('out/monthly_series.csv')} · values rounded to 0.1 (national.json)`, header.join(','), ...body].join('\n'), 'text/csv;charset=utf-8')
  }
  const exportSvg = () => {
    if (chartRef.current) download(`fireforest-${tag}.svg`, new XMLSerializer().serializeToString(chartRef.current), 'image/svg+xml;charset=utf-8')
  }

  return (
    <section id="calendar" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[11px] text-muted">Seasons · calendar</p>
        <div className="mt-3 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-8">
          <div className="lg:col-span-7">
            <h2 className="max-w-[16ch] text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
              {fmtInt(all.length)} months on one scale
            </h2>
            <p className="mt-5 max-w-[56ch] text-sm leading-relaxed text-bone-dim md:text-base">
              Harmonized activity from the start of the Aqua record to the latest VIIRS month. Pick a region and a period; click a
              cell to isolate one month.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-5">
            <label className="block min-w-0">
              <span className="mb-2 block font-mono text-[11px] text-muted">Region</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className="w-full border border-line bg-ink-2 px-2 py-2 text-sm text-bone [color-scheme:dark] focus:border-bone-dim focus:outline-none"
              >
                {d.meta.regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <MonthYearSelect label="From" value={from} min={d.meta.first_month} max={to} onChange={setFrom} />
            <MonthYearSelect label="To" value={to} min={from} max={d.meta.last_month} onChange={setTo} />
          </div>
        </div>

        <dl className="mt-12 grid grid-cols-2 border-y border-line md:grid-cols-4">
          <Stat k="Region" v={region} />
          <Stat k="Period" v={`${fmtInt(sel.length)} months`} />
          <Stat k="Harmonized cell-days" v={fmtInt(total)} />
          <Stat
            k={latest ? `Latest · ${fmtMonth(latest.month)}` : 'Latest'}
            v={latest ? fmtNum(latest.harmonized, 0) : '—'}
            note={med !== null && latest ? `median of earlier ${MONTHS[Number(latest.month.slice(5)) - 1]}s: ${fmtNum(med, 0)}` : undefined}
          />
        </dl>

        <div className="mt-10 grid gap-12 xl:grid-cols-12 xl:gap-8">
          <div className="min-w-0 xl:col-span-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium">Monthly harmonized activity</h3>
                <p className="mt-1 font-mono text-[11px] text-muted">line = harmonized · band = 95%</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportSvg} className="border border-line px-3 py-2 text-xs text-bone-dim transition-colors hover:border-bone-dim hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember">
                  Chart SVG
                </button>
                <button type="button" onClick={exportCsv} disabled={!sel.length} className="bg-ember px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-bone disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember">
                  Download CSV
                </button>
              </div>
            </div>
            <RangeChart rows={sel} svgRef={chartRef} region={region} />
          </div>
          <div className="min-w-0 xl:col-span-5">
            <h3 className="text-lg font-medium">Year × month</h3>
            <p className="mt-1 font-mono text-[11px] text-muted">colour = harmonized cell-days (√ scale)</p>
            <Heatmap all={all} from={from} to={to} viirsStart={d.meta.viirs_start} onPick={(m) => { setFrom(m); setTo(m) }} />
          </div>
        </div>
        <SourceChip csv="monthly_series.csv" className="mt-8" extra={`${region} · ${fmtMonth(from)}–${fmtMonth(to)}`} />
      </div>
    </section>
  )
}

function Stat({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="min-w-0 py-5 pr-4 md:border-l md:border-line md:px-6 md:first:border-l-0 md:first:pl-0">
      <dt className="font-mono text-[11px] text-muted">{k}</dt>
      <dd className="mt-1 truncate text-xl font-medium tabular-nums text-bone">{v}</dd>
      {note && <dd className="mt-1 font-mono text-[10px] text-bone-dim">{note}</dd>}
    </div>
  )
}

function RangeChart({ rows, svgRef, region }: { rows: Row[]; svgRef: React.RefObject<SVGSVGElement>; region: Region }) {
  const [ref, W] = useWidth()
  const H = W < 600 ? 280 : 420
  const m = { l: 48, r: 10, t: 22, b: 26 }
  const [hover, setHover] = useState<number | null>(null)
  if (!rows.length) return <div ref={ref} className="mt-4 h-[280px] text-sm text-muted">No months in this range.</div>
  const x = scaleLinear().domain([0, Math.max(1, rows.length - 1)]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, Math.max(1, ...rows.map((r) => r.hi))]).range([H - m.b, m.t]).nice(4)
  const idx = rows.map((_, i) => i)
  const band = area<number>().x(x).y0((i) => y(rows[i].lo)).y1((i) => y(rows[i].hi))(idx) ?? ''
  const ln = line<number>().x(x).y((i) => y(rows[i].harmonized))(idx) ?? ''
  const span = rows.length / 12
  const every = Math.max(1, Math.ceil(span / (W < 520 ? 4 : W < 800 ? 7 : 12)))
  const yearTicks = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.month.endsWith('-01') && Number(r.month.slice(0, 4)) % every === 0)
  const h = hover !== null ? rows[hover] : null
  return (
    <div ref={ref} className="relative mt-4">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={W}
        height={H}
        className="block touch-pan-y"
        role="img"
        aria-label={`Harmonized monthly fire-active 10 km cell-days, ${region}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round(x.invert(e.clientX - r.left))
          setHover(i >= 0 && i < rows.length ? i : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        <rect width={W} height={H} fill="#080807" />
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={0.7} />
            <text x={m.l - 8} y={y(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{fmtInt(t)}</text>
          </g>
        ))}
        <text x={0} y={10} fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">cell-days / month</text>
        {rows.length > 1 && <path d={band} fill={TRUST} fillOpacity={0.18} />}
        <path d={ln} fill="none" stroke={TRUST} strokeWidth={1.6} strokeLinejoin="round" />
        {rows.length === 1 && <circle cx={x(0)} cy={y(rows[0].harmonized)} r={3} fill={TRUST} />}
        {yearTicks.map(({ r, i }) => (
          <text key={r.month} x={x(i)} y={H - 8} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{r.month.slice(0, 4)}</text>
        ))}
        {!yearTicks.length && (
          <text x={m.l} y={H - 8} fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{fmtMonth(rows[0].month)}</text>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke={AQUA} strokeOpacity={0.5} />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-6 z-10 border border-line bg-ink/95 px-3 py-2 font-mono text-[11px] tabular-nums" style={{ left: Math.min(x(hover!) + 12, W - 180) }}>
          <div className="text-bone">{fmtMonth(h.month)}</div>
          <div style={{ color: TRUST }}>harmonized {fmtInt(h.harmonized)}</div>
          <div className="text-muted">95% {fmtInt(h.lo)}–{fmtInt(h.hi)}</div>
          {h.anomaly && <div className="text-bone-dim">{h.anomaly} anomaly · z {fmtNum(h.z ?? 0, 2)}</div>}
          {h.gap && <div style={{ color: WARN }}>Aqua gap month</div>}
        </div>
      )}
    </div>
  )
}

function Heatmap({ all, from, to, viirsStart, onPick }: { all: Row[]; from: string; to: string; viirsStart: string; onPick: (m: string) => void }) {
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null)
  const byMonth = useMemo(() => new Map(all.map((r) => [r.month, r])), [all])
  const years = useMemo(() => [...new Set(all.map((r) => Number(r.month.slice(0, 4))))], [all])
  const max = Math.max(1, ...all.map((r) => r.harmonized))
  const h = hover ? byMonth.get(`${hover.y}-${String(hover.m + 1).padStart(2, '0')}`) : undefined
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[2.25rem_repeat(12,minmax(0,1fr))] gap-[2px]" onMouseLeave={() => setHover(null)}>
        <span />
        {MONTHS.map((name, i) => (
          <span key={name} className={`pb-1 text-center font-mono text-[10px] ${hover?.m === i ? 'text-bone' : 'text-muted'}`}>{name[0]}</span>
        ))}
        {years.map((yy) => (
          <React.Fragment key={yy}>
            <span className={`flex items-center font-mono text-[10px] tabular-nums ${hover?.y === yy ? 'text-bone' : 'text-muted'}`}>{yy}</span>
            {MONTHS.map((_, mi) => {
              const key = `${yy}-${String(mi + 1).padStart(2, '0')}`
              const r = byMonth.get(key)
              const inRange = key >= from && key <= to
              const dim = hover && hover.y !== yy && hover.m !== mi
              if (!r) return <span key={key} className="aspect-[1.6] bg-bone/[0.03]" />
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${fmtMonth(key)}: ${fmtNum(r.harmonized, 0)} cell-days${r.anomaly ? `, ${r.anomaly} anomaly` : ''}${r.gap ? ', Aqua gap month' : ''}`}
                  onMouseEnter={() => setHover({ y: yy, m: mi })}
                  onFocus={() => setHover({ y: yy, m: mi })}
                  onClick={() => onPick(key)}
                  className={`relative aspect-[1.6] min-w-0 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember ${dim ? 'opacity-30' : inRange ? 'opacity-100' : 'opacity-25'}`}
                  style={{
                    backgroundColor: inferno(0.08 + 0.92 * Math.sqrt(r.harmonized / max)),
                    boxShadow: r.anomaly ? `inset 0 0 0 1.5px ${r.anomaly === 'high' ? AQUA : '#75746d'}` : undefined,
                    backgroundImage: r.gap ? `repeating-linear-gradient(45deg, transparent 0 3px, ${WARN} 3px 4px)` : undefined,
                  }}
                >
                  {key === viirsStart && <span className="absolute inset-y-0 left-0 w-[2px] bg-bone" aria-hidden />}
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 min-h-[2.5rem] font-mono text-[11px] tabular-nums">
        {h ? (
          <span className="text-bone">
            {MONTHS_LONG[Number(h.month.slice(5)) - 1]} {h.month.slice(0, 4)} · {fmtNum(h.harmonized, 0)} cell-days
            {h.z !== null && <span className="text-muted"> · z {fmtNum(h.z, 2)}</span>}
            {h.gap && <span style={{ color: WARN }}> · Aqua gap</span>}
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
            <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ boxShadow: `inset 0 0 0 1.5px ${AQUA}` }} />|z| ≥ 2 high</span>
            <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ boxShadow: 'inset 0 0 0 1.5px #75746d' }} />low</span>
            <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, ${WARN} 3px 4px)` }} />Aqua gap</span>
            <span><span className="mr-1 inline-block h-2.5 w-[2px] bg-bone align-middle" />VIIRS from {fmtMonth(viirsStart)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
