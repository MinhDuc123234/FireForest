import React from 'react'

import { MONTHS } from '../lib/format'

/** Month + year picker in English (replaces <input type="month">, which follows the browser locale). */
export function MonthYearSelect({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  /** "YYYY-MM" */
  value: string
  min: string
  max: string
  onChange: (v: string) => void
}) {
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const y0 = Number(min.slice(0, 4))
  const y1 = Number(max.slice(0, 4))
  const clamp = (v: string) => (v < min ? min : v > max ? max : v)
  const set = (yy: number, mm: number) => onChange(clamp(`${yy}-${String(mm).padStart(2, '0')}`))
  const cls =
    'border border-line bg-ink-2 px-2 py-2 font-mono text-xs text-bone [color-scheme:dark] focus:border-bone-dim focus:outline-none'
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-mono text-[11px] text-muted">{label}</legend>
      <div className="flex gap-1">
        <select aria-label={`${label} month`} value={m} onChange={(e) => set(y, Number(e.target.value))} className={`${cls} w-[4.5rem]`}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label={`${label} year`} value={y} onChange={(e) => set(Number(e.target.value), m)} className={`${cls} min-w-0 flex-1`}>
          {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}
