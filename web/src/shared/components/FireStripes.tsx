import React, { useMemo, useState } from 'react'

import { inferno } from '../lib/colors'
import { fmtMonth, fmtNum } from '../lib/format'
import { useData } from '../data/load'
import { SourceChip } from './SourceChip'

/**
 * One stripe per month, national harmonized series, inferno by value (sqrt scale).
 * After ESA "Little Pictures of Climate": decades of data in one band, no axis.
 */
export function FireStripes({ height = 48, className = '' }: { height?: number; className?: string }) {
  const nat = useData('national.json')
  const [hover, setHover] = useState<number | null>(null)
  const data = useMemo(() => {
    if (nat.status !== 'ready') return null
    const v = nat.data.regions.Vietnam.harmonized
    const max = Math.max(...v.map((x) => x ?? 0))
    return { months: nat.data.months, v, max }
  }, [nat])
  if (nat.status === 'error') return null
  if (!data) return <div className={className} style={{ height }} aria-hidden />

  const n = data.months.length
  const h = hover !== null ? { m: data.months[hover], v: data.v[hover] } : null
  return (
    <figure className={className}>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${n} 1`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height }}
          role="img"
          aria-label={`Monthly harmonized fire activity in Vietnam, ${fmtMonth(data.months[0])} to ${fmtMonth(data.months[n - 1])}, one stripe per month`}
        >
          {data.v.map((x, i) => (
            <rect
              key={i}
              x={i}
              y={0}
              width={1.02}
              height={1}
              fill={x === null ? '#141412' : inferno(Math.sqrt(x / data.max))}
              onMouseEnter={() => setHover(i)}
            />
          ))}
          {hover !== null && <rect x={hover} y={0} width={1} height={1} fill="none" stroke="#ecebe4" strokeWidth={0.12} vectorEffect="non-scaling-stroke" />}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute -top-8 whitespace-nowrap border border-line bg-ink px-2 py-1 font-mono text-[10px] text-bone"
            style={{ left: `${(hover! / n) * 100}%`, transform: `translateX(${hover! / n > 0.85 ? '-100%' : '-50%'})` }}
          >
            {fmtMonth(h.m)} · {h.v === null ? 'no data' : `${fmtNum(h.v, 0)} fire days`}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] text-muted">
          {data.months[0].slice(0, 4)} → {data.months[n - 1].slice(0, 4)} · one stripe per month, Vietnam, harmonized
        </span>
        <SourceChip csv="monthly_series.csv" plain />
      </figcaption>
    </figure>
  )
}
