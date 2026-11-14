import React, { useEffect, useRef, useState } from 'react'

import { SeriesChart, type Layers } from '../../shared/components/SeriesChart'
import { SourceChip } from '../../shared/components/SourceChip'
import { useData, type National } from '../../shared/data/load'
import { NAIVE, TRUST } from '../../shared/lib/colors'
import { fmtInt, fmtMonth, fmtNum, fmtRatio, MONTHS_LONG } from '../../shared/lib/format'

const STEP_LAYERS: Layers[] = [
  { aquaPre: 1, aquaPost: 0, naive: 0, naiveReveal: 0, harm: 0, harmReveal: 0, markers: 0, jumpNote: 0 },
  { aquaPre: 1, aquaPost: 0, naive: 1, naiveReveal: 1, harm: 0, harmReveal: 0, markers: 0, jumpNote: 1 },
  { aquaPre: 1, aquaPost: 1, naive: 0.14, naiveReveal: 1, harm: 1, harmReveal: 1, markers: 1, jumpNote: 0 },
]


function peakBefore(d: National) {
  const s = d.regions.Vietnam.aqua_observed
  const vi = d.months.indexOf(d.meta.viirs_start)
  let best = 0
  for (let i = 1; i < vi; i++) if ((s[i] ?? 0) > (s[best] ?? 0)) best = i
  return { v: s[best] ?? 0, m: d.months[best] }
}

export function Harmonization() {
  const nat = useData('national.json')
  const kpi = useData('kpi.json')
  const trust = useData('trust.json')
  const [step, setStep] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024

  useEffect(() => {
    const els = stepRefs.current.filter(Boolean) as HTMLDivElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step))
      },
      // desktop: the middle of the viewport; mobile: below the sticky chart
      { rootMargin: window.innerWidth >= 1024 ? '-45% 0px -45% 0px' : '-62% 0px -28% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [nat.status, kpi.status, trust.status])

  if (nat.status === 'error' || kpi.status === 'error' || trust.status === 'error') return null
  if (nat.status !== 'ready' || kpi.status !== 'ready' || trust.status !== 'ready') return <section id="story" className="min-h-screen" />

  const d = nat.data
  const k = kpi.data
  const calibEnd = trust.data.calibration_R.calib_end
  const peak = peakBefore(d)
  const vs = d.meta.viirs_start
  const preYears = `${d.meta.first_month.slice(0, 4)}–${Number(vs.slice(0, 4)) - 1}`

  const steps = [
    {
      kicker: preYears,
      title: 'One sensor, one afternoon pass',
      body: (
        <>
          Aqua MODIS is the only afternoon record. Burning peaks every dry season; the highest month,{' '}
          {MONTHS_LONG[Number(peak.m.slice(5)) - 1]} {peak.m.slice(0, 4)}, counts {fmtInt(peak.v)} days with fire, summed over 10 km squares.
        </>
      ),
    },
    {
      kicker: fmtMonth(vs),
      title: 'Splice in VIIRS and fire seems to explode',
      body: (
        <>
          Append raw S-NPP VIIRS from {fmtMonth(vs)} and the national level jumps{' '}
          <span style={{ color: NAIVE }}>{fmtRatio(k.headline.step.naive)}</span>. VIIRS resolves small fires MODIS averages away. This is a
          sensor change, not a fire change.
        </>
      ),
    },
    {
      kicker: 'Harmonized',
      title: 'Ask whether MODIS would have seen each fire',
      body: (
        <>
          Weighted by the chance Aqua would have detected it, and calibrated on {k.windows.calibration[0]}–{k.windows.calibration[1]}, VIIRS
          becomes a MODIS-equivalent series. It tracks the Aqua record that kept running in parallel; the step shrinks to{' '}
          <span style={{ color: TRUST }}>{fmtRatio(k.headline.step.harmonized)}</span>.
          <span className="mt-6 block text-xl font-medium leading-snug text-bone">
            A naive splice says fires rose {fmtNum(Math.abs(k.headline.trend_pct_per_year.naive), 1)}% a year. Harmonized, they fell{' '}
            {fmtNum(Math.abs(k.headline.trend_pct_per_year.harmonized), 1)}% a year.
          </span>
        </>
      ),
    },
  ]

  return (
    <section id="story" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 pb-8 pt-20 md:px-10 md:pt-28">
        <h2 className="max-w-[24ch] text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          The 2012 jump that never happened
        </h2>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] lg:mt-6 lg:grid-cols-12 lg:gap-8">
          {/* sticky chart: right on desktop, on top on mobile */}
          <div className="sticky top-14 z-10 -mx-5 min-w-0 border-b border-line bg-ink px-5 pb-3 pt-2 lg:border-0 lg:order-2 lg:col-span-8 lg:mx-0 lg:self-start lg:px-0 lg:pt-6 lg:top-20">
            <SeriesChart
              data={d}
              region="Vietnam"
              layers={STEP_LAYERS[step]}
              calibEnd={calibEnd}
              stepRatio={k.headline.step.naive}
              height={isDesktop ? 440 : 230}
              yLabel="fire days / month"
              ariaLabel="Monthly days with fire per 10 km square in Vietnam: Aqua observed, naive splice and harmonized series"
            />
            <SourceChip csv="monthly_series.csv" plain className="mt-2" />
          </div>

          <div className="relative min-w-0 lg:order-1 lg:col-span-4">
            {steps.map((s, i) => (
              <div
                key={i}
                ref={(el) => {
                  stepRefs.current[i] = el
                }}
                data-step={i}
                className={`flex items-end pb-[16vh] lg:pb-0 ${
                  i === 0 ? 'min-h-[52vh] lg:min-h-[64vh] lg:items-start lg:pt-16' : i === steps.length - 1 ? 'min-h-[70vh] lg:min-h-[72vh] lg:items-center' : 'min-h-[75vh] lg:min-h-[84vh] lg:items-center'
                }`}
              >
                <div className={`max-w-[42ch] transition-opacity duration-500 ${step === i ? 'opacity-100' : 'opacity-30'}`}>
                  <p className="font-mono text-[11px] text-muted">
                    {String(i + 1).padStart(2, '0')} · {s.kicker}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">{s.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-bone-dim">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </section>
  )
}
