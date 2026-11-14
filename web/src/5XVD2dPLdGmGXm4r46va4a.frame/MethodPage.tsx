import React from 'react'

import { Methodology } from './components/Methodology'
import { OperatorDiagram } from '../shared/components/OperatorDiagram'
import { UNIT, useData } from '../shared/data/load'
import { fmtMonth } from '../shared/lib/format'
import { usePageMeta } from '../shared/lib/usePageMeta'

/** /method: the five pipeline steps, the observation operator, the splice rule, and the pipeline's own words. */
export default function MethodPage() {
  usePageMeta(
    'Method · FireForest',
    'How VIIRS detections are converted to MODIS-equivalent fire-active 10 km cell-days: observation operator, calibration, uncertainty and held-out test.'
  )
  return (
    <>
      <Methodology />
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
          <h2 className="max-w-[24ch] text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            How a VIIRS fire becomes a MODIS-equivalent detection
          </h2>
          <div className="mt-10">
            <OperatorDiagram />
          </div>
        </div>
      </section>
      <Splice />
      <Docstring />
    </>
  )
}

/** The splice rule, with its dates read from national.json; bar widths are proportional to months. */
function Splice() {
  const nat = useData('national.json')
  if (nat.status !== 'ready') return null
  const { first_month, last_month, viirs_start } = nat.data.meta
  const vi = nat.data.months.indexOf(viirs_start)
  const before = nat.data.months[vi - 1]
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[11px] text-muted">Final series</p>
        <p className="mt-4 max-w-[30ch] text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-tight tracking-[-0.02em]">
          Aqua observed + VIIRS → MODIS-equivalent
        </p>
        <div className="mt-10 flex font-mono text-[11px]">
          <div className="min-w-0 border border-line bg-bone/85 px-3 py-3 text-ink" style={{ flexGrow: vi, flexBasis: 0 }}>
            <div className="font-semibold">Aqua MODIS, observed</div>
            <div>
              {fmtMonth(first_month)} – {fmtMonth(before)}
            </div>
          </div>
          <div
            className="min-w-0 border border-l-0 border-line px-3 py-3"
            style={{ flexGrow: nat.data.months.length - vi, flexBasis: 0, background: 'rgba(59,201,219,0.16)', color: '#3BC9DB' }}
          >
            <div className="font-semibold">VIIRS → MODIS-equivalent, with 95% band</div>
            <div>
              {fmtMonth(viirs_start)} – {fmtMonth(last_month)}
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-[80ch] font-mono text-[11px] leading-relaxed text-muted">
          Unit · {UNIT} · one cell-day = a 10 × 10 km cell with at least one afternoon detection on a local date
        </p>
      </div>
    </section>
  )
}

/** The "Idea" block of the pipeline's module docstring, verbatim, with source line numbers. */
function Docstring() {
  const method = useData('method.json')
  if (method.status !== 'ready') return null
  const m = method.data
  const all = m.docstring_lines
  const a = all.findIndex((l) => l.text.trim() === 'Idea')
  const b = all.findIndex((l) => l.text.trim() === 'Run')
  let lines = a >= 0 && b > a ? all.slice(a, b) : all
  while (lines.length && lines[lines.length - 1].text.trim() === '') lines = lines.slice(0, -1)
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-[1.02] tracking-[-0.03em]">In the pipeline's own words</h2>
            <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-bone-dim">
              Quoted verbatim from the docstring of <code className="font-mono text-bone">{m.path}</code>, with its line numbers.
            </p>
            <p className="mt-4 break-all font-mono text-[10px] text-muted">
              sha256 {m.sha256.slice(0, 16)}… · {m.lines} lines
            </p>
          </div>
          <blockquote className="overflow-x-auto border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.75] lg:col-span-8" cite={m.path}>
            {lines.map((l) => (
              <div key={l.line} className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
                <span className="select-none pr-3 text-right tabular-nums text-muted">{l.line}</span>
                <span className="whitespace-pre-wrap text-bone-dim">{l.text || ' '}</span>
              </div>
            ))}
          </blockquote>
        </div>
      </div>
    </section>
  )
}
