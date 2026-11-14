import React from 'react'

import { DataPending, FileStatus } from '../../shared/components/DataStatus'

/** Trust & limits. Placeholder until stage 5 (validation table, R heatmap, overpass drift, checks, limits). */
export function TrustLimits() {
  return (
    <section id="trust" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">Trust &amp; limits</h2>
        <DataPending
          title="Validation, calibration, checks"
          note="Held-out validation (3 methods × 5 regions), R table, Aqua overpass drift, check_outputs.py, limits, data & reproducibility. Built in stage 5."
          className="mt-14"
        >
          <FileStatus file="trust.json" summary={(d) => `${d.validation.rows.length} validation rows · R for ${d.calibration_R.regions.length} regions · gap months ${d.aqua_gap.months.join(', ')}`} />
          <FileStatus file="checks.json" summary={(d) => `${d.n_pass}/${d.n_checks} PASS · ${d.summary}`} />
        </DataPending>
      </div>
    </section>
  )
}
