import React from 'react'

import { DataValue } from '../../shared/components/DataStatus'
import { UNIT, useData, type Method } from '../../shared/data/load'

/** CLI default of harmonize_fire_v2.py, read from method.json (parsed from the source). */
function arg(m: Method, flag: string) {
  return m.arguments.find((a) => a.flag === flag)?.default
}
function constant(m: Method, name: string) {
  return m.constants[name]?.value
}

/** FIRMS VIIRS confidence codes (l / n / h). */
const VIIRS_CONF: Record<string, string> = { l: 'low', n: 'nominal', h: 'high' }
const viirsConf = (codes: string) => `${codes.split(',').map((c) => VIIRS_CONF[c.trim()] ?? c).join('/')} (${codes})`

type Step = { title: string; fns: string[]; body: (m: Method) => React.ReactNode }

const STEPS: Step[] = [
  {
    title: 'Filter',
    fns: ['prep'],
    body: (m) => (
      <>
        Afternoon passes only · vegetation fires · VIIRS confidence {viirsConf(String(arg(m, '--viirs-conf')))} · MODIS confidence ≥{' '}
        {String(arg(m, '--modis-min-conf'))} · detections assigned to the local date (UTC+{String(constant(m, 'TZ_HOURS'))}).
      </>
    ),
  },
  {
    title: 'Observation operator',
    fns: ['swath_nodes', 'viirs_cellday'],
    body: () => (
      <>
        The MODIS detection limit grows with pixel area; detection probability is logistic in fire radiative power
        (Sofiev &amp; Kouznetsov, 2026). Integrated over the MODIS swath by deterministic quadrature, with no
        Monte-Carlo noise.
      </>
    ),
  },
  {
    title: 'Calibrate',
    fns: ['calib'],
    body: (m) => (
      <>
        Ratio R = Aqua observed ÷ predicted, per region × calendar month, fitted on {m.viirs_start?.value.slice(0, 4)}–
        {String(arg(m, '--calib-end'))} and shrunk towards the national ratio.
      </>
    ),
  },
  {
    title: 'Uncertainty',
    fns: ['boot_bands'],
    body: (m) => {
      const sc = arg(m, '--scenarios') as number[] | undefined
      return (
        <>
          {String(arg(m, '--boot'))} year-block bootstrap draws, each with one of {sc?.length} operator scenarios (detection
          limit × {sc?.map((s) => s.toFixed(1)).join(' / ')}), give the 95% band.
        </>
      )
    },
  },
  {
    title: 'Held-out test',
    fns: ['metrics'],
    body: (m) => {
      const te = Number(arg(m, '--train-end'))
      return (
        <>
          Fit {m.viirs_start?.value.slice(0, 4)}–{te}, then test from {te + 1} against Aqua observations the fit never saw.
        </>
      )
    },
  },
]

export function Methodology() {
  const method = useData('method.json')
  return (
    <section id="method" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
          <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] lg:col-span-7">
            Would MODIS have seen it?
          </h2>
          <p className="max-w-[52ch] text-bone-dim lg:col-span-5">
            For every VIIRS fire, the pipeline estimates the chance that Aqua MODIS, passing the same afternoon, would
            have detected it. Five steps, each a function in <code className="font-mono text-[0.9em] text-bone">harmonize_fire_v2.py</code>.
          </p>
        </div>

        <ol className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col bg-ink p-6">
              <span className="font-mono text-[11px] text-ember">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 max-w-[48ch] flex-1 text-sm leading-relaxed text-bone-dim">
                {method.status === 'ready' ? s.body(method.data) : <span className="inline-block h-10 w-full animate-pulse bg-bone/5" />}
              </p>
              <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                {s.fns.map((name) => {
                  const fn = method.status === 'ready' ? method.data.functions.find((f) => f.name === name) : undefined
                  return (
                    <code key={name} title={fn?.signature}>
                      <span className="text-bone">{name}()</span>
                      {fn && <span> · line {fn.line}</span>}
                    </code>
                  )
                })}
              </p>
            </li>
          ))}
          <li className="flex flex-col justify-between bg-ink-2 p-6">
            <span className="font-mono text-[11px] text-muted">Final series</span>
            <p className="mt-3 text-sm leading-relaxed text-bone">
              Aqua observed (<DataValue file="national.json" pick={(d) => d.meta.first_month} /> to the month before{' '}
              <DataValue file="national.json" pick={(d) => d.meta.viirs_start} />) + VIIRS → MODIS-equivalent (
              <DataValue file="national.json" pick={(d) => d.meta.viirs_start} /> to{' '}
              <DataValue file="national.json" pick={(d) => d.meta.last_month} />).
            </p>
            <p className="mt-5 font-mono text-[11px] text-muted">Unit · {UNIT}</p>
          </li>
        </ol>
      </div>
    </section>
  )
}
