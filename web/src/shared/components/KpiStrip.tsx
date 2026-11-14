import React, { useEffect, useRef, useState } from 'react'

import { NAIVE, TRUST } from '../lib/colors'
import { fmtNum, fmtPctSigned, fmtRatio, fmtSigned } from '../lib/format'
import { useData, type Kpi } from '../data/load'

/** Count from 0 to `to` once the element enters the viewport (skipped under reduced motion). */
function useCountUp(to: number, run: boolean, ms = 900) {
  const [v, setV] = useState(run ? 0 : to)
  useEffect(() => {
    if (!run) {
      setV(to)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setV(to * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, run, ms])
  return v
}

type Item = {
  label: string
  naive: number
  harmonized: number
  fmt: (v: number) => string
  naiveLabel: string
  note: (k: Kpi) => string
}

const ITEMS: Item[] = [
  {
    label: '2012 sensor step',
    naive: 0,
    harmonized: 0,
    fmt: (v) => fmtRatio(v),
    naiveLabel: 'naive splice',
    note: (k) =>
      `Mean annual cell-days ${k.windows.step_after[0]}–${String(k.windows.step_after[1]).slice(2)} ÷ ${k.windows.step_before[0]}–${String(k.windows.step_before[1]).slice(2)}. Aqua alone, observed throughout: ${fmtRatio(k.headline.step.aqua_observed)}.`,
  },
  {
    label: 'Trend, national',
    naive: 0,
    harmonized: 0,
    fmt: (v) => `${fmtSigned(v, 1)}%/yr`,
    naiveLabel: 'naive splice',
    note: (k) =>
      `Theil–Sen on annual totals ${k.trend.harmonized.years.replace('-', '–')}; harmonized p = ${fmtNum(k.trend.harmonized.p_value, 3)}. Aqua alone: ${fmtSigned(k.trend.aqua_observed.theil_sen_pct_per_year ?? 0, 1)}%/yr.`,
  },
  {
    label: 'Held-out bias vs Aqua',
    naive: 0,
    harmonized: 0,
    fmt: (v) => fmtPctSigned(v, 0),
    naiveLabel: 'raw VIIRS',
    note: (k) =>
      `Fit ${k.windows.train[0]}–${k.windows.train[1]}, tested ${k.windows.test[0]}–${k.windows.test[1]}. A constant ratio gives ${fmtPctSigned(k.held_out.constant_ratio.bias_pct, 1)} nationally; see Trust.`,
  },
]

export function KpiStrip() {
  const kpi = useData('kpi.json')
  const ref = useRef<HTMLDListElement>(null)
  const [seen, setSeen] = useState(false)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [kpi.status])

  if (kpi.status === 'error') return null
  const k = kpi.status === 'ready' ? kpi.data : null
  const values: [number, number][] = k
    ? [
        [k.headline.step.naive, k.headline.step.harmonized],
        [k.headline.trend_pct_per_year.naive, k.headline.trend_pct_per_year.harmonized],
        [k.headline.held_out_bias_pct.naive, k.headline.held_out_bias_pct.harmonized],
      ]
    : []

  return (
    <dl ref={ref} className="grid border-y border-line md:grid-cols-3">
      {ITEMS.map((it, i) => (
        <div key={it.label} className={`py-6 md:px-8 ${i ? 'border-t border-line md:border-l md:border-t-0' : 'md:pl-0'}`}>
          <dt className="font-mono text-[11px] text-muted">{it.label}</dt>
          {k ? (
            <KpiValue it={it} naive={values[i][0]} harm={values[i][1]} run={seen && !reduced} start={seen || reduced} />
          ) : (
            <dd className="mt-3 h-[52px] animate-pulse bg-bone/[0.03]" />
          )}
          {k && <dd className="mt-3 max-w-[40ch] text-xs leading-relaxed text-bone-dim">{it.note(k)}</dd>}
        </div>
      ))}
    </dl>
  )
}

function KpiValue({ it, naive, harm, run, start }: { it: Item; naive: number; harm: number; run: boolean; start: boolean }) {
  const n = useCountUp(start ? naive : 0, run)
  const h = useCountUp(start ? harm : 0, run)
  return (
    <dd className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1 tabular-nums">
      <span className="flex flex-col">
        <span className="text-[clamp(1.25rem,2vw,1.5rem)] font-medium leading-none" style={{ color: NAIVE }}>
          {it.fmt(n)}
        </span>
        <span className="mt-1.5 font-mono text-[10px] text-muted">{it.naiveLabel}</span>
      </span>
      <svg viewBox="0 0 24 12" className="mb-6 h-3 w-6 shrink-0 text-muted" aria-label="becomes">
        <path d="M1 6h20m-5-4 5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      <span className="flex flex-col">
        <span className="text-[clamp(2rem,3.4vw,2.75rem)] font-semibold leading-none tracking-tight" style={{ color: TRUST }}>
          {it.fmt(h)}
        </span>
        <span className="mt-1.5 font-mono text-[10px] text-muted">harmonized</span>
      </span>
    </dd>
  )
}
