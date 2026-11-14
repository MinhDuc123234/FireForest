import React from 'react'
import { area, line } from 'd3-shape'
import { scaleLinear } from 'd3-scale'

import { AQUA, GRID, INFERNO, MUTED, NAIVE, TRUST } from '../lib/colors'
import { MONTHS, fmtNum, fmtPctSigned } from '../lib/format'
import type { Kpi, Method, National, Trust } from '../data/load'
import { physics } from './OperatorDiagram'

const W = 280
const H = 72
const svgProps = { viewBox: `0 0 ${W} ${H}`, className: 'block h-[72px] w-full', role: 'img' as const }

/** 01 Filter: a schematic funnel (fixed positions, not data): only afternoon, vegetation, confident detections pass. */
export function FilterGlyph() {
  // fixed lattice of incoming detections; every 3rd is night (hollow), every 5th low confidence (grey)
  const dots = Array.from({ length: 24 }, (_, i) => ({ x: 14 + (i % 8) * 14, y: 14 + Math.floor(i / 8) * 16, night: i % 3 === 1, low: i % 5 === 2 }))
  const kept = dots.filter((d) => !d.night && !d.low)
  return (
    <svg {...svgProps} aria-label="Schematic: of all detections, only afternoon, vegetation-fire, confident ones are kept">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={3} fill={d.night ? 'none' : d.low ? MUTED : INFERNO[3]} stroke={d.night ? MUTED : 'none'} />
      ))}
      <path d="M128 8 L168 28 L168 44 L128 64" fill="none" stroke={AQUA} strokeOpacity={0.5} />
      <path d="M176 36 h22" stroke={AQUA} strokeOpacity={0.5} markerEnd="" />
      <path d="M194 32 l4 4 -4 4" fill="none" stroke={AQUA} strokeOpacity={0.5} />
      {kept.map((_, i) => (
        <circle key={i} cx={206 + (i % 5) * 13} cy={16 + Math.floor(i / 5) * 15} r={3} fill={INFERNO[3]} />
      ))}
      <text x={206} y={68} className="font-mono text-[9px]" fill={MUTED}>kept</text>
      <text x={14} y={68} className="font-mono text-[9px]" fill={MUTED}>schematic</text>
    </svg>
  )
}

/** 02 Operator: a MODIS pixel over VIIRS pixels + the nadir logistic curve (constants from method.json). */
export function OperatorGlyph({ method }: { method: Method }) {
  const P = physics(method)
  const x = scaleLinear().domain([0, 60]).range([120, W - 6])
  const y = scaleLinear().domain([0, 1]).range([H - 10, 8])
  const pts = Array.from({ length: 61 }, (_, f) => [x(f), y(P.pDetect(f, 1))] as [number, number])
  const vp = 18.75
  return (
    <svg {...svgProps} aria-label="A MODIS pixel over VIIRS pixels, and the logistic detection probability curve">
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={10 + (i % 4) * vp} y={-1 + Math.floor(i / 4) * vp} width={vp} height={vp} fill={i === 9 ? INFERNO[3] : 'none'} fillOpacity={0.35} stroke={MUTED} strokeWidth={0.6} />
      ))}
      <rect x={16} y={6} width={50} height={50} fill="none" stroke={AQUA} strokeWidth={1.4} />
      <line x1={x(0)} x2={x(60)} y1={y(0)} y2={y(0)} stroke={GRID} />
      <path d={line()(pts) ?? ''} fill="none" stroke={AQUA} strokeWidth={1.4} />
      <line x1={x(P.limit(1))} x2={x(P.limit(1))} y1={y(0)} y2={y(0.5)} stroke={INFERNO[3]} />
      <text x={x(P.limit(1)) + 4} y={y(0.12)} className="font-mono text-[9px]" fill={INFERNO[3]}>D {fmtNum(P.limit(1), 1)} MW</text>
      <text x={W - 6} y={H - 1} textAnchor="end" className="font-mono text-[9px]" fill={MUTED}>FRP</text>
    </svg>
  )
}

/** 03 Calibrate: the real R table, 12 calendar months × 4 regions, against R = 1. */
export function CalibrateGlyph({ trust }: { trust: Trust }) {
  const { regions, R } = trust.calibration_R
  const all = regions.flatMap((r) => R[r])
  const top = Math.max(1, ...all)
  const y = scaleLinear().domain([0, top]).range([H - 12, 6])
  const gw = (W - 10) / 12
  const bw = (gw - 4) / regions.length
  return (
    <svg {...svgProps} aria-label={`Calibration ratio R by calendar month for ${regions.join(', ')}; the dashed line is R = 1`}>
      {regions.map((r, ri) =>
        R[r].map((v, mi) => (
          <rect key={`${r}${mi}`} x={6 + mi * gw + ri * bw} y={y(v)} width={bw - 0.6} height={y(0) - y(v)} fill={TRUST} fillOpacity={0.35 + 0.65 * (ri / (regions.length - 1))} />
        ))
      )}
      <line x1={4} x2={W - 4} y1={y(1)} y2={y(1)} stroke={AQUA} strokeDasharray="3 3" strokeWidth={0.8} />
      <text x={W - 4} y={y(1) - 3} textAnchor="end" className="font-mono text-[9px]" fill={AQUA}>R = 1</text>
      {[0, 3, 6, 9].map((mi) => (
        <text key={mi} x={6 + mi * gw} y={H - 1} className="font-mono text-[9px]" fill={MUTED}>{MONTHS[mi][0]}</text>
      ))}
    </svg>
  )
}

/** 04 Uncertainty: the real 95% band of one year, national. */
export function UncertaintyGlyph({ nat, year }: { nat: National; year: number }) {
  const s = nat.regions.Vietnam
  const idx = nat.months.map((m, i) => (m.startsWith(`${year}-`) ? i : -1)).filter((i) => i >= 0)
  const top = Math.max(...idx.map((i) => s.hi[i] ?? 0))
  const x = scaleLinear().domain([idx[0], idx[idx.length - 1]]).range([6, W - 40])
  const y = scaleLinear().domain([0, top]).range([H - 12, 6])
  const band = area<number>().x(x).y0((i) => y(s.lo[i] ?? 0)).y1((i) => y(s.hi[i] ?? 0))(idx) ?? ''
  const ln = line<number>().x(x).y((i) => y(s.harmonized[i] ?? 0))(idx) ?? ''
  return (
    <svg {...svgProps} aria-label={`Harmonized monthly series with its 95% band, Vietnam ${year}`}>
      <path d={band} fill={TRUST} fillOpacity={0.22} />
      <path d={ln} fill="none" stroke={TRUST} strokeWidth={1.4} />
      <line x1={6} x2={W - 40} y1={y(0)} y2={y(0)} stroke={GRID} />
      <text x={6} y={H - 1} className="font-mono text-[9px]" fill={MUTED}>Jan</text>
      <text x={W - 40} y={H - 1} textAnchor="end" className="font-mono text-[9px]" fill={MUTED}>Dec {year}</text>
      <text x={W - 36} y={y(s.hi[idx[2]] ?? 0) + 4} className="font-mono text-[9px]" fill={TRUST}>95%</text>
    </svg>
  )
}

/** 05 Held-out: train and test windows on a year axis, with the national biases. */
export function HeldOutGlyph({ kpi }: { kpi: Kpi }) {
  const [a, b] = kpi.windows.train
  const [c, d] = kpi.windows.test
  const x = scaleLinear().domain([a, d + 1]).range([6, W - 6])
  return (
    <svg {...svgProps} aria-label={`Fit ${a}–${b}, test ${c}–${d}`}>
      <rect x={x(a)} y={14} width={x(b + 1) - x(a) - 2} height={10} fill={AQUA} fillOpacity={0.5} />
      <rect x={x(c)} y={14} width={x(d + 1) - x(c)} height={10} fill="none" stroke={TRUST} strokeWidth={1.2} />
      <text x={x(a)} y={10} className="font-mono text-[9px]" fill={AQUA}>fit {a}–{b}</text>
      <text x={x(c)} y={10} className="font-mono text-[9px]" fill={TRUST}>test {c}–{d}</text>
      <text x={W - 6} y={44} textAnchor="end" className="font-mono text-[9px]" fill={MUTED}>national bias vs Aqua</text>
      <text x={6} y={44} className="font-mono text-[10px]" fill={NAIVE}>raw VIIRS {fmtPctSigned(kpi.held_out.raw_viirs.bias_pct, 0)}</text>
      <text x={6} y={58} className="font-mono text-[10px]" fill={MUTED}>constant ratio {fmtPctSigned(kpi.held_out.constant_ratio.bias_pct, 1)}</text>
      <text x={6} y={72 - 1} className="font-mono text-[10px]" fill={TRUST}>physics + calibration {fmtPctSigned(kpi.held_out.physics_calibration.bias_pct, 1)}</text>
    </svg>
  )
}
