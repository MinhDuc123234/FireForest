import React from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'

import type { Kpi, Method, National, Province, Provinces, Trust } from '../../shared/data/load'
import { AQUA, FIRE, GRID, MUTED, NAIVE, TRUST } from '../../shared/lib/colors'
import { MONTHS, fmtInt, fmtMonth, fmtNum, fmtPctSigned } from '../../shared/lib/format'
import type { Physics } from '../../shared/lib/physics'

export type FigCtx = { method: Method; trust: Trust; nat: National; kpi: Kpi; prov: Provinces; P: Physics; W: number; H: number }

/** Among the ten provinces with the most fire days: the one whose widest 95% band in `year`, relative to its peak that year, is largest. */
export function bandProvince(prov: Provinces, year: number): Province {
  const idx = prov.months.map((m, i) => (m.startsWith(`${year}-`) ? i : -1)).filter((i) => i >= 0)
  const score = (p: Province) => Math.max(...idx.map((i) => p.hi[i] - p.lo[i])) / (Math.max(...idx.map((i) => p.hi[i])) || 1)
  return [...prov.provinces].filter((p) => p.rank_total <= 10).sort((a, b) => score(b) - score(a))[0]
}

const mono = { fontFamily: 'JetBrains Mono, monospace' }
const T = ({ x, y, children, fill = MUTED, size = 10, anchor = 'start', weight }: { x: number; y: number; children: React.ReactNode; fill?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number }) => (
  <text x={x} y={y} fill={fill} fontSize={size} textAnchor={anchor} fontWeight={weight} style={mono}>
    {children}
  </text>
)

/** 1 · Filter: the real counts through prep()'s filters. Stacked on desktop, side by side on phones. */
export function FigFilter({ method, W, H }: FigCtx) {
  const fc = method.filter_counts
  if (!fc) return null
  const groups = [fc.modis, fc.viirs].filter(Boolean)
  const max = Math.max(...groups.flatMap((g) => g.steps.map((s) => s.n)))
  const narrow = W < 520
  if (narrow) {
    const colW = (W - 16) / 2
    const rowH = Math.min(34, (H - 26) / Math.max(...groups.map((g) => g.steps.length)))
    return (
      <svg width={W} height={H} role="img" aria-label="Detections kept after each filter, MODIS and VIIRS">
        {groups.map((g, gi) => {
          const x0 = gi * (colW + 16)
          const color = gi === 0 ? AQUA : '#a9a8a0'
          const gmax = g.steps[0].n
          return (
            <g key={g.sensor}>
              <T x={x0} y={12} fill={color} size={10} weight={600}>{g.sensor}</T>
              {g.steps.map((s, i) => {
                const yy = 24 + i * rowH
                const last = i === g.steps.length - 1
                return (
                  <g key={s.label}>
                    <T x={x0} y={yy + 9} size={9} fill={last ? AQUA : MUTED}>{s.label.replace('afternoon passes', 'afternoon').replace('vegetation fires', 'vegetation')}</T>
                    <rect x={x0} y={yy + 13} width={Math.max(1, (s.n / gmax) * (colW - 56))} height={7} fill={color} fillOpacity={last ? 0.95 : 0.3} />
                    <T x={x0 + (s.n / gmax) * (colW - 56) + 4} y={yy + 20} size={9} fill={last ? AQUA : '#a9a8a0'}>{fmtInt(s.n)}</T>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    )
  }
  const labelW = 190
  const barW = W - labelW - 76
  const rowH = 22
  const gap = 34
  let y = 8
  return (
    <svg width={W} height={H} role="img" aria-label="Detections kept after each filter, MODIS and VIIRS">
      {groups.map((g, gi) => {
        const top = y
        y += 22 + g.steps.length * rowH + gap
        const color = gi === 0 ? AQUA : '#a9a8a0'
        return (
          <g key={g.sensor}>
            <T x={labelW} y={top + 12} fill={color} size={11} weight={600}>{g.sensor}</T>
            {g.steps.map((s, i) => {
              const yy = top + 22 + i * rowH
              const w = Math.max(1, (s.n / max) * barW)
              const last = i === g.steps.length - 1
              return (
                <g key={s.label}>
                  <T x={labelW - 10} y={yy + 12} anchor="end" size={10} fill={last ? AQUA : MUTED}>{s.label}</T>
                  <rect x={labelW} y={yy + 3} width={w} height={12} fill={color} fillOpacity={last ? 0.95 : 0.28} />
                  <T x={labelW + w + 6} y={yy + 13} size={10} fill={last ? AQUA : '#a9a8a0'}>{fmtInt(s.n)}</T>
                </g>
              )
            })}
          </g>
        )
      })}
      <T x={labelW} y={y - 8} size={10}>raw FIRMS detections, before the Vietnam boundary</T>
    </svg>
  )
}

/** 2 · Pixels: a 1 km MODIS pixel over 375 m VIIRS pixels (true scale), then MODIS pixel area across the scan. */
export function FigPixels({ P, W, H }: FigCtx) {
  const narrow = W < 520
  const angles = [0, 25, 40, 50, P.TH]
  // left: pixel grid
  const gridPx = narrow ? Math.min(W * 0.36, H * 0.36) : Math.min(W * 0.36, H * 0.56)
  const S = gridPx / 1500 // the VIIRS grid shown is 4 × 375 m = 1.5 km
  const vp = 375 * S
  const g0 = { x: narrow ? 8 : 16, y: narrow ? 28 : (H - gridPx) / 2 + 6 }
  const mod = { x: g0.x + 190 * S, y: g0.y + 250 * S } // the 1 km MODIS pixel sits off the VIIRS grid
  const fire = { x: mod.x + 640 * S, y: mod.y + 560 * S }
  const cells: [number, number][] = []
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) cells.push([i, j])
  const hot = (i: number, j: number) => {
    const x0 = g0.x + i * vp, y0 = g0.y + j * vp
    return fire.x >= x0 && fire.x < x0 + vp && fire.y >= y0 && fire.y < y0 + vp
  }
  // right (below on phones): pixel footprint across the scan, true relative size, common baseline
  const bx = narrow ? 8 : g0.x + gridPx + 72
  const avail = W - bx - 12
  const k = Math.min(avail / angles.reduce((s, a) => s + Math.sqrt(P.pixelArea(a)) + 0.9, 0), narrow ? 24 : 34)
  const base = narrow ? H - 34 : g0.y + gridPx
  let cx = bx
  return (
    <svg width={W} height={H} role="img" aria-label={`A 1 km MODIS pixel over 375 m VIIRS pixels; MODIS pixel area grows from 1 to ${fmtNum(P.pixelArea(P.TH), 1)} km² at ${P.TH}° scan angle`}>
      {cells.map(([i, j]) => (
        <rect key={`${i}${j}`} x={g0.x + i * vp} y={g0.y + j * vp} width={vp} height={vp} fill={hot(i, j) ? FIRE[2] : 'none'} fillOpacity={0.4} stroke={MUTED} strokeWidth={0.8} />
      ))}
      <rect x={mod.x} y={mod.y} width={1000 * S} height={1000 * S} fill="none" stroke={AQUA} strokeWidth={1.8} />
      <circle cx={fire.x} cy={fire.y} r={4.5} fill={FIRE[3]} />
      <T x={g0.x} y={g0.y - 12} fill={AQUA} size={narrow ? 10 : 11}>MODIS 1 km · VIIRS 375 m</T>
      <circle cx={g0.x + 4} cy={g0.y + gridPx + 16} r={4} fill={FIRE[3]} />
      <T x={g0.x + 14} y={g0.y + gridPx + 20} fill={FIRE[3]} size={10}>one small fire</T>

      <T x={bx} y={base - Math.sqrt(P.pixelArea(P.TH)) * k - 14} fill={AQUA} size={narrow ? 10 : 11}>MODIS pixel area across the scan</T>
      {angles.map((a, i) => {
        const side = Math.sqrt(P.pixelArea(a)) * k
        const x = cx
        cx += side + 0.9 * k
        return (
          <g key={a}>
            <rect x={x} y={base - side} width={side} height={side} fill="none" stroke={AQUA} strokeWidth={1.3} strokeOpacity={0.45 + 0.55 * (i / (angles.length - 1))} />
            <T x={x} y={base + 15} size={narrow ? 9 : 10}>{a}°</T>
            <T x={x} y={base + 28} size={narrow ? 9 : 10} fill={AQUA}>{fmtNum(P.pixelArea(a), 1)}</T>
          </g>
        )
      })}
      <T x={W - 12} y={base + 28} anchor="end" size={9}>km²</T>
    </svg>
  )
}

/** 3 · Detection probability vs FRP at nadir and at the swath edge; labels sit in clear space. */
export function FigLogistic({ P, W, H }: FigCtx) {
  const m = { l: 44, r: 24, t: 40, b: 44 }
  const fmax = 80
  const x = scaleLinear().domain([0, fmax]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, 1]).range([H - m.b, m.t])
  const edge = P.pixelArea(P.TH)
  const curve = (ap: number) => line()(Array.from({ length: 161 }, (_, i) => (i / 160) * fmax).map((f) => [x(f), y(P.pDetect(f, ap))] as [number, number])) ?? ''
  const dN = P.limit(1), dE = P.limit(edge)
  return (
    <svg width={W} height={H} role="img" aria-label={`Detection probability against fire radiative power: 50% at ${fmtNum(dN, 1)} MW at nadir and ${fmtNum(dE, 1)} MW at the swath edge`}>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} stroke={GRID} />
          <T x={m.l - 8} y={y(p) + 3} anchor="end">{p}</T>
        </g>
      ))}
      {[0, 20, 40, 60, 80].map((f) => (
        <T key={f} x={x(f)} y={H - m.b + 16} anchor="middle">{f}</T>
      ))}
      <T x={W - m.r} y={H - 8} anchor="end">fire radiative power, MW</T>
      <T x={0} y={m.t - 26}>P(MODIS detects)</T>
      <path d={curve(1)} fill="none" stroke={AQUA} strokeWidth={2} />
      <path d={curve(edge)} fill="none" stroke={AQUA} strokeWidth={1.5} strokeDasharray="5 4" />
      {[dN, dE].map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={y(0.5)} y2={y(0)} stroke={FIRE[3]} />
          <circle cx={x(d)} cy={y(0.5)} r={3.5} fill={FIRE[3]} />
        </g>
      ))}
      {/* labels: nadir above its plateau, edge below its curve, limits under the axis line */}
      <T x={x(fmax * 0.45)} y={y(1) - 9} fill={AQUA} size={11}>nadir pixel, 1 km²</T>
      <T x={x(dE) + 14} y={y(0.5) + 22} fill={AQUA} size={11}>edge pixel, {fmtNum(edge, 1)} km²</T>
      <T x={x(dN) + 6} y={y(0.32)} fill={FIRE[3]} size={10}>D = {fmtNum(dN, 1)} MW</T>
      <T x={x(dE) + 6} y={y(0.32)} fill={FIRE[3]} size={10}>D = {fmtNum(dE, 1)} MW</T>
    </svg>
  )
}

/** 4 · The real calibration ratios: 4 regions × 12 months, R = 1 marked, values labelled. */
export function FigR({ trust, W, H }: FigCtx) {
  const { regions, R } = trust.calibration_R
  const narrow = W < 520
  const lw = narrow ? 0 : 96
  const rowGap = narrow ? 30 : 18
  const rowH = (H - 20 - rowGap * (regions.length - 1) - (narrow ? regions.length * 14 : 0)) / regions.length
  const top = Math.max(1.05, ...regions.flatMap((r) => R[r]))
  const cw = (W - lw - 4) / 12
  return (
    <svg width={W} height={H} role="img" aria-label="Calibration ratio R by region and calendar month; the dashed line is R = 1">
      {regions.map((reg, ri) => {
        const y0 = ri * (rowH + rowGap + (narrow ? 14 : 0)) + (narrow ? 14 : 0)
        const y = scaleLinear().domain([0, top]).range([y0 + rowH, y0 + 12])
        const vals = R[reg]
        const lo = Math.min(...vals), hi = Math.max(...vals)
        return (
          <g key={reg}>
            <T x={narrow ? 0 : lw - 10} y={narrow ? y0 - 2 : y0 + rowH * 0.6} anchor={narrow ? 'start' : 'end'} size={11} fill={AQUA}>{reg}</T>
            {vals.map((v, i) => {
              const x = lw + i * cw
              const show = !narrow || v === lo || v === hi
              return (
                <g key={i}>
                  <rect x={x + cw * 0.16} y={y(v)} width={cw * 0.68} height={y(0) - y(v)} fill={v > 1 ? FIRE[3] : TRUST} fillOpacity={0.8} />
                  {show && v > 1 && (
                    <T x={x + cw / 2} y={y(v) - 3} anchor="middle" size={9} fill={FIRE[3]} weight={600}>{fmtNum(v, 2)}</T>
                  )}
                  {show && v <= 1 && !narrow && y(0) - y(v) >= 14 && (
                    <T x={x + cw / 2} y={y(v) + 11} anchor="middle" size={9} fill="#080807" weight={600}>{fmtNum(v, 2).replace(/^0/, '')}</T>
                  )}
                  {show && v <= 1 && narrow && (
                    <T x={x + cw / 2} y={y(1) - 3} anchor="middle" size={9} fill="#a9a8a0">{fmtNum(v, 2).replace(/^0/, '')}</T>
                  )}
                  {ri === regions.length - 1 && <T x={x + cw / 2} y={H - 2} anchor="middle" size={10}>{narrow ? MONTHS[i][0] : MONTHS[i]}</T>}
                </g>
              )
            })}
            <line x1={lw} x2={W - 4} y1={y(1)} y2={y(1)} stroke={AQUA} strokeDasharray="3 3" strokeWidth={0.9} />
            {ri === 0 && <T x={W - 4} y={narrow ? y0 - 2 : y(1) - 4} anchor="end" size={10} fill={AQUA}>{narrow ? '--- R = 1' : 'R = 1'}</T>}
          </g>
        )
      })}
    </svg>
  )
}

/** 5 · A 95% band you can see: the province with the widest band among the ten most-burnt, last test year. */
export function FigBand({ prov, kpi, W, H }: FigCtx) {
  const year = kpi.windows.test[1]
  const p = bandProvince(prov, year)
  const idx = prov.months.map((m, i) => (m.startsWith(`${year}-`) ? i : -1)).filter((i) => i >= 0)
  const m = { l: 48, r: 16, t: 46, b: 30 }
  const x = scaleLinear().domain([idx[0], idx[idx.length - 1]]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, Math.max(...idx.map((i) => p.hi[i])) * 1.12]).range([H - m.b, m.t]).nice(4)
  const band = area<number>().x(x).y0((i) => y(p.lo[i])).y1((i) => y(p.hi[i]))(idx) ?? ''
  const ln = line<number>().x(x).y((i) => y(p.harmonized[i]))(idx) ?? ''
  const widest = idx.reduce((a, b) => (p.hi[b] - p.lo[b] > p.hi[a] - p.lo[a] ? b : a))
  const right = x(widest) > W * 0.6
  const d = (v: number) => (v < 100 ? 1 : 0)
  return (
    <svg width={W} height={H} role="img" aria-label={`${p.name} ${year}: harmonized monthly series with its 95% band; widest band in ${fmtMonth(prov.months[widest])}`}>
      <T x={0} y={14} fill={AQUA} size={11}>{p.name}, {year}</T>
      <T x={0} y={28} size={10}>widest band among the ten most-burnt · cell-days / month</T>
      {y.ticks(4).map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
          <T x={m.l - 8} y={y(t) + 3} anchor="end">{fmtInt(t)}</T>
        </g>
      ))}
      <path d={band} fill={TRUST} fillOpacity={0.25} />
      <path d={ln} fill="none" stroke={TRUST} strokeWidth={2} />
      {idx.map((i) => (
        <T key={i} x={x(i)} y={H - 10} anchor="middle">{MONTHS[Number(prov.months[i].slice(5)) - 1][0]}</T>
      ))}
      <line x1={x(widest)} x2={x(widest)} y1={y(p.hi[widest])} y2={y(p.lo[widest])} stroke={AQUA} strokeWidth={1.4} />
      <line x1={x(widest) - 5} x2={x(widest) + 5} y1={y(p.hi[widest])} y2={y(p.hi[widest])} stroke={AQUA} strokeWidth={1.4} />
      <line x1={x(widest) - 5} x2={x(widest) + 5} y1={y(p.lo[widest])} y2={y(p.lo[widest])} stroke={AQUA} strokeWidth={1.4} />
      <T x={x(widest) + (right ? -10 : 10)} y={y(p.hi[widest]) - 4} anchor={right ? 'end' : 'start'} fill={AQUA} size={11}>
        {fmtMonth(prov.months[widest])}: {fmtNum(p.harmonized[widest], d(p.harmonized[widest]))}
      </T>
      <T x={x(widest) + (right ? -10 : 10)} y={y(p.hi[widest]) + 12} anchor={right ? 'end' : 'start'} fill={TRUST} size={10}>
        95% {fmtNum(p.lo[widest], d(p.lo[widest]))}–{fmtNum(p.hi[widest], d(p.hi[widest]))}
      </T>
    </svg>
  )
}

/** 6 · Train / test windows on a year axis, and the three national biases on the test years. */
export function FigHeldOut({ kpi, W, H }: FigCtx) {
  const [a, b] = kpi.windows.train
  const [c, d] = kpi.windows.test
  const x = scaleLinear().domain([a, d + 1]).range([8, W - 8])
  const rows: [string, number, number, string][] = [
    ['raw VIIRS', kpi.held_out.raw_viirs.bias_pct, kpi.held_out.raw_viirs.wMAPE_pct, NAIVE],
    ['constant ratio', kpi.held_out.constant_ratio.bias_pct, kpi.held_out.constant_ratio.wMAPE_pct, '#a9a8a0'],
    ['physics + calibration', kpi.held_out.physics_calibration.bias_pct, kpi.held_out.physics_calibration.wMAPE_pct, TRUST],
  ]
  const narrow = W < 520
  const y0 = 64
  const rh = narrow ? 58 : 56
  return (
    <svg width={W} height={H} role="img" aria-label={`Fit ${a}–${b}, test ${c}–${d}; national biases on the test years`}>
      <rect x={x(a)} y={20} width={x(b + 1) - x(a) - 3} height={16} fill={AQUA} fillOpacity={0.55} />
      <rect x={x(c)} y={20} width={x(d + 1) - x(c)} height={16} fill="none" stroke={TRUST} strokeWidth={1.5} />
      <T x={x(a)} y={12} fill={AQUA} size={11}>fit {a}–{b}</T>
      <T x={x(c)} y={12} fill={TRUST} size={11}>test {c}–{d}</T>
      {Array.from({ length: d - a + 1 }, (_, i) => a + i).filter((yy) => yy % 2 === 0).map((yy) => (
        <T key={yy} x={x(yy)} y={52} size={9} anchor={yy === a ? 'start' : 'middle'}>{yy}</T>
      ))}
      <T x={8} y={y0 + 26} size={10}>{narrow ? 'national, test years · bias · error (wMAPE)' : 'national, test years'}</T>
      {!narrow && (
        <>
          <T x={W * 0.62} y={y0 + 26} size={10} anchor="end">bias</T>
          <T x={W - 8} y={y0 + 26} size={10} anchor="end">error (wMAPE)</T>
        </>
      )}
      {rows.map(([k, bias, wm, color], i) => {
        const yy = y0 + 64 + i * rh
        return (
          <g key={k}>
            <T x={8} y={yy} size={12} fill={color}>{k}</T>
            {narrow ? (
              <T x={8} y={yy + 22} size={18} fill={color} weight={600}>{fmtPctSigned(bias, Math.abs(bias) < 10 ? 1 : 0)} · {fmtNum(wm, 1)}%</T>
            ) : (
              <>
                <T x={W * 0.62} y={yy + 2} size={22} fill={color} anchor="end" weight={600}>{fmtPctSigned(bias, Math.abs(bias) < 10 ? 1 : 0)}</T>
                <T x={W - 8} y={yy + 2} size={22} fill={color} anchor="end" weight={600}>{fmtNum(wm, 1)}%</T>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 7 · The final record: Aqua observed, then VIIRS → MODIS-equivalent with its band. */
export function FigFinal({ nat, W, H }: FigCtx) {
  const s = nat.regions.Vietnam
  const n = nat.months.length
  const vi = nat.months.indexOf(nat.meta.viirs_start)
  const m = { l: 52, r: 12, t: 54, b: 28 }
  const x = scaleLinear().domain([0, n - 1]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, Math.max(...s.hi.map((v) => v ?? 0))]).range([H - m.b, m.t]).nice(4)
  const idx = Array.from({ length: n }, (_, i) => i)
  const pre = line<number>().defined((i) => i < vi && s.harmonized[i] !== null).x(x).y((i) => y(s.harmonized[i] ?? 0))(idx) ?? ''
  const post = line<number>().defined((i) => i >= vi - 1).x(x).y((i) => y(s.harmonized[i] ?? 0))(idx) ?? ''
  const band = area<number>().defined((i) => i >= vi).x(x).y0((i) => y(s.lo[i] ?? 0)).y1((i) => y(s.hi[i] ?? 0))(idx) ?? ''
  const before = nat.months[vi - 1]
  return (
    <svg width={W} height={H} role="img" aria-label="The final monthly record: Aqua observed, then VIIRS converted to MODIS-equivalent">
      {y.ticks(4).map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
          <T x={m.l - 8} y={y(t) + 3} anchor="end">{fmtInt(t)}</T>
        </g>
      ))}
      <rect x={m.l} y={14} width={x(vi) - m.l - 2} height={20} fill={AQUA} fillOpacity={0.85} />
      <rect x={x(vi)} y={14} width={x(n - 1) - x(vi)} height={20} fill={TRUST} fillOpacity={0.2} stroke={TRUST} strokeWidth={1} />
      <T x={m.l + 6} y={28} fill="#080807" size={10} weight={600}>Aqua observed · {fmtMonth(nat.meta.first_month)}–{fmtMonth(before)}</T>
      <T x={x(vi) + 6} y={28} fill={TRUST} size={10} weight={600}>VIIRS → MODIS-equivalent · {fmtMonth(nat.meta.viirs_start)}–{fmtMonth(nat.meta.last_month)}</T>
      <path d={band} fill={TRUST} fillOpacity={0.2} />
      <path d={pre} fill="none" stroke={AQUA} strokeWidth={1.3} />
      <path d={post} fill="none" stroke={TRUST} strokeWidth={1.3} />
      {nat.months.map((mm, i) => (mm.endsWith('-01') && Number(mm.slice(0, 4)) % 4 === 0 ? <T key={mm} x={x(i)} y={H - 8} anchor="middle">{mm.slice(0, 4)}</T> : null))}
    </svg>
  )
}

export const FIGURES = [FigFilter, FigPixels, FigLogistic, FigR, FigBand, FigHeldOut, FigFinal]
