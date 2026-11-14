import React from 'react'
import { Link } from 'react-router-dom'

import { useData, type Trust, type ValidationMethod } from '../../shared/data/load'
import { NAIVE, TRUST } from '../../shared/lib/colors'
import { fmtPctSigned } from '../../shared/lib/format'

const OURS: ValidationMethod = 'physics + calibration'

/** In how many macro regions our method has the lowest held-out wMAPE (counted from trust.json). */
function wmapeWins(t: Trust) {
  const rows = t.validation.rows
  const regions = [...new Set(rows.map((r) => r.region))].filter((r) => r !== 'Vietnam')
  const wins = regions.filter((reg) => {
    const rr = rows.filter((r) => r.region === reg)
    return rr.reduce((a, b) => (b.wMAPE_pct < a.wMAPE_pct ? b : a)).method === OURS
  }).length
  return { wins, of: regions.length }
}

/** Home block "Why you can trust it": three numbers, each read from the data files, and the two ways in. */
export function TrustTeaser() {
  const kpi = useData('kpi.json')
  const trust = useData('trust.json')
  const checks = useData('checks.json')
  if (kpi.status === 'error' || trust.status === 'error' || checks.status === 'error') return null
  if (kpi.status !== 'ready' || trust.status !== 'ready' || checks.status !== 'ready') return <section className="min-h-[420px]" />
  const k = kpi.data
  const w = wmapeWins(trust.data)
  const big = 'text-[clamp(2.5rem,5.2vw,4.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums'
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="max-w-[14ch] text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">Why you can trust it</h2>
        <dl className="mt-14 grid border-y border-line md:grid-cols-3">
          <div className="py-8 md:pr-8">
            <dd className={big}>
              <span className="text-[0.5em] font-medium" style={{ color: NAIVE }}>
                {fmtPctSigned(k.held_out.raw_viirs.bias_pct, 0)} →{' '}
              </span>
              <span style={{ color: TRUST }}>{fmtPctSigned(k.held_out.physics_calibration.bias_pct, 0)}</span>
            </dd>
            <dt className="mt-4 max-w-[34ch] text-sm leading-relaxed text-bone-dim">
              Error against the reference sensor on years the method never saw ({k.windows.test[0]}–{k.windows.test[1]}): raw VIIRS
              counts, then harmonized.
            </dt>
          </div>
          <div className="border-t border-line py-8 md:border-l md:border-t-0 md:px-8">
            <dd className={big} style={{ color: TRUST }}>
              {w.wins}/{w.of}
            </dd>
            <dt className="mt-4 max-w-[34ch] text-sm leading-relaxed text-bone-dim">
              Regions where it has the lowest month-to-month error of the three methods tested.
            </dt>
          </div>
          <div className="border-t border-line py-8 md:border-l md:border-t-0 md:pl-8">
            <dd className={big} style={{ color: checks.data.all_passed ? TRUST : undefined }}>
              {checks.data.n_pass}/{checks.data.n_checks}
            </dd>
            <dt className="mt-4 max-w-[34ch] text-sm leading-relaxed text-bone-dim">
              Automatic consistency checks passed by the data behind this page.
            </dt>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link to="/trust" className="text-bone underline decoration-line underline-offset-4 hover:decoration-bone">
            See the evidence →
          </Link>
          <Link to="/method" className="text-bone underline decoration-line underline-offset-4 hover:decoration-bone">
            Read the method →
          </Link>
        </div>
      </div>
    </section>
  )
}
