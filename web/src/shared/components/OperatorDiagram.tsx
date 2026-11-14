import React from 'react'

import { AQUA, INFERNO, MUTED } from '../lib/colors'
import { fmtNum } from '../lib/format'
import { useData, type Method } from '../data/load'

const FIRE = INFERNO[3]

/** Physics from harmonize_fire_v2.py, evaluated with the constants parsed into method.json. */
export function physics(m: Method) {
  const c = (k: string) => Number(m.constants[k]?.value)
  const RE = c('R_E'), H = c('H_MODIS'), TH = c('THETA_MAX')
  const D1 = c('D1_DAY'), SL = c('SLOPE_DAY'), W = c('W_FRAC')
  const nNodes = Number(m.functions.find((f) => f.name === 'swath_nodes')?.params.find((p) => p.name === 'n')?.default ?? 14)
  /** swath_nodes(): pixel area (km2) at scan angle th (deg) */
  const pixelArea = (thDeg: number) => {
    const th = (thDeg * Math.PI) / 180
    const Rs = RE + H
    const v = Math.asin((Rs * Math.sin(th)) / RE)
    const r = Rs * Math.cos(th) - RE * Math.cos(v)
    return (r / H) ** 2 / Math.cos(v)
  }
  /** viirs_cellday(): detection limit and logistic detection probability */
  const limit = (ap: number) => D1 + SL * (ap - 1)
  const pDetect = (frp: number, ap: number) => {
    const D = limit(ap)
    return 1 / (1 + Math.exp(-(frp - D) / (W * D)))
  }
  return { RE, H, TH, D1, SL, W, nNodes, pixelArea, limit, pDetect }
}

export function OperatorDiagram() {
  const method = useData('method.json')
  if (method.status !== 'ready') return method.status === 'error' ? null : <div className="h-[300px] animate-pulse bg-bone/[0.02]" />
  const P = physics(method.data)
  const edge = P.pixelArea(P.TH)
  return (
    <figure>
      <div className="grid gap-px border border-line bg-line md:grid-cols-3">
        <Panel n="a" title="One fire, two pixel sizes">
          <PixelPanel />
        </Panel>
        <Panel n="b" title={`MODIS pixels grow to ${fmtNum(edge, 1)} km² at the swath edge`}>
          <SwathPanel P={P} edge={edge} />
        </Panel>
        <Panel n="c" title="Would MODIS detect it?">
          <LogisticPanel P={P} edge={edge} />
        </Panel>
      </div>
      <figcaption className="mt-3 max-w-[80ch] text-xs leading-relaxed text-bone-dim">
        (a) VIIRS resolves fires a MODIS pixel averages away. (b) Pixel area versus scan angle, the geometry in{' '}
        <code className="font-mono text-bone">swath_nodes()</code>; ticks are its {P.nNodes} quadrature nodes. (c) Detection
        probability is logistic in fire radiative power around a limit D = {fmtNum(P.D1, 1)} + {fmtNum(P.SL, 2)}·(A<sub>p</sub> − 1) MW,
        as in <code className="font-mono text-bone">viirs_cellday()</code>; each VIIRS fire is weighted by it. Constants: Sofiev &amp;
        Kouznetsov (2026), read from the pipeline source.
      </figcaption>
    </figure>
  )
}

function Panel({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-ink p-5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-muted">{n}</span>
        <h4 className="text-sm font-medium text-bone">{title}</h4>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  )
}

/** (a) 1 km MODIS pixel over 375 m VIIRS pixels, true scale. */
function PixelPanel() {
  const S = 150 / 1000 // px per metre
  const vp = 375 * S
  const ox = 70, oy = 30
  // VIIRS grid offset so pixels straddle the MODIS pixel as they would on the ground
  const cells: [number, number][] = []
  for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) cells.push([i, j])
  const fire = { x: ox + 520 * S, y: oy + 610 * S }
  const hot = (i: number, j: number) => {
    const x0 = ox - 60 * S + i * vp, y0 = oy - 40 * S + j * vp
    return fire.x >= x0 && fire.x < x0 + vp && fire.y >= y0 && fire.y < y0 + vp
  }
  return (
    <svg viewBox="0 0 290 230" className="w-full" role="img" aria-label="A 1 km MODIS pixel drawn over 375 m VIIRS pixels; only the VIIRS pixel containing the fire is flagged">
      {cells.map(([i, j]) => (
        <rect
          key={`${i}${j}`}
          x={ox - 60 * S + i * vp}
          y={oy - 40 * S + j * vp}
          width={vp}
          height={vp}
          fill={hot(i, j) ? FIRE : 'none'}
          fillOpacity={hot(i, j) ? 0.35 : 0}
          stroke={MUTED}
          strokeWidth={0.8}
        />
      ))}
      <rect x={ox} y={oy} width={1000 * S} height={1000 * S} fill="none" stroke={AQUA} strokeWidth={1.6} />
      <circle cx={fire.x} cy={fire.y} r={4} fill={FIRE} />
      <text x={ox} y={oy + 1000 * S + 34} className="font-mono text-[10px]" fill={AQUA}>MODIS · 1 km (nadir)</text>
      <text x={ox + 1000 * S + 22} y={oy + vp * 0.9} className="font-mono text-[10px]" fill={MUTED}>VIIRS</text>
      <text x={ox + 1000 * S + 22} y={oy + vp * 0.9 + 12} className="font-mono text-[10px]" fill={MUTED}>375 m</text>
      <text x={fire.x + 8} y={fire.y + 4} className="font-mono text-[10px]" fill={FIRE}>small fire</text>
    </svg>
  )
}

/** (b) pixel area vs scan angle; squares drawn at true relative size. */
function SwathPanel({ P, edge }: { P: ReturnType<typeof physics>; edge: number }) {
  const W = 290, H = 210
  const ml = 8, base = 150
  const angles = [0, 25, 40, 50, P.TH]
  const k = 16 // px per km
  const xs = angles.map((_, i) => ml + 10 + i * 54)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`MODIS pixel area grows from 1 km² at nadir to ${fmtNum(edge, 1)} km² at ${P.TH}° scan angle`}>
      {angles.map((a, i) => {
        const side = Math.sqrt(P.pixelArea(a)) * k
        return (
          <g key={a}>
            <rect x={xs[i]} y={base - side} width={side} height={side} fill="none" stroke={AQUA} strokeWidth={1.2} strokeOpacity={0.4 + 0.6 * (i / (angles.length - 1))} />
            <text x={xs[i]} y={base + 16} className="font-mono text-[10px] tabular-nums" fill={MUTED}>{a}°</text>
            <text x={xs[i]} y={base + 30} className="font-mono text-[10px] tabular-nums" fill={AQUA}>{fmtNum(P.pixelArea(a), 1)}</text>
          </g>
        )
      })}
      <text x={ml + 10} y={base + 46} className="font-mono text-[10px]" fill={MUTED}>scan angle · pixel area km²</text>
      {/* quadrature nodes along the scan */}
      {Array.from({ length: P.nNodes }, (_, i) => (
        <line key={i} x1={ml + 10 + ((i + 0.5) / P.nNodes) * (W - 30)} x2={ml + 10 + ((i + 0.5) / P.nNodes) * (W - 30)} y1={18} y2={24} stroke={MUTED} />
      ))}
      <line x1={ml + 10} x2={W - 20} y1={24} y2={24} stroke={MUTED} strokeWidth={0.6} />
      <text x={ml + 10} y={12} className="font-mono text-[10px]" fill={MUTED}>nadir → swath edge</text>
    </svg>
  )
}

/** (c) logistic detection probability at nadir and at the swath edge. */
function LogisticPanel({ P, edge }: { P: ReturnType<typeof physics>; edge: number }) {
  const W = 290, H = 210
  const m = { l: 30, r: 10, t: 14, b: 34 }
  const fmax = 80
  const X = (f: number) => m.l + (f / fmax) * (W - m.l - m.r)
  const Y = (p: number) => H - m.b - p * (H - m.t - m.b)
  const curve = (ap: number) =>
    Array.from({ length: 161 }, (_, i) => (i / 160) * fmax)
      .map((f, i) => `${i ? 'L' : 'M'}${X(f).toFixed(1)},${Y(P.pDetect(f, ap)).toFixed(1)}`)
      .join('')
  const dN = P.limit(1), dE = P.limit(edge)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Detection probability versus fire radiative power: 50% at ${fmtNum(dN, 1)} MW at nadir and ${fmtNum(dE, 1)} MW at the swath edge`}>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={m.l} x2={W - m.r} y1={Y(p)} y2={Y(p)} stroke="#2a2a26" strokeWidth={0.6} />
          <text x={m.l - 6} y={Y(p) + 3} textAnchor="end" className="font-mono text-[10px]" fill={MUTED}>{p}</text>
        </g>
      ))}
      {[0, 20, 40, 60, 80].map((f) => (
        <text key={f} x={X(f)} y={H - m.b + 14} textAnchor="middle" className="font-mono text-[10px] tabular-nums" fill={MUTED}>{f}</text>
      ))}
      <text x={W - m.r} y={H - 4} textAnchor="end" className="font-mono text-[10px]" fill={MUTED}>FRP, MW</text>
      <text x={m.l} y={m.t - 4} className="font-mono text-[10px]" fill={MUTED}>P(detect)</text>
      <path d={curve(1)} fill="none" stroke={AQUA} strokeWidth={1.6} />
      <path d={curve(edge)} fill="none" stroke={AQUA} strokeWidth={1.2} strokeDasharray="4 3" />
      <line x1={X(dN)} x2={X(dN)} y1={Y(0.5)} y2={H - m.b} stroke={FIRE} strokeWidth={0.8} />
      <line x1={X(dE)} x2={X(dE)} y1={Y(0.5)} y2={H - m.b} stroke={FIRE} strokeWidth={0.8} />
      <text x={X(dN) + 4} y={Y(0.5) + 26} className="font-mono text-[10px]" fill={FIRE}>{fmtNum(dN, 1)} MW</text>
      <text x={X(dE) + 4} y={Y(0.5) + 26} className="font-mono text-[10px]" fill={FIRE}>{fmtNum(dE, 1)} MW</text>
      <text x={X(fmax) - 2} y={Y(P.pDetect(fmax, 1)) - 6} textAnchor="end" className="font-mono text-[10px]" fill={AQUA}>nadir, 1 km²</text>
      <text x={X(fmax) - 2} y={Y(P.pDetect(fmax, edge)) + 26} textAnchor="end" className="font-mono text-[10px]" fill={AQUA}>edge, {fmtNum(edge, 1)} km²</text>
    </svg>
  )
}
