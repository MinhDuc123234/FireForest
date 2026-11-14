import React, { useEffect, useMemo, useState } from 'react'

import { Segmented } from '../shared/components/Segmented'
import { SensorChart, SensorGlyph, type ChartMode } from '../shared/components/SensorChart'
import { DETECTIONS, MONTHS, SITE, YEARS, type Detection, type Quality } from '../shared/data/fires'
import { fitRatio, monthlySeries } from '../shared/lib/harmonize'
import { FireMap } from './components/FireMap'
import { MonthHeatmap, type MonthFilter } from './components/MonthHeatmap'
import { DetectionPanel } from './components/DetectionPanel'

export const args = {
  sensor: 'all',
  quality: 'all',
  yearFrom: 2019,
  yearTo: 2024,
  chartMode: 'compare',
}

export const argTypes = {
  sensor: { control: 'radio', options: ['all', 'MODIS', 'VIIRS'] },
  quality: { control: 'radio', options: ['all', 'nominal', 'high'] },
  yearFrom: { control: 'select', options: [2019, 2020, 2021, 2022, 2023, 2024] },
  yearTo: { control: 'select', options: [2019, 2020, 2021, 2022, 2023, 2024] },
  chartMode: { control: 'radio', options: ['raw', 'harmonized', 'compare'] },
}

type SensorFilter = 'all' | 'MODIS' | 'VIIRS'
type QualityFilter = 'all' | 'nominal' | 'high'
type Props = Partial<typeof args> & { onBack?: () => void }

export default function Dashboard(props: Props) {
  const p = { ...args, ...props }
  const [sensor, setSensor] = useState<SensorFilter>(p.sensor as SensorFilter)
  const [quality, setQuality] = useState<QualityFilter>(p.quality as QualityFilter)
  const [yearFrom, setYearFrom] = useState(p.yearFrom)
  const [yearTo, setYearTo] = useState(p.yearTo)
  const [monthFilter, setMonthFilter] = useState<MonthFilter>(null)
  const [mode, setMode] = useState<ChartMode>(p.chartMode as ChartMode)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filters shared by every view: date range and quality.
  const base = useMemo(
    () => DETECTIONS.filter((d) => d.year >= yearFrom && d.year <= yearTo && passesQuality(d.confidence, quality)),
    [yearFrom, yearTo, quality]
  )
  // The heatmap counts by sensor but ignores the month it is used to pick.
  const bySensor = useMemo(() => base.filter((d) => sensor === 'all' || d.sensor === sensor), [base, sensor])
  // The map additionally narrows to the picked month.
  const onMap = useMemo(
    () =>
      bySensor.filter(
        (d) => !monthFilter || (d.month === monthFilter.month && (monthFilter.year === null || d.year === monthFilter.year))
      ),
    [bySensor, monthFilter]
  )
  // Charts always compare both sensors over the same window.
  const series = useMemo(() => monthlySeries(base, yearFrom, yearTo), [base, yearFrom, yearTo])
  const fit = useMemo(() => fitRatio(series), [series])

  const selected = onMap.find((d) => d.id === selectedId) ?? null
  useEffect(() => {
    if (selectedId && !onMap.some((d) => d.id === selectedId)) setSelectedId(null)
  }, [onMap, selectedId])

  const years = YEARS.filter((y) => y >= yearFrom && y <= yearTo)
  const modisN = onMap.filter((d) => d.sensor === 'MODIS').length
  const viirsN = onMap.length - modisN

  return (
    <div className="flex h-screen flex-col bg-ink text-bone">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
        <button
          type="button"
          onClick={p.onBack}
          className="flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1.5 text-sm text-bone-dim transition-colors duration-150 hover:bg-ink-3 hover:text-bone"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Overview</span>
        </button>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{SITE.name}</h1>
          <p className="hidden truncate font-mono text-[11px] text-muted sm:block">
            {SITE.province} · 10.71°N / 105.52°E · {SITE.areaHa.toLocaleString()} ha
          </p>
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap border border-ember/50 px-2 py-1 font-mono text-[11px] text-ember">
          Demo dataset
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1600px] gap-px bg-line lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          {/* Filters */}
          <aside className="bg-ink p-5 lg:row-span-3">
            <h2 className="font-mono text-[11px] text-muted">Filters</h2>

            <div className="mt-5 space-y-6">
              <div>
                <label className="mb-2 block text-xs text-bone-dim">Date range</label>
                <div className="flex items-center gap-2">
                  <YearSelect value={yearFrom} onChange={(v) => { setYearFrom(v); if (v > yearTo) setYearTo(v); setMonthFilter(null) }} label="From year" />
                  <span className="text-muted">–</span>
                  <YearSelect value={yearTo} onChange={(v) => { setYearTo(v); if (v < yearFrom) setYearFrom(v); setMonthFilter(null) }} label="To year" />
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs text-bone-dim">Sensor</span>
                <Segmented<SensorFilter>
                  size="sm"
                  label="Sensor"
                  value={sensor}
                  onChange={setSensor}
                  options={[
                    { value: 'all', label: 'Both' },
                    { value: 'MODIS', label: 'MODIS' },
                    { value: 'VIIRS', label: 'VIIRS' },
                  ]}
                />
              </div>

              <div>
                <span className="mb-2 block text-xs text-bone-dim">Detection quality</span>
                <Segmented<QualityFilter>
                  size="sm"
                  label="Detection quality"
                  value={quality}
                  onChange={setQuality}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'nominal', label: 'Nominal+' },
                    { value: 'high', label: 'High' },
                  ]}
                />
              </div>

              <div>
                <span className="mb-2 block text-xs text-bone-dim">Month</span>
                {monthFilter ? (
                  <button
                    type="button"
                    onClick={() => setMonthFilter(null)}
                    className="flex items-center gap-2 whitespace-nowrap border border-ember px-2.5 py-1 font-mono text-[11px] text-ember transition-colors duration-150 hover:bg-ember hover:text-ink"
                  >
                    {MONTHS[monthFilter.month]} {monthFilter.year ?? 'all years'}
                    <CloseIcon />
                  </button>
                ) : (
                  <p className="text-xs text-muted">Pick a cell in the heatmap.</p>
                )}
              </div>
            </div>

            <dl className="mt-8 border-t border-line pt-5">
              <dt className="font-mono text-[11px] text-muted">On map</dt>
              <dd className="mt-1 text-4xl font-semibold tracking-tight">{onMap.length}</dd>
              <div className="mt-4 space-y-2 font-mono text-[11px] text-bone-dim">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><SensorGlyph sensor="MODIS" /> MODIS</span>
                  <span className="text-bone">{modisN}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><SensorGlyph sensor="VIIRS" /> VIIRS</span>
                  <span className="text-bone">{viirsN}</span>
                </div>
              </div>
            </dl>
          </aside>

          {/* Map */}
          <section className="min-w-0 bg-ink p-4 md:p-5" aria-label="Detection map">
            <FireMap detections={onMap} selectedId={selectedId} onSelect={setSelectedId} />
          </section>

          {/* Detail */}
          <section className="min-w-0 bg-ink p-5" aria-label="Detection details">
            <DetectionPanel detection={selected} candidates={onMap} onSelect={setSelectedId} />
          </section>

          {/* Heatmap */}
          <section className="min-w-0 bg-ink p-5 lg:col-span-2" aria-label="Detections by month">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">Detections by month</h2>
              <span className="font-mono text-[11px] text-muted">Click a cell to filter the map · click a month for all years</span>
            </div>
            <MonthHeatmap detections={bySensor} years={years} value={monthFilter} onChange={setMonthFilter} />
          </section>

          {/* Chart */}
          <section className="min-w-0 bg-ink p-5 lg:col-span-2" aria-label="Sensor comparison">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">MODIS vs VIIRS, monthly</h2>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  Both sensors · same overlap {yearFrom}–{yearTo} · quality: {quality}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {mode !== 'raw' && (
                  <span className="whitespace-nowrap border border-ember/50 px-2 py-1 font-mono text-[11px] text-ember">Illustrative result</span>
                )}
                <Segmented<ChartMode>
                  size="sm"
                  label="Chart view"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'raw', label: 'Raw' },
                    { value: 'harmonized', label: 'Harmonized' },
                    { value: 'compare', label: 'Compare Both' },
                  ]}
                />
              </div>
            </div>
            <div className="mt-5">
              <SensorChart
                series={series}
                mode={mode}
                height={mode === 'compare' ? 190 : 230}
                highlightKey={monthFilter && monthFilter.year !== null ? `${monthFilter.year}-${monthFilter.month}` : null}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-bone-dim">
              <span className="flex items-center gap-2"><SensorGlyph sensor="MODIS" /> MODIS</span>
              <span className="flex items-center gap-2"><SensorGlyph sensor="VIIRS" /> VIIRS</span>
              <span>VIIRS/MODIS ratio k = {fit.k.toFixed(2)}</span>
              <span>R² = {fit.r2.toFixed(2)}</span>
              <span>Net bias {(fit.bias * 100).toFixed(1)}%</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function passesQuality(q: Quality, filter: QualityFilter) {
  if (filter === 'all') return true
  if (filter === 'nominal') return q !== 'low'
  return q === 'high'
}

function YearSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-w-0 flex-1 border border-line bg-ink-2 px-2 py-1.5 font-mono text-xs text-bone outline-none [color-scheme:dark] focus:border-ember"
    >
      {YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}

export type { Detection }

function ArrowLeftIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m12 19-7-7 7-7M5 12h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3"><path d="m18 6-12 12M6 6l12 12" strokeLinecap="round" /></svg>
}
