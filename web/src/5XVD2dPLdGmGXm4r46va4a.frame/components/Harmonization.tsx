import React from 'react'

import { DataPending, FileStatus } from '../../shared/components/DataStatus'

export function Harmonization() {
  return (
    <section id="story" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="max-w-3xl text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
          Two sensors, one scale
        </h2>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
          <DataPending
            title="Observation operator diagram"
            note="MODIS 1 km pixel over VIIRS 375 m pixels on one fire; pixel area growing to the swath edge; logistic detection probability in FRP. Drawn in stage 4 from the pipeline constants."
            className="min-h-[260px]"
          >
            <FileStatus
              file="method.json"
              summary={(d) => `${d.path} · ${d.functions.length} functions · ${d.arguments.length} CLI arguments`}
            />
          </DataPending>

          <DataPending
            title="Naive splice vs harmonized, monthly"
            note="Scrollytelling chart of the 2012 step, built in stage 4."
            className="min-h-[260px]"
          >
            <FileStatus
              file="national.json"
              summary={(d) => `${d.months.length} months × ${d.meta.regions.length} regions · VIIRS from ${d.meta.viirs_start}`}
            />
            <FileStatus
              file="kpi.json"
              summary={(d) => `2012 step ×${d.headline.step.naive.toFixed(2)} naive, ×${d.headline.step.harmonized.toFixed(2)} harmonized`}
            />
          </DataPending>
        </div>
      </div>
    </section>
  )
}
