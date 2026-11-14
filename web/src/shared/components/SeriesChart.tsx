import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'

import { AQUA, GRID, MUTED, NAIVE, TRUST, WARN } from '../lib/colors'
import { fmtInt, fmtMonth, fmtRatio } from '../lib/format'
import type { National, Region } from '../data/load'

export type Layers = {
  /** Aqua observed before VIIRS */
  aquaPre: number
  /** Aqua observed after VIIRS start (reference overlay) */
  aquaPost: number
  /** naive splice after VIIRS start: opacity and reveal (0..1, left to right) */
  naive: number
  naiveReveal: number
  /** harmonized + 95% band after VIIRS start */
  harm: number
  harmReveal: number
  /** gap / drift / VIIRS-era markers */
  markers: number
  /** "sensor change" annotation at the jump */
  jumpNote: number
}

type Props = {
  data: National
  region: Region
  layers: Layers
  /** y maximum to animate towards; omit = fit visible layers */
  yMax?: number
  calibEnd: number
  stepRatio?: number
  height: number
  crosshair?: boolean
  ariaLabel: string
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Tween a number towards a target over 600 ms (instant under reduced motion). */
function useTween(target: number) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setV(target)
      from.current = target
      return
    }
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 600)
      const x = start + (target - start) * EASE(k)
      from.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

export function SeriesChart({ data, region, layers, yMax, calibEnd, stepRatio, height, crosshair, ariaLabel }: Props) {
  const uid = useId().replace(/:/g, '')
  const [wrap, width] = useWidth()
  const s = data.regions[region]
  const months = data.months
  const n = months.length
  const vi = months.indexOf(data.meta.viirs_start)
  const driftStart = months.indexOf(`${calibEnd + 1}-01`)
  const gaps = useMemo(() => s.aqua_gap.map((g, i) => (g ? i : -1)).filter((i) => i >= 0), [s])

  const fit = useMemo(() => {
    let m = 0
    for (let i = 0; i < n; i++) {
      if (layers.aquaPre && i < vi) m = Math.max(m, s.aqua_observed[i] ?? 0)
      if (layers.aquaPost && i >= vi) m = Math.max(m, s.aqua_observed[i] ?? 0)
      if (layers.naive >= 1 && i >= vi) m = Math.max(m, s.naive_splice[i] ?? 0)
      if (layers.harm && i >= vi) m = Math.max(m, s.hi[i] ?? 0)
    }
    return m || 1
  }, [s, layers.aquaPre, layers.aquaPost, layers.naive, layers.harm, n, vi])
  const yTop = useTween(yMax ?? fit)

  const narrow = width < 560
  const m = { l: narrow ? 46 : 52, r: narrow ? 12 : 104, t: 28, b: 30 }
  const x = scaleLinear().domain([0, n - 1]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, yTop]).range([height - m.b, m.t]).nice(4)
  const yTicks = y.ticks(4)
  const yearStep = width < 520 ? 6 : width < 900 ? 4 : 2
  const yearTicks = months.map((mm, i) => ({ mm, i })).filter(({ mm }) => mm.endsWith('-01') && Number(mm.slice(0, 4)) % yearStep === 0)

  const mk = (key: keyof typeof s, from = 0, to = n - 1) =>
    line<number>()
      .defined((i) => i >= from && i <= to && (s[key] as (number | null)[])[i] !== null)
      .x((i) => x(i))
      .y((i) => y((s[key] as (number | null)[])[i] as number))(Array.from({ length: n }, (_, i) => i)) ?? ''
  const idx = Array.from({ length: n }, (_, i) => i)
  const band =
    area<number>()
      .defined((i) => i >= vi && s.lo[i] !== null && s.hi[i] !== null)
      .x((i) => x(i))
      .y0((i) => y(s.lo[i] as number))
      .y1((i) => y(s.hi[i] as number))(idx) ?? ''

  // direct labels at the right end, pushed apart so they never collide
  const last = n - 1
  const ends = [
    layers.naive > 0.5 && { k: 'naive splice', v: s.naive_splice[last], c: NAIVE },
    layers.harm > 0.5 && { k: 'harmonized', v: s.harmonized[last], c: TRUST },
    (layers.aquaPost > 0.5 || (layers.aquaPre > 0.5 && !layers.naive && !layers.harm)) && {
      k: 'Aqua observed',
      v: layers.aquaPost > 0.5 ? s.aqua_observed[last] : s.aqua_observed[vi - 1],
      c: AQUA,
    },
  ].filter(Boolean) as { k: string; v: number | null; c: string }[]
  const placed = ends
    .filter((e) => e.v !== null)
    .map((e) => ({ ...e, py: Math.max(m.t, Math.min(height - m.b, y(e.v as number))) }))
    .sort((a, b) => a.py - b.py)
  for (let i = 1; i < placed.length; i++) if (placed[i].py - placed[i - 1].py < 13) placed[i].py = placed[i - 1].py + 13

  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(x.invert(e.clientX - r.left))
    setHover(i >= 0 && i < n ? i : null)
  }

  const fade = 'transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]'
  const reveal = (k: number) => ({
    transform: `scaleX(${k})`,
    transformOrigin: `${x(vi - 1)}px 0`,
    transition: 'transform 900ms cubic-bezier(0.2,0.8,0.2,1)',
  })

  return (
    <div ref={wrap} className="relative w-full">
      <svg
        width={width}
        height={height}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={crosshair ? onMove : undefined}
        onPointerLeave={crosshair ? () => setHover(null) : undefined}
      >
        <defs>
          <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={WARN} strokeOpacity="0.22" strokeWidth="1.5" />
          </pattern>
          <clipPath id={`plot-${uid}`}>
            <rect x={m.l} y={m.t - 4} width={width - m.l - m.r + 2} height={height - m.t - m.b + 4} />
          </clipPath>
          <clipPath id={`naive-${uid}`}>
            <rect x={x(vi - 1)} y={0} width={width - x(vi - 1)} height={height} style={reveal(layers.naiveReveal)} />
          </clipPath>
          <clipPath id={`harm-${uid}`}>
            <rect x={x(vi - 1)} y={0} width={width - x(vi - 1)} height={height} style={reveal(layers.harmReveal)} />
          </clipPath>
        </defs>

        {/* grid + axes */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={t === 0 ? 1 : 0.6} />
            <text x={m.l - 8} y={y(t) + 3} textAnchor="end" className="fill-muted font-mono text-[10px] tabular-nums">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        <text x={0} y={m.t - 14} className="fill-muted font-mono text-[10px]">
          cell-days / month
        </text>
        {yearTicks.map(({ mm, i }) => (
          <text key={mm} x={x(i)} y={height - 10} textAnchor="middle" className="fill-muted font-mono text-[10px] tabular-nums">
            {mm.slice(0, 4)}
          </text>
        ))}

        {/* drift band, gap months, VIIRS start */}
        <g className={fade} style={{ opacity: layers.markers }}>
          {driftStart > 0 && (
            <>
              <rect x={x(driftStart)} y={m.t} width={x(n - 1) - x(driftStart)} height={height - m.t - m.b} fill={`url(#hatch-${uid})`} />
              <text x={x(n - 1)} y={m.t - 14} textAnchor="end" className="font-mono text-[10px]" fill={WARN}>
                {narrow ? 'Aqua orbit drift' : `Aqua orbit drift: calibration uses ≤ ${calibEnd}`}
              </text>
            </>
          )}
          {gaps.map((i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={m.t + 34} y2={height - m.b} stroke={WARN} strokeDasharray="2 3" strokeWidth={1} />
              {!narrow && (
                <text x={x(i)} y={m.t + 28} textAnchor="middle" className="font-mono text-[9px]" fill={WARN}>
                  gap
                </text>
              )}
            </g>
          ))}
        </g>
        <line x1={x(vi)} x2={x(vi)} y1={m.t} y2={height - m.b} stroke={MUTED} strokeWidth={1} strokeDasharray="1 3" />
        <text x={x(vi) - 6} y={m.t + 4} textAnchor="end" className="fill-muted font-mono text-[10px]">
          {narrow ? 'VIIRS →' : `VIIRS from ${fmtMonth(data.meta.viirs_start)} →`}
        </text>

        <g clipPath={`url(#plot-${uid})`}>
          {/* Aqua observed before VIIRS */}
          <path d={mk('aqua_observed', 0, vi - 1)} fill="none" stroke={AQUA} strokeWidth={1.4} className={fade} style={{ opacity: layers.aquaPre }} />
          {/* naive splice */}
          <g clipPath={`url(#naive-${uid})`} className={fade} style={{ opacity: layers.naive }}>
            <path d={mk('naive_splice', vi - 1)} fill="none" stroke={NAIVE} strokeWidth={1.3} strokeDasharray="4 3" />
          </g>
          {/* harmonized + band */}
          <g clipPath={`url(#harm-${uid})`} className={fade} style={{ opacity: layers.harm }}>
            <path d={band} fill={TRUST} fillOpacity={0.18} />
            <path d={mk('harmonized', vi - 1)} fill="none" stroke={TRUST} strokeWidth={1.6} />
          </g>
          {/* Aqua observed after VIIRS (reference) */}
          <path d={mk('aqua_observed', vi)} fill="none" stroke={AQUA} strokeWidth={1} strokeOpacity={0.85} className={fade} style={{ opacity: layers.aquaPost }} />
        </g>

        {/* jump annotation */}
        {stepRatio !== undefined && (
          <g className={fade} style={{ opacity: layers.jumpNote }}>
            <line x1={x(vi)} x2={x(vi) + 18} y1={m.t + 20} y2={m.t + 20} stroke={AQUA} strokeWidth={0.8} />
            <text x={x(vi) + 22} y={m.t + 16} className="text-[12px]" fill={AQUA}>
              Sensor change, not fire change
            </text>
            <text x={x(vi) + 22} y={m.t + 30} className="font-mono text-[11px]" fill={NAIVE}>
              naive step {fmtRatio(stepRatio)}
            </text>
          </g>
        )}

        {/* direct end labels */}
        {!narrow &&
          placed.map((p) => (
            <text key={p.k} x={width - m.r + 8} y={p.py + 3} className="font-mono text-[10px]" fill={p.c}>
              {p.k}
            </text>
          ))}

        {/* crosshair */}
        {crosshair && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={height - m.b} stroke={AQUA} strokeOpacity={0.5} strokeWidth={1} />
        )}
      </svg>

      {narrow && placed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
          {placed.map((p) => (
            <span key={p.k} style={{ color: p.c }}>
              {p.k === 'naive splice' ? '- - ' : '— '}
              {p.k}
            </span>
          ))}
        </div>
      )}

      {crosshair && hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 min-w-[170px] border border-line bg-ink/95 px-3 py-2 font-mono text-[11px] tabular-nums"
          style={{ left: Math.min(x(hover) + 12, width - 190) }}
        >
          <div className="text-bone">{fmtMonth(months[hover])}</div>
          <Row c={AQUA} k="Aqua observed" v={s.aqua_observed[hover]} />
          {hover >= vi && <Row c={NAIVE} k="naive splice" v={s.naive_splice[hover]} />}
          <Row c={TRUST} k="harmonized" v={s.harmonized[hover]} />
          {hover >= vi && s.lo[hover] !== null && (
            <div className="text-muted">
              95% {fmtInt(s.lo[hover] as number)}–{fmtInt(s.hi[hover] as number)}
            </div>
          )}
          {s.aqua_gap[hover] && <div style={{ color: WARN }}>Aqua gap month</div>}
        </div>
      )}
    </div>
  )
}

function Row({ c, k, v }: { c: string; k: string; v: number | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: c }}>{k}</span>
      <span className="text-bone">{v === null ? '—' : fmtInt(v)}</span>
    </div>
  )
}
