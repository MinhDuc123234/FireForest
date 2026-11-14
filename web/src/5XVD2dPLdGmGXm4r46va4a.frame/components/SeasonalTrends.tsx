import React from 'react'

import { DataPending, FileStatus } from '../../shared/components/DataStatus'

export function SeasonalTrends() {
  return (
    <section id="seasonal" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
          When Vietnam burns
        </h2>
        <DataPending
          title="Seasonal calendar"
          note="12 monthly columns per region with p10–p90 range, built in stage 4."
          className="mt-14"
        >
          <FileStatus
            file="seasonal.json"
            summary={(d) => `${Object.keys(d.regions).length} regions × ${d.regions.Vietnam.length} calendar months`}
          />
        </DataPending>
      </div>
    </section>
  )
}
