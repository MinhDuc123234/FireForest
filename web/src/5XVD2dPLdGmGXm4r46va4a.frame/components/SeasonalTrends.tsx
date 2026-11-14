import React, { useState } from 'react'
import { scaleLinear } from 'd3-scale'

import { SourceChip } from '../../shared/components/SourceChip'
import { useData, type Region, type SeasonalRow } from '../../shared/data/load'
import { AQUA, GRID, inferno } from '../../shared/lib/colors'
import { MONTHS, MONTHS_LONG, fmtInt, fmtNum } from '../../shared/lib/format'
import { useWidth } from '../../shared/lib/useWidth'

const SHARE_LABEL_MIN = 12 // label months holding at least this % of the year
const regionPhrase = (r: Region) => (r === 'Vietnam' ? 'nationally' : `in the ${r}`)

export function SeasonalTrends() {
  const seasonal = useData('seasonal.json')
  const [region, setRegion] = useState<Region>('Vietnam')
  if (seasonal.status === 'error') return null
  if (seasonal.status !== 'ready') return <section id="seasonal" className="min-h-[600px]" />
  const regions = Object.keys(seasonal.data.regions) as Region[]
  const rows = seasonal.data.regions[region]
  const peak = rows.reduce((a, b) => (b.share_of_year_pct > a.share_of_year_pct ? b : a))
  const top3 = [...rows].sort((a, b) => b.share_of_year_pct - a.share_of_year_pct).slice(0, 3)
  const top3Share = top3.reduce((s, r) => s + r.share_of_year_pct, 0)

  return (
    <section id="seasonal" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[11px] text-muted">Seasons</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <div className="lg:col-span-7">
            <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">When Vietnam burns</h2>
            <p className="mt-5 max-w-[34ch] text-[clamp(1.25rem,2vw,1.5rem)] font-medium leading-snug text-bone">
              {MONTHS_LONG[peak.cal_month - 1]} alone is {fmtNum(peak.share_of_year_pct, 1)}% of the year {regionPhrase(region)}.
            </p>
          </div>
          <div className="lg:col-span-5">
            <p className="max-w-[48ch] text-sm leading-relaxed text-bone-dim">
              Mean monthly harmonized cell-days over full calendar years, with the 10th–90th percentile range of individual
              years. {top3.map((r) => MONTHS[r.cal_month - 1]).join(', ')} together hold {fmtNum(top3Share, 0)}% of the year.
            </p>
            <div className="mt-5 flex flex-wrap gap-1" role="radiogroup" aria-label="Region">
              {regions.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={r === region}
                  onClick={() => setRegion(r)}
                  className={`border px-3 py-1.5 font-mono text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember ${
                    r === region ? 'border-bone bg-bone text-ink' : 'border-line text-bone-dim hover:border-bone-dim hover:text-bone'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <MonthColumns rows={rows} region={region} />
        <SourceChip csv="seasonal_calendar.csv" className="mt-3" extra={`${region} · mean, p10–p90 of full years`} />
      </div>
    </section>
  )
}

function MonthColumns({ rows, region }: { rows: SeasonalRow[]; region: Region }) {
  const [ref, W] = useWidth()
  const narrow = W < 600
  const H = narrow ? 260 : 340
  const m = { l: narrow ? 44 : 52, r: 8, t: 34, b: 26 }
  const top = Math.max(...rows.map((r) => r.p90))
  const y = scaleLinear().domain([0, top]).range([H - m.b, m.t]).nice(4)
  const cw = (W - m.l - m.r) / 12
  const bw = cw * 0.62
  const maxMean = Math.max(...rows.map((r) => r.mean))
  return (
    <div ref={ref} className="mt-12">
      <svg width={W} height={H} className="block" role="img" aria-label={`Mean monthly fire-active 10 km cell-days by calendar month, ${region}, with 10th–90th percentile range`}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={t === 0 ? 1.2 : 0.8} />
            <text x={m.l - 10} y={y(t) + 4} textAnchor="end" className="fill-muted font-mono text-[10px] tabular-nums">{fmtInt(t)}</text>
          </g>
        ))}
        <text x={0} y={m.t - 20} className="fill-muted font-mono text-[10px]">cell-days / month</text>
        {rows.map((r, i) => {
          const cx = m.l + cw * i + cw / 2
          const labelled = r.share_of_year_pct >= SHARE_LABEL_MIN
          return (
            <g key={r.cal_month}>
              <title>{`${MONTHS_LONG[r.cal_month - 1]}: mean ${fmtNum(r.mean, 0)}, median ${fmtNum(r.median, 0)}, p10–p90 ${fmtNum(r.p10, 0)}–${fmtNum(r.p90, 0)} cell-days · ${fmtNum(r.share_of_year_pct, 1)}% of the year`}</title>
              <rect x={cx - bw / 2} y={y(r.mean)} width={bw} height={y(0) - y(r.mean)} fill={inferno(0.18 + 0.82 * Math.sqrt(r.mean / maxMean))} />
              <line x1={cx} x2={cx} y1={y(r.p10)} y2={y(r.p90)} stroke={AQUA} strokeWidth={1.4} />
              <line x1={cx - 4} x2={cx + 4} y1={y(r.p10)} y2={y(r.p10)} stroke={AQUA} strokeWidth={1.2} />
              <line x1={cx - 4} x2={cx + 4} y1={y(r.p90)} y2={y(r.p90)} stroke={AQUA} strokeWidth={1.2} />
              {labelled && (
                <text x={cx} y={y(r.p90) - 7} textAnchor="middle" className={`font-mono ${narrow ? 'text-[10px]' : 'text-[12px]'} font-medium tabular-nums`} fill={AQUA}>
                  {fmtNum(r.share_of_year_pct, 0)}%
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[10px]">{narrow ? MONTHS[r.cal_month - 1][0] : MONTHS[r.cal_month - 1]}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] text-muted">
        <span>bar = mean</span>
        <span className="text-bone-dim"><span className="mr-1 inline-block h-2.5 w-px bg-bone align-middle" />p10–p90 of years</span>
        <span>% = share of the year, shown when ≥ {SHARE_LABEL_MIN}%</span>
      </div>
    </div>
  )
}
