import React from 'react'

import { DataPending, DataValue, FileStatus } from '../../shared/components/DataStatus'

type Props = { title: string; subtitle: string; onExplore?: () => void }

/**
 * Normal flow on a 12-column grid (no absolute positioning), so the title can never sit on top
 * of the copy or the visual at any width.
 */
export function Hero({ title, subtitle, onExplore }: Props) {
  return (
    <section id="top" className="mx-auto max-w-[1280px] px-5 pt-12 md:px-10 md:pt-20">
      <h1 className="text-[clamp(3.5rem,16vw,10rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-bone">{title}</h1>

      <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col lg:col-span-4">
          <p className="max-w-[22ch] text-[clamp(1.375rem,2.2vw,1.75rem)] font-medium leading-tight tracking-[-0.015em] text-bone">
            {subtitle}
          </p>
          <p className="mt-5 max-w-[44ch] text-base leading-relaxed text-bone-dim">
            MODIS and VIIRS see Vietnam's fires at different resolutions, so their counts cannot be joined
            directly. FireForest expresses both as fire-active 10 km cells per day and asks, for every VIIRS fire,
            whether MODIS would have seen it. The result is one record from{' '}
            <DataValue file="national.json" pick={(d) => d.meta.first_month} /> to{' '}
            <DataValue file="national.json" pick={(d) => d.meta.last_month} />.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExplore}
              className="group inline-flex items-center gap-2 whitespace-nowrap bg-ember px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
            >
              Open Explorer
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"><path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <a href="#method" className="whitespace-nowrap px-2 py-3 text-sm text-bone-dim underline-offset-4 hover:text-bone hover:underline">
              How it works
            </a>
          </div>
        </div>

        <DataPending
          title="Vietnam Fire Grid"
          note="Real 10 km cells as instanced columns, height and colour = March cell-days, one frame per year. Built in stage 4 from these files."
          className="min-h-[300px] lg:col-span-8 lg:h-[480px]"
        >
          <FileStatus
            file="grid_cells.json"
            summary={(d) => `${d.meta.n_cells.toLocaleString('en-US')} cells · ${d.meta.first_month} to ${d.meta.last_month}`}
          />
          <FileStatus
            file="grid_march.json"
            summary={(d) => `March, ${d.years[0]}–${d.years[d.years.length - 1]} · point estimate`}
          />
        </DataPending>
      </div>

      <dl className="mt-12 grid grid-cols-2 border-y border-line md:grid-cols-4">
        {(
          [
            ['Record', <DataValue file="national.json" pick={(d) => `${d.meta.first_month} – ${d.meta.last_month}`} />],
            ['Provinces', <DataValue file="provinces.json" pick={(d) => d.meta.n_provinces} />],
            ['10 km grid cells', <DataValue file="grid_cells.json" pick={(d) => d.meta.n_cells.toLocaleString('en-US')} />],
            ['check_outputs.py', <DataValue file="checks.json" pick={(d) => `${d.n_pass}/${d.n_checks} PASS`} />],
          ] as const
        ).map(([k, v], i) => (
          <div key={k} className={`py-5 md:px-6 ${i % 2 ? 'pl-5' : ''} ${i > 0 ? 'md:border-l md:border-line' : 'md:pl-0'}`}>
            <dt className="font-mono text-[11px] text-muted">{k}</dt>
            <dd className="mt-1 truncate text-sm tabular-nums text-bone">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
