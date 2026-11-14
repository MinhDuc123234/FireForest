import React from 'react'

import { DataValue } from '../../shared/components/DataStatus'
import { FireGrid } from '../../shared/components/FireGrid'
import { KpiStrip } from '../../shared/components/KpiStrip'
import { fmtRatio } from '../../shared/lib/format'

type Props = { title: string; subtitle: string }

/** Normal flow on a 12-column grid (no absolute positioning): the title never overlaps anything. */
export function Hero({ title, subtitle }: Props) {
  return (
    <section id="top" className="mx-auto max-w-[1280px] px-5 pt-12 md:px-10 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col lg:col-span-4 lg:pt-2">
          <h1 className="text-[clamp(3.5rem,16vw,7.5rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-bone lg:text-[clamp(3.5rem,6.4vw,6rem)]">
            {title}
          </h1>
          <p className="mt-8 max-w-[22ch] text-[clamp(1.375rem,2.2vw,1.75rem)] font-medium leading-tight tracking-[-0.015em] text-bone">
            {subtitle}
          </p>
          <p className="mt-5 max-w-[44ch] text-base leading-relaxed text-bone-dim">
            Aqua MODIS has recorded Vietnam's fires since <DataValue file="national.json" pick={(d) => d.meta.first_month.slice(0, 4)} />.
            From <DataValue file="national.json" pick={(d) => d.meta.viirs_start.slice(0, 4)} />, VIIRS sees many more small fires:
            spliced naively, the record jumps <DataValue file="kpi.json" pick={(d) => fmtRatio(d.headline.step.naive)} /> overnight. We
            ask, for every VIIRS fire: would MODIS have seen it?
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#story"
              className="inline-flex items-center gap-2 whitespace-nowrap bg-ember px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
            >
              See the 2012 jump
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 rotate-90"><path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a href="#method" className="whitespace-nowrap px-2 py-3 text-sm text-bone-dim underline-offset-4 hover:text-bone hover:underline">
              How it works
            </a>
          </div>
        </div>

        <FireGrid className="h-[460px] sm:h-[540px] lg:col-span-8 lg:h-[620px]" />
      </div>

      <div className="mt-12">
        <KpiStrip />
      </div>
    </section>
  )
}
