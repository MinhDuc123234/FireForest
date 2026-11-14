import React, { useMemo, useState } from 'react'

import { AQUA, WARN, fire } from '../lib/colors'
import { MONTHS, MONTHS_LONG, fmtMonth, fmtNum } from '../lib/format'
import type { BandRow } from './BandChart'

type Props = {
  rows: BandRow[]
  /** "YYYY-MM" currently shown on the map */
  current?: string
  /** months before this are not selectable (e.g. the grid starts with VIIRS) */
  selectableFrom?: string
  viirsStart: string
  onPick?: (month: string) => void
}

/**
 * Year × month calendar of harmonized cell-days (inferno, √ scale). |z| ≥ 2 outlined, Aqua gap months
 * hatched, VIIRS start marked; hovering dims the other rows and columns. Fills its column: no scroll.
 */
export function YearMonthHeatmap({ rows, current, selectableFrom, viirsStart, onPick }: Props) {
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null)
  const byMonth = useMemo(() => new Map(rows.map((r) => [r.month, r])), [rows])
  const years = useMemo(() => [...new Set(rows.map((r) => Number(r.month.slice(0, 4))))], [rows])
  const max = Math.max(1e-9, ...rows.map((r) => r.v))
  const h = hover ? byMonth.get(`${hover.y}-${String(hover.m + 1).padStart(2, '0')}`) : undefined
  const hasZ = rows.some((r) => r.anomaly)
  return (
    <div>
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
              if (!r) return <span key={key} className="h-[14px] bg-bone/[0.03] sm:h-[16px]" />
              const dim = hover && hover.y !== yy && hover.m !== mi
              const can = !!onPick && (!selectableFrom || key >= selectableFrom)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!can}
                  aria-label={`${fmtMonth(key)}: ${fmtNum(r.v, 0)} cell-days${r.anomaly ? `, ${r.anomaly} anomaly` : ''}${r.gap ? ', Aqua gap month' : ''}`}
                  aria-pressed={key === current}
                  onMouseEnter={() => setHover({ y: yy, m: mi })}
                  onFocus={() => setHover({ y: yy, m: mi })}
                  onClick={() => onPick?.(key)}
                  className={`relative h-[14px] min-w-0 transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember sm:h-[16px] ${dim ? 'opacity-30' : 'opacity-100'} ${can ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{
                    backgroundColor: fire(0.08 + 0.92 * Math.sqrt(r.v / max)),
                    boxShadow: key === current ? `0 0 0 2px ${AQUA}` : r.anomaly ? `inset 0 0 0 1.5px ${r.anomaly === 'high' ? AQUA : '#75746d'}` : undefined,
                    backgroundImage: r.gap ? `repeating-linear-gradient(45deg, transparent 0 3px, ${WARN} 3px 4px)` : undefined,
                    zIndex: key === current ? 1 : undefined,
                  }}
                >
                  {key === viirsStart && <span className="absolute inset-y-0 left-0 w-[2px] bg-bone" aria-hidden />}
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 min-h-[2rem] font-mono text-[10px] tabular-nums">
        {h ? (
          <span className="text-[11px] text-bone">
            {MONTHS_LONG[Number(h.month.slice(5)) - 1]} {h.month.slice(0, 4)} · {fmtNum(h.v, h.v < 100 ? 1 : 0)} cell-days
            {h.z !== null && h.z !== undefined && <span className="text-muted"> · z {fmtNum(h.z, 2)}</span>}
            {h.gap && <span style={{ color: WARN }}> · Aqua gap</span>}
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
            {hasZ && <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ boxShadow: `inset 0 0 0 1.5px ${AQUA}` }} />|z| ≥ 2 high</span>}
            {hasZ && <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ boxShadow: 'inset 0 0 0 1.5px #75746d' }} />low</span>}
            <span><span className="mr-1 inline-block h-2.5 w-3.5 align-middle" style={{ backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, ${WARN} 3px 4px)` }} />Aqua gap</span>
            <span><span className="mr-1 inline-block h-2.5 w-[2px] bg-bone align-middle" />VIIRS from {fmtMonth(viirsStart)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
