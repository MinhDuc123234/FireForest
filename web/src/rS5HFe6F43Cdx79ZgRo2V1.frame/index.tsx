import React, { useEffect, useMemo, useState } from 'react'

import { SiteNav } from '../5XVD2dPLdGmGXm4r46va4a.frame/components/SiteNav'
import { BandChart } from '../shared/components/BandChart'
import { MonthYearSelect } from '../shared/components/MonthYearSelect'
import { Segmented } from '../shared/components/Segmented'
import { SeriesChart, type Layers } from '../shared/components/SeriesChart'
import { SourceChip } from '../shared/components/SourceChip'
import { YearMonthHeatmap } from '../shared/components/YearMonthHeatmap'
import { gridFile, loadGridYear, useData } from '../shared/data/load'
import { WARN } from '../shared/lib/colors'
import { fmtInt, fmtMonth, fmtNum } from '../shared/lib/format'
import { usePageMeta } from '../shared/lib/usePageMeta'
import { FireMap, MapLegend, type Focus } from '../shared/map/FireMap'
import { DRAW_MIN } from '../shared/map/mapStyle'
import { Panel } from './components/Panel'
import { entityLabel, entityRegion, provinceRows, regionRows, type Entity } from './entity'

type Mode = 'raw' | 'harmonized' | 'compare'
const MODE_LAYERS: Record<Mode, Layers> = {
  raw: { aquaPre: 1, aquaPost: 1, naive: 1, naiveReveal: 1, harm: 0, harmReveal: 1, markers: 1, jumpNote: 0 },
  harmonized: { aquaPre: 1, aquaPost: 1, naive: 0, naiveReveal: 1, harm: 1, harmReveal: 1, markers: 1, jumpNote: 0 },
  compare: { aquaPre: 1, aquaPost: 1, naive: 1, naiveReveal: 1, harm: 1, harmReveal: 1, markers: 1, jumpNote: 0 },
}
const STEP_MS = 900

function useIsWide() {
  const [w, setW] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  useEffect(() => {
    const on = () => setW(window.innerWidth >= 1024)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/**
 * /explore: full-screen map application. Map · floating panel (place, card, ranking, CSV) ·
 * timeline (month scrubber synchronised with the series) · "Charts" drawer.
 */
export default function Explore() {
  usePageMeta('Explore · FireForest', 'Interactive map of harmonized fire activity in Vietnam per 10 km cell, province and month, from 2012 to today.')
  const grid = useData('grid_cells.json')
  const geo = useData('provinces.geojson')
  const prov = useData('provinces.json')
  const nat = useData('national.json')
  const trust = useData('trust.json')
  const wide = useIsWide()

  const [entity, setEntity] = useState<Entity>({ kind: 'all' })
  const [mi, setMi] = useState(-1) // index into the grid months (provinces.json months)
  const [playing, setPlaying] = useState(false)
  const [charts, setCharts] = useState(false)
  const [panel, setPanel] = useState(false) // phones: panel as a sheet
  const [mode, setMode] = useState<Mode>('compare')

  const months = prov.status === 'ready' ? prov.data.months : []
  // start on the latest March: the peak of the fire season
  useEffect(() => {
    if (mi < 0 && months.length) {
      const marches = months.map((m, i) => (m.endsWith('-03') ? i : -1)).filter((i) => i >= 0)
      setMi(marches[marches.length - 1] ?? months.length - 1)
    }
  }, [mi, months])
  const month = mi >= 0 ? months[mi] : ''
  const year = month ? Number(month.slice(0, 4)) : 0
  const yearF = useData(year ? gridFile(year) : null)

  useEffect(() => {
    if (!playing || !months.length) return
    const id = window.setInterval(() => setMi((i) => (i + 1) % months.length), STEP_MS)
    return () => window.clearInterval(id)
  }, [playing, months.length])
  // warm the next year's file so playback does not stall at the year boundary
  useEffect(() => {
    if (playing && year && month.endsWith('-10') && year < Number(months[months.length - 1].slice(0, 4))) void loadGridYear(year + 1).catch(() => undefined)
  }, [playing, year, month, months])

  // 12 frames of the loaded year, in grid_cells.json order
  const frames = useMemo(() => {
    if (yearF.status !== 'ready' || grid.status !== 'ready') return null
    const index = new Map(grid.data.cells.map((c, i) => [`${c[1]},${c[2]}`, i]))
    const out = Array.from({ length: 12 }, () => new Float32Array(grid.data.cells.length))
    for (const [lat, lon, m, h] of yearF.data.rows) {
      const i = index.get(`${lat},${lon}`)
      if (i !== undefined) out[m][i] = h
    }
    return { year: yearF.data.meta.year, out }
  }, [yearF, grid])
  const values = frames && frames.year === year ? frames.out[Number(month.slice(5)) - 1] : null
  const stats = useMemo(() => {
    let active = 0, total = 0
    if (values) for (const v of values) { total += v; if (v >= DRAW_MIN) active++ }
    return { active, total }
  }, [values])

  const ready = grid.status === 'ready' && geo.status === 'ready' && prov.status === 'ready' && nat.status === 'ready' && trust.status === 'ready' && mi >= 0
  const failed = [grid, geo, prov, nat, trust].some((s) => s.status === 'error')

  const rowsFull = useMemo(() => {
    if (prov.status !== 'ready' || nat.status !== 'ready') return []
    if (entity.kind === 'province') {
      const p = prov.data.provinces.find((x) => x.name === entity.name)
      return p ? provinceRows(p, prov.data, nat.data) : []
    }
    return regionRows(nat.data, entity.kind === 'all' ? 'Vietnam' : entity.name)
  }, [entity, prov, nat])
  const rows = useMemo(() => (months.length ? rowsFull.filter((r) => r.month >= months[0]) : []), [rowsFull, months])

  const focus: Focus = entity.kind === 'all' ? { kind: 'all' } : entity
  const padding = useMemo(() => (wide ? { right: 372, left: 56, top: 56, bottom: 24 } : { left: 8, right: 8, top: 48, bottom: 8 }), [wide])

  if (failed) {
    return (
      <div className="flex h-[100dvh] flex-col bg-ink text-bone">
        <SiteNav app />
        <p className="m-auto max-w-sm px-6 text-center text-sm text-bone-dim">The data files could not be loaded. Reload the page to try again.</p>
      </div>
    )
  }

  const calibEnd = trust.status === 'ready' ? trust.data.calibration_R.calib_end : 0
  const gapMonth = nat.status === 'ready' && month ? nat.data.regions.Vietnam.aqua_gap[nat.data.months.indexOf(month)] : false
  const drift = !!year && year > calibEnd
  const region = entityRegion(entity)
  const vmax = grid.status === 'ready' ? grid.data.meta.max_monthly : 1

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink text-bone">
      <SiteNav app />
      <h1 className="sr-only">Explore fire activity in Vietnam by month, province and 10 km cell</h1>

      <div className="relative min-h-0 flex-1">
        {ready && (
          <FireMap
            grid={grid.data}
            geo={geo.data}
            values={values}
            vmax={vmax}
            variant="explore"
            monthLabel={fmtMonth(month)}
            focus={focus}
            padding={padding}
            onSelectProvince={(name) => setEntity(name ? { kind: 'province', name } : { kind: 'all' })}
            className="ff-explore absolute inset-0"
          />
        )}

        {/* HUD */}
        {ready && (
          <div className="pointer-events-none absolute left-14 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap items-center gap-x-3 gap-y-1.5 lg:max-w-[calc(100%-26rem)]">
            <p className="border border-line bg-ink/85 px-2.5 py-1 font-mono text-[11px] tabular-nums text-bone">
              {fmtMonth(month)} · {fmtInt(stats.active)} squares<span className="hidden sm:inline"> with fire</span> · {fmtInt(stats.total)} fire days
              <span className="hidden text-muted sm:inline"> · point estimate · NASA FIRMS</span>
            </p>
            {drift && (
              <span className="whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px]" style={{ color: WARN, background: 'rgba(255,176,32,0.12)' }}>
                Aqua drift after {calibEnd} · extrapolated
              </span>
            )}
            {gapMonth && (
              <span className="whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px]" style={{ color: WARN, background: 'rgba(255,176,32,0.12)' }}>
                Aqua gap month · VIIRS-filled
              </span>
            )}
          </div>
        )}

        {/* legend */}
        {ready && <MapLegend vmax={vmax} className="pointer-events-none absolute bottom-10 left-3 hidden w-[17.5rem] border border-line bg-ink/85 p-2.5 sm:block" />}

        {/* panel: floating on desktop, sheet on phones */}
        {ready && (wide || panel) && (
          <aside
            aria-label="Place details"
            className={
              wide
                ? 'absolute bottom-3 right-3 top-3 w-[348px] overflow-y-auto border border-line bg-ink/92'
                : 'absolute inset-x-0 bottom-0 top-12 z-20 overflow-y-auto border-t border-line bg-ink'
            }
          >
            {!wide && (
              <button type="button" onClick={() => setPanel(false)} className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-line bg-ink px-4 py-2.5 font-mono text-[11px] text-bone-dim">
                Details <span aria-hidden>close ×</span>
              </button>
            )}
            <Panel
              entity={entity}
              onEntity={(e) => {
                setEntity(e)
                if (!wide) setPanel(false)
              }}
              month={month}
              rows={rows}
              prov={prov.data}
              nat={nat.data}
              trust={trust.data}
              grid={grid.data}
            />
          </aside>
        )}

        {/* charts drawer */}
        {ready && charts && (
          <section
            aria-label="Charts"
            className={`absolute z-20 overflow-y-auto border border-line bg-ink ${wide ? 'bottom-3 left-3 right-[372px] max-h-[calc(100%-1.5rem)]' : 'inset-x-0 bottom-0 top-12 border-x-0'}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-ink px-4 py-2.5">
              <h2 className="truncate text-sm font-medium">{entityLabel(entity)} · charts</h2>
              <button type="button" onClick={() => setCharts(false)} className="shrink-0 font-mono text-[11px] text-bone-dim hover:text-bone">
                close ×
              </button>
            </div>
            <div className="grid gap-8 p-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="min-w-0">
                <h3 className="font-mono text-[11px] text-muted">Year × month · click a cell to show it on the map</h3>
                <div className="mt-3">
                  <YearMonthHeatmap rows={rowsFull} current={month} selectableFrom={months[0]} viirsStart={nat.data.meta.viirs_start} onPick={(m) => setMi(months.indexOf(m))} />
                </div>
                <SourceChip plain csv={entity.kind === 'province' ? 'province_monthly_harmonized.csv' : 'monthly_series.csv'} className="mt-1" />
              </div>
              <div className="min-w-0">
                {region ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-mono text-[11px] text-muted">Monthly series · {fmtMonth(nat.data.meta.first_month)} onwards</h3>
                      <Segmented<Mode>
                        size="sm"
                        label="Series"
                        value={mode}
                        onChange={setMode}
                        options={[
                          { value: 'raw', label: 'Raw' },
                          { value: 'harmonized', label: 'Harmonized' },
                          { value: 'compare', label: 'Compare' },
                        ]}
                      />
                    </div>
                    <div className="mt-3">
                      <SeriesChart data={nat.data} region={region} layers={MODE_LAYERS[mode]} calibEnd={calibEnd} height={300} crosshair yLabel="fire days / month" ariaLabel={`Monthly fire days, ${region}`} />
                    </div>
                    <SourceChip plain csv="monthly_series.csv" className="mt-1" extra={region} />
                  </>
                ) : (
                  <>
                    <h3 className="font-mono text-[11px] text-muted">Monthly series with 95% band · click to move the map</h3>
                    <div className="mt-3">
                      <BandChart rows={rows} height={300} playhead={mi} onPick={setMi} yLabel="fire days / month" ariaLabel={`Harmonized monthly fire days, ${entityLabel(entity)}`} />
                    </div>
                    <p className="mt-2 max-w-[60ch] text-xs leading-relaxed text-muted">
                      Province series start with VIIRS in {fmtMonth(months[0])}. Raw, naive and Aqua-observed series exist for Vietnam and the regions only.
                    </p>
                    <SourceChip plain csv="province_monthly_harmonized.csv" className="mt-1" />
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* timeline */}
      <div className="shrink-0 border-t border-line bg-ink">
        {ready ? (
          <div className="grid items-center gap-x-4 gap-y-2 px-3 py-2.5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-4">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause' : 'Play months'}
                className="grid h-[34px] w-[34px] shrink-0 place-items-center border border-line text-bone transition-colors hover:border-bone-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember"
              >
                {playing ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 1.5v9l7-4.5z" fill="currentColor" /></svg>
                )}
              </button>
              <div className="w-[9.5rem]">
                <MonthYearSelect label="" value={month} min={months[0]} max={months[months.length - 1]} onChange={(m) => { setPlaying(false); setMi(months.indexOf(m)) }} />
              </div>
              <div className="ml-auto flex gap-2 lg:hidden">
                <button type="button" onClick={() => { setPanel((p) => !p); setCharts(false) }} aria-pressed={panel} className="h-[34px] border border-line px-3 font-mono text-[11px] text-bone-dim aria-pressed:border-bone aria-pressed:text-bone">
                  Details
                </button>
                <button type="button" onClick={() => { setCharts((c) => !c); setPanel(false) }} aria-pressed={charts} className="h-[34px] border border-line px-3 font-mono text-[11px] text-bone-dim aria-pressed:border-bone aria-pressed:text-bone">
                  Charts
                </button>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-0.5 flex justify-between font-mono text-[10px] text-muted">
                <span className="truncate">{entityLabel(entity)} · fire days per month · drag to scrub</span>
              </div>
              <BandChart rows={rows} height={56} compact playhead={mi} onPick={(i) => { setPlaying(false); setMi(i) }} ariaLabel={`Timeline: harmonized monthly series, ${entityLabel(entity)}`} />
            </div>
            <button
              type="button"
              onClick={() => setCharts((c) => !c)}
              aria-pressed={charts}
              className="hidden h-[34px] items-center gap-2 border border-line px-3 font-mono text-[11px] text-bone-dim transition-colors hover:border-bone-dim hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember aria-pressed:border-bone aria-pressed:text-bone lg:flex"
            >
              Charts
              <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform ${charts ? 'rotate-180' : ''}`} aria-hidden><path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
            </button>
          </div>
        ) : (
          <div className="h-[86px] animate-pulse bg-bone/[0.02]" />
        )}
      </div>
    </div>
  )
}
