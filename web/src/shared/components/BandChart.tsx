import React, { useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'

import { AQUA, GRID, TRUST, WARN } from '../lib/colors'
import { fmtInt, fmtMonth, fmtNum } from '../lib/format'
import { useWidth } from '../lib/useWidth'

export type BandRow = { month: string; v: number; lo: number; hi: number; gap?: boolean; anomaly?: string | null; z?: number | null }

type Props = {
  rows: BandRow[]
  height: number
  /** index of the current month: draws a playhead */
  playhead?: number | null
  /** click / drag to choose a month */
  onPick?: (index: number) => void
  /** axis-free strip (timeline) */
  compact?: boolean
  yLabel?: string
  ariaLabel: string
  svgRef?: React.RefObject<SVGSVGElement>
}

/** Harmonized series with its 95% band (#3BC9DB), crosshair readout, optional playhead and scrubbing. */
export function BandChart({ rows, height: H, playhead, onPick, compact, yLabel = 'cell-days / month', ariaLabel, svgRef }: Props) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const m = compact ? { l: 0, r: 0, t: 4, b: 14 } : { l: 48, r: 10, t: 22, b: 26 }
  if (!rows.length) return <div ref={ref} style={{ height: H }} />
  const x = scaleLinear().domain([0, Math.max(1, rows.length - 1)]).range([m.l, W - m.r])
  const yTop = Math.max(1, ...rows.map((r) => r.hi))
  const y = compact ? scaleLinear().domain([0, yTop]).range([H - m.b, m.t]) : scaleLinear().domain([0, yTop]).range([H - m.b, m.t]).nice(4)
  const idx = rows.map((_, i) => i)
  const band = area<number>().x(x).y0((i) => y(rows[i].lo)).y1((i) => y(rows[i].hi))(idx) ?? ''
  const ln = line<number>().x(x).y((i) => y(rows[i].v))(idx) ?? ''
  const years = rows.length / 12
  const every = Math.max(1, Math.ceil(years / (W < 520 ? 4 : W < 800 ? 7 : 14)))
  const yearTicks = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.month.endsWith('-01') && Number(r.month.slice(0, 4)) % every === 0)
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(rows.length - 1, Math.round(x.invert(e.clientX - b.left))))
  }
  const h = hover !== null ? rows[hover] : null
  return (
    <div ref={ref} className="relative">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={W}
        height={H}
        className={`block touch-pan-y select-none ${onPick ? 'cursor-ew-resize' : ''}`}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(e) => {
          if (!onPick) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag(true)
          onPick(at(e))
        }}
        onPointerMove={(e) => {
          const i = at(e)
          setHover(i)
          if (drag && onPick) onPick(i)
        }}
        onPointerUp={() => setDrag(false)}
        onPointerLeave={() => {
          setHover(null)
          setDrag(false)
        }}
      >
        {!compact &&
          y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={0.7} />
              <text x={m.l - 8} y={y(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{fmtInt(t)}</text>
            </g>
          ))}
        {!compact && <text x={0} y={10} fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{yLabel}</text>}
        {compact && <line x1={0} x2={W} y1={H - m.b} y2={H - m.b} stroke={GRID} />}
        {rows.map((r, i) => (r.gap ? <line key={r.month} x1={x(i)} x2={x(i)} y1={m.t} y2={H - m.b} stroke={WARN} strokeOpacity={0.7} strokeDasharray="2 3" /> : null))}
        {rows.length > 1 && <path d={band} fill={TRUST} fillOpacity={0.18} />}
        <path d={ln} fill="none" stroke={TRUST} strokeWidth={compact ? 1.2 : 1.6} strokeLinejoin="round" />
        {rows.length === 1 && <circle cx={x(0)} cy={y(rows[0].v)} r={3} fill={TRUST} />}
        {yearTicks.map(({ r, i }) => (
          <text key={r.month} x={x(i)} y={H - (compact ? 2 : 8)} textAnchor={compact && i === 0 ? 'start' : 'middle'} fontFamily="JetBrains Mono, monospace" fontSize={10} fill="#75746d">{r.month.slice(0, 4)}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke={AQUA} strokeOpacity={0.45} />}
        {playhead !== null && playhead !== undefined && rows[playhead] && (
          <g>
            <line x1={x(playhead)} x2={x(playhead)} y1={m.t - 2} y2={H - m.b} stroke={AQUA} strokeWidth={1.4} />
            <circle cx={x(playhead)} cy={y(rows[playhead].v)} r={3} fill="#080807" stroke={AQUA} strokeWidth={1.4} />
          </g>
        )}
      </svg>
      {h && !compact && (
        <div className="pointer-events-none absolute top-6 z-10 border border-line bg-ink/95 px-3 py-2 font-mono text-[11px] tabular-nums" style={{ left: Math.min(x(hover!) + 12, W - 180) }}>
          <div className="text-bone">{fmtMonth(h.month)}</div>
          <div style={{ color: TRUST }}>harmonized {fmtNum(h.v, h.v < 100 ? 1 : 0)}</div>
          <div className="text-muted">95% {fmtNum(h.lo, h.lo < 100 ? 1 : 0)}–{fmtNum(h.hi, h.hi < 100 ? 1 : 0)}</div>
          {h.anomaly && <div className="text-bone-dim">{h.anomaly} anomaly · z {fmtNum(h.z ?? 0, 2)}</div>}
          {h.gap && <div style={{ color: WARN }}>Aqua gap month</div>}
        </div>
      )}
      {h && compact && (
        <div className="pointer-events-none absolute -top-6 z-10 whitespace-nowrap border border-line bg-ink/95 px-2 py-0.5 font-mono text-[10px] tabular-nums text-bone" style={{ left: Math.max(0, Math.min(x(hover!) - 40, W - 150)) }}>
          {fmtMonth(h.month)} · {fmtNum(h.v, h.v < 100 ? 1 : 0)}
        </div>
      )}
    </div>
  )
}
