import React, { useEffect, useRef, useState } from 'react'

import { FIGURES, type FigCtx } from './components/MethodFigures'
import { useData, type Kpi, type Method, type National, type Trust } from '../shared/data/load'
import { NAIVE, TRUST } from '../shared/lib/colors'
import { fmtInt, fmtMonth, fmtNum, fmtPctSigned } from '../shared/lib/format'
import { physics } from '../shared/lib/physics'
import { usePageMeta } from '../shared/lib/usePageMeta'
import { useWidth } from '../shared/lib/useWidth'

type Ctx = { method: Method; trust: Trust; nat: National; kpi: Kpi }
type Step = { title: string; fns: string[]; body: (c: Ctx) => React.ReactNode }

const arg = (m: Method, flag: string) => m.arguments.find((a) => a.flag === flag)?.default
const last = <T,>(xs: T[]) => xs[xs.length - 1]

const STEPS: Step[] = [
  {
    title: 'Keep the comparable detections',
    fns: ['prep'],
    body: ({ method }) => {
      const fc = method.filter_counts
      return (
        <>
          Afternoon passes only, vegetation fires only, confident detections only, each assigned to its local date (UTC+
          {String(method.constants.TZ_HOURS?.value)}).
          {fc && (
            <>
              {' '}
              Aqua MODIS keeps {fmtInt(last(fc.modis.steps).n)} of {fmtInt(fc.modis.steps[0].n)} detections; S-NPP VIIRS keeps{' '}
              {fmtInt(last(fc.viirs.steps).n)} of {fmtInt(fc.viirs.steps[0].n)}. Counts are from the raw FIRMS files, before the
              Vietnam boundary is applied.
            </>
          )}
        </>
      )
    },
  },
  {
    title: 'Two pixel sizes',
    fns: ['swath_nodes'],
    body: ({ method }) => {
      const P = physics(method)
      return (
        <>
          A VIIRS pixel is 375 m wide. A MODIS pixel is 1 km at nadir and grows to {fmtNum(P.pixelArea(P.TH), 1)} km² at the
          swath edge ({P.TH}°), so a small fire that VIIRS resolves is averaged into a much larger MODIS pixel.
        </>
      )
    },
  },
  {
    title: 'Would MODIS have seen it?',
    fns: ['viirs_cellday'],
    body: ({ method }) => {
      const P = physics(method)
      return (
        <>
          MODIS detects a fire with a probability that is logistic in its radiative power, around a limit that grows with pixel
          area: {fmtNum(P.limit(1), 1)} MW at nadir, {fmtNum(P.limit(P.pixelArea(P.TH)), 1)} MW at the edge (Sofiev &amp; Kouznetsov,
          2026). Each VIIRS fire counts with that probability, averaged over {P.nNodes} positions across the swath, with no
          Monte-Carlo noise.
        </>
      )
    },
  },
  {
    title: 'Calibrate what the physics misses',
    fns: ['calib'],
    body: ({ method, trust }) => {
      const all = trust.calibration_R.regions.flatMap((r) => trust.calibration_R.R[r])
      const below = all.filter((v) => v < 1).length
      return (
        <>
          A ratio R = Aqua observed ÷ predicted is fitted for each region and calendar month on{' '}
          {method.viirs_start?.value.slice(0, 4)}–{String(arg(method, '--calib-end'))}, shrunk towards the national ratio. {below} of{' '}
          {all.length} ratios are below 1: the operator predicts more detections than Aqua made. R absorbs, on average, what the
          physics leaves out, such as clouds (FIRMS has no cloud mask).
        </>
      )
    },
  },
  {
    title: 'Put a band on it',
    fns: ['boot_bands'],
    body: ({ method }) => {
      const sc = arg(method, '--scenarios') as number[] | undefined
      return (
        <>
          {String(arg(method, '--boot'))} bootstrap draws resample whole years and pick one of {sc?.length} detection-limit
          scenarios (× {sc?.map((s) => fmtNum(s, 1)).join(' / ')}). Their 2.5 and 97.5 percentiles give the 95% band carried by
          every regional and provincial series.
        </>
      )
    },
  },
  {
    title: 'Test on years the fit never saw',
    fns: ['metrics'],
    body: ({ kpi }) => (
      <>
        Fit {kpi.windows.train[0]}–{kpi.windows.train[1]}, then compare with Aqua over {kpi.windows.test[0]}–{kpi.windows.test[1]}.
        Raw VIIRS overshoots by <span style={{ color: NAIVE }}>{fmtPctSigned(kpi.held_out.raw_viirs.bias_pct, 0)}</span>. A constant
        ratio has the smaller national bias ({fmtPctSigned(kpi.held_out.constant_ratio.bias_pct, 1)}); physics + calibration has the
        lower month-to-month error (<span style={{ color: TRUST }}>{fmtNum(kpi.held_out.physics_calibration.wMAPE_pct, 1)}%</span>{' '}
        against {fmtNum(kpi.held_out.constant_ratio.wMAPE_pct, 1)}%).
      </>
    ),
  },
  {
    title: 'One record, one unit',
    fns: [],
    body: ({ nat }) => (
      <>
        Aqua as observed until {fmtMonth(nat.months[nat.months.indexOf(nat.meta.viirs_start) - 1])}, VIIRS converted to
        MODIS-equivalent from {fmtMonth(nat.meta.viirs_start)}. The unit is <em className="not-italic text-bone">fire-active 10 km
        cell-days</em>: a 10 × 10 km cell counts once for each local day with at least one afternoon detection.
      </>
    ),
  },
]

/** /method: one scrollytelling sequence, then the pipeline's own words. */
export default function MethodPage() {
  usePageMeta(
    'Method · FireForest',
    'How VIIRS detections are converted to MODIS-equivalent fire-active 10 km cell-days: filters, observation operator, calibration, uncertainty and a held-out test.'
  )
  const method = useData('method.json')
  const trust = useData('trust.json')
  const nat = useData('national.json')
  const kpi = useData('kpi.json')
  const [step, setStep] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const ready = method.status === 'ready' && trust.status === 'ready' && nat.status === 'ready' && kpi.status === 'ready'

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLDivElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: window.innerWidth >= 1024 ? '-45% 0px -45% 0px' : '-60% 0px -30% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ready])

  if (!ready) return <div className="min-h-screen" />
  const ctx: Ctx = { method: method.data, trust: trust.data, nat: nat.data, kpi: kpi.data }
  const src = method.data.source_url

  return (
    <>
      <header className="mx-auto max-w-[1280px] px-5 pt-16 md:px-10 md:pt-24">
        <p className="font-mono text-[11px] text-muted">Method</p>
        <h1 className="mt-3 max-w-[16ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.04em]">Would MODIS have seen it?</h1>
        <p className="mt-6 max-w-[58ch] text-base leading-relaxed text-bone-dim">
          For every VIIRS fire, the pipeline estimates the chance that Aqua MODIS, passing the same afternoon, would have detected it.
          Seven steps, each a function in <code className="font-mono text-[0.9em] text-bone">{method.data.path.split('/').pop()}</code>.
        </p>
      </header>

      <section className="mx-auto mt-10 max-w-[1280px] px-5 md:px-10 lg:mt-4">
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-12 lg:gap-8">
          <div className="sticky top-14 z-10 -mx-5 min-w-0 border-b border-line bg-ink px-5 py-3 lg:order-2 lg:col-span-7 lg:mx-0 lg:flex lg:h-[calc(100vh-3.5rem)] lg:items-center lg:border-0 lg:px-0 lg:py-0">
            <Figure ctx={ctx} step={step} />
          </div>
          <div className="min-w-0 lg:order-1 lg:col-span-5">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                ref={(el) => {
                  refs.current[i] = el
                }}
                data-step={i}
                className="flex min-h-[70vh] items-end pb-[16vh] lg:min-h-[86vh] lg:items-center lg:pb-0"
              >
                <div className={`max-w-[44ch] transition-opacity duration-500 ${step === i ? 'opacity-100' : 'opacity-30'}`}>
                  <p className="font-mono text-[11px] tabular-nums text-muted">
                    {i + 1} / {STEPS.length}
                  </p>
                  <h2 className="mt-2 text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.02em]">{s.title}</h2>
                  <p className="mt-4 text-base leading-relaxed text-bone-dim">{s.body(ctx)}</p>
                  {s.fns.length > 0 && (
                    <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                      {s.fns.map((name) => {
                        const fn = method.data.functions.find((f) => f.name === name)
                        const label = (
                          <>
                            <span className="text-bone">{name}()</span>
                            {fn && <span className="text-muted"> · line {fn.line}</span>}
                          </>
                        )
                        return src && fn ? (
                          <a key={name} href={`${src}#L${fn.line}`} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-bone" title={fn.signature}>
                            {label}
                          </a>
                        ) : (
                          <span key={name}>{label}</span>
                        )
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Words method={method.data} />
    </>
  )
}

/** The sticky figure: all seven drawings stacked, the current one visible (cross-fade). */
function Figure({ ctx, step }: { ctx: Ctx; step: number }) {
  const [ref, W] = useWidth()
  const wide = W >= 640
  const H = wide ? 460 : 300
  const P = physics(ctx.method)
  const fc: FigCtx = { ...ctx, P, W, H }
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {FIGURES.map((F, i) => (
        <div
          key={i}
          aria-hidden={i !== step}
          className="absolute inset-0 transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ opacity: i === step ? 1 : 0 }}
        >
          <F {...fc} />
        </div>
      ))}
    </div>
  )
}

/** Phrases worth reading twice, highlighted where they occur in the docstring. */
const KEY_PHRASES = ['would MODIS (Aqua, same afternoon overpass) have detected it?', 'fire-active 10 km cell-days', 'no Monte-Carlo noise', 'constant-ratio baseline']

function highlight(text: string) {
  const parts: React.ReactNode[] = []
  let rest = text
  let k = 0
  while (rest) {
    const hits = KEY_PHRASES.map((p) => ({ p, i: rest.indexOf(p) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i)
    if (!hits.length) {
      parts.push(rest)
      break
    }
    const h = hits[0]
    parts.push(rest.slice(0, h.i), <mark key={k++} className="bg-transparent text-bone underline decoration-[#3BC9DB] decoration-2 underline-offset-[5px]">{h.p}</mark>)
    rest = rest.slice(h.i + h.p.length)
  }
  return parts
}

/** The "Idea" block of the pipeline's docstring, quoted verbatim like an editorial pull-quote. */
function Words({ method }: { method: Method }) {
  const all = method.docstring_lines
  const a = all.findIndex((l) => l.text.trim() === 'Idea')
  const b = all.findIndex((l) => l.text.trim() === 'Run')
  let lines = a >= 0 && b > a ? all.slice(a + 2, b) : all
  while (lines.length && lines[lines.length - 1].text.trim() === '') lines = lines.slice(0, -1)
  const first = lines[0]?.line, end = lines[lines.length - 1]?.line
  const url = method.source_url ? `${method.source_url}#L${first}-L${end}` : null
  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-24 md:px-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <h2 className="text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.02em]">In the pipeline's own words</h2>
          <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-bone-dim">
            Quoted verbatim from the docstring of <code className="font-mono text-bone">{method.path}</code>.
          </p>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-block font-mono text-[11px] text-bone underline decoration-line underline-offset-4 hover:decoration-bone">
              Lines {first}–{end} on GitHub →
            </a>
          )}
        </div>
        <figure className="lg:col-span-8">
          <blockquote cite={url ?? undefined} className="border-l-2 border-[#3BC9DB] pl-4 font-mono text-[12px] leading-[1.9] text-bone-dim md:pl-6 xl:text-[12.5px]">
            {lines.map((l) => (
              <div key={l.line} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                <span className="select-none text-right tabular-nums text-[#4a4a44]">{l.line}</span>
                <span className="whitespace-pre-wrap break-words">{l.text ? highlight(l.text) : ' '}</span>
              </div>
            ))}
          </blockquote>
          <figcaption className="mt-4 pl-6 font-mono text-[10px] text-muted">
            {method.path} · sha256 {method.sha256.slice(0, 12)}…
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
