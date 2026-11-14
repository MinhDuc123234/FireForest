import React from 'react'
import { MONTHS, type Detection } from '../../shared/data/fires'

export type MonthFilter = { month: number; year: number | null } | null

type Props = {
  detections: Detection[]
  years: number[]
  value: MonthFilter
  onChange: (value: MonthFilter) => void
}

export function MonthHeatmap({ detections, years, value, onChange }: Props) {
  const counts = new Map<string, number>()
  for (const d of detections) {
    const key = `${d.year}-${d.month}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const max = Math.max(1, ...counts.values())
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[52px_repeat(12,minmax(0,1fr))] gap-1">
          <span aria-hidden />
          {MONTHS.map((month) => <span key={month} className="pb-1 text-center font-mono text-[10px] text-muted">{month[0]}</span>)}
          {years.map((year) => (
            <React.Fragment key={year}>
              <span className="flex items-center font-mono text-[10px] text-bone-dim">{year}</span>
              {MONTHS.map((month, monthIndex) => {
                const count = counts.get(`${year}-${monthIndex}`) ?? 0
                const active = value?.month === monthIndex && (value.year === null || value.year === year)
                const alpha = count === 0 ? 0.035 : 0.12 + 0.78 * (count / max)
                return <button key={`${year}-${month}`} type="button" title={`${month} ${year}: ${count} detections`} aria-label={`${month} ${year}: ${count} detections`} aria-pressed={active} onClick={() => onChange(active ? null : { month: monthIndex, year })} className={`h-7 border transition-colors hover:border-ember ${active ? 'border-ember ring-1 ring-ember' : 'border-line'}`} style={{ backgroundColor: `rgba(255, 106, 31, ${alpha})` }} />
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => onChange(value?.year === null ? null : { month: value?.month ?? 2, year: null })} className="text-left text-[11px] text-muted transition-colors hover:text-bone">{value?.year === null ? 'Showing this month across all years · click to clear' : 'Click a month label to compare across all years'}</button>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-muted"><span>Fewer</span><span className="h-2.5 w-16 bg-gradient-to-r from-[#25231f] to-[#ff6a1f]" /><span>More</span></div>
        </div>
      </div>
    </div>
  )
}
