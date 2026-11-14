import React from 'react'

import { DataPending, DataValue, FileStatus } from '../shared/components/DataStatus'

type Props = { onBack?: () => void }

/**
 * Explorer shell. The three-column layout (filters · map · province card) and the
 * heatmap / chart rows are kept; each slot lists the real data files it is rebuilt from
 * in stage 3.
 */
export default function Dashboard({ onBack }: Props) {
  return (
    <div className="flex h-screen flex-col bg-ink text-bone">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1.5 text-sm text-bone-dim transition-colors duration-150 hover:bg-ink-3 hover:text-bone"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Overview</span>
        </button>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Vietnam · harmonized fire record</h1>
          <p className="hidden truncate font-mono text-[11px] text-muted sm:block">
            <DataValue file="national.json" pick={(d) => `${d.meta.first_month} – ${d.meta.last_month} · ${d.meta.unit}`} />
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1600px] gap-px bg-line lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside className="bg-ink p-5 lg:row-span-3">
            <DataPending title="Filters" note="Level (Vietnam / region / province), year range, CSV download.">
              <FileStatus file="provinces.json" summary={(d) => `${d.meta.n_provinces} provinces · ${d.meta.first_month} to ${d.meta.last_month}`} />
            </DataPending>
          </aside>

          <section className="min-w-0 bg-ink p-4 md:p-5" aria-label="Map">
            <DataPending title="Province map + 10 km grid" note="d3-geo province outlines with the monthly 10 km grid, month scrubber." className="min-h-[320px]">
              <FileStatus file="provinces.geojson" summary={(d) => `${d.features.length} features (${d.features.filter((f) => f.properties.has_data).length} with fire data)`} />
              <FileStatus file="grid/2026.json" summary={(d) => `${d.rows.length.toLocaleString('en-US')} cell-months in ${d.meta.year}`} />
            </DataPending>
          </section>

          <section className="min-w-0 bg-ink p-5" aria-label="Province card">
            <DataPending title="Province card" note="Total cell-days, peak month, trend, 95% band width, rank among provinces.">
              <FileStatus file="provinces.json" summary={(d) => `top: ${[...d.provinces].sort((a, b) => a.rank_total - b.rank_total)[0].name}`} />
            </DataPending>
          </section>

          <section className="min-w-0 bg-ink p-5 lg:col-span-2" aria-label="Month heatmap">
            <DataPending title="Year × month heatmap" note="2003–2026, |z| ≥ 2 outlined, Aqua gap months hatched.">
              <FileStatus file="national.json" summary={(d) => `${d.months.length} months · ${d.regions.Vietnam.aqua_gap.filter(Boolean).length} Aqua gap months`} />
            </DataPending>
          </section>

          <section className="min-w-0 bg-ink p-5 lg:col-span-2" aria-label="Monthly series">
            <DataPending title="Monthly series with 95% band" note="Harmonized vs naive splice, crosshair tooltip.">
              <FileStatus file="trust.json" summary={(d) => `calibration ≤ ${d.calibration_R.calib_end} · held-out from ${d.validation.train_end + 1}`} />
            </DataPending>
          </section>
        </div>
      </div>
    </div>
  )
}

function ArrowLeftIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m12 19-7-7 7-7M5 12h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
