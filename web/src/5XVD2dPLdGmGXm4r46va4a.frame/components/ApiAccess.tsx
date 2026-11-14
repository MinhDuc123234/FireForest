import React, { useState } from 'react'

import { ScanFrame } from '../../shared/components/ScanFrame'
import { PointScene } from '../../shared/three/PointScene'
import { buildRegionScene } from '../../shared/three/scenes'
import { DETECTIONS, SITE, type Sensor } from '../../shared/data/fires'

type FormState = 'idle' | 'submitted'

export function ApiAccess({ initialState }: { initialState: FormState }) {
  const [state, setState] = useState<FormState>(initialState)
  const [bbox, setBbox] = useState('105.450,10.635,105.600,10.780')
  const [from, setFrom] = useState('2023-01-01')
  const [to, setTo] = useState('2024-04-30')
  const [sensors, setSensors] = useState<Sensor[]>(['MODIS', 'VIIRS'])
  const [harmonized, setHarmonized] = useState(true)
  const [format, setFormat] = useState<'geojson' | 'csv'>('geojson')

  const matched = DETECTIONS.filter((d) => sensors.includes(d.sensor) && d.date >= from && d.date <= to)
  const url = `GET /v1/fires?bbox=${bbox}&start=${from}&end=${to}&sensors=${sensors.join(',').toLowerCase()}${
    harmonized ? '&harmonize=modis_eq' : ''
  }&format=${format}`

  const toggleSensor = (s: Sensor) =>
    setSensors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  return (
    <section id="api" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-24 md:px-10 md:py-32 lg:grid-cols-2 lg:gap-14">
        <ScanFrame tone="border-bone/60" className="h-[360px] bg-ink-2/40 sm:h-[460px] lg:h-auto lg:min-h-[560px]">
          <PointScene
            build={buildRegionScene}
            camera={{ position: [0, 9.5, 10.5], target: [0, 0, 0], fov: 42 }}
            drift={0.3}
            label="Framed point-cloud terrain of the request region with particle trees and orange fire hotspots"
          />
          <div className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] leading-5">
            <div className="text-bone">10.71°N / 105.52°E</div>
            <div className="text-bone-dim">{SITE.name}</div>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 font-mono text-[11px] text-ember">
            Area of interest
          </div>
        </ScanFrame>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
              Regional API Access
            </h2>
          </div>
          <p className="mt-5 max-w-lg text-bone-dim">
            Pull harmonized detections for any bounding box as GeoJSON or CSV — the same records the dashboard
            draws.
          </p>
          <p className="mt-4 inline-block border border-line px-2 py-1 font-mono text-[11px] text-bone-dim">
            Demo — no backend connected. Requests are answered from the local demo dataset.
          </p>

          <form
            className="mt-8 grid gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              setState('submitted')
            }}
          >
            <Field label="Bounding box (minLon, minLat, maxLon, maxLat)">
              <input
                value={bbox}
                onChange={(e) => setBbox(e.target.value)}
                className="w-full border border-line bg-ink-2 px-3 py-2.5 font-mono text-sm text-bone outline-none focus:border-ember"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full border border-line bg-ink-2 px-3 py-2.5 font-mono text-sm text-bone outline-none [color-scheme:dark] focus:border-ember"
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full border border-line bg-ink-2 px-3 py-2.5 font-mono text-sm text-bone outline-none [color-scheme:dark] focus:border-ember"
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 font-mono text-[11px] text-muted">Sensors</legend>
                <div className="flex gap-4">
                  {(['MODIS', 'VIIRS'] as Sensor[]).map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-2 text-sm text-bone">
                      <input type="checkbox" checked={sensors.includes(s)} onChange={() => toggleSensor(s)} className="h-4 w-4 accent-[#ff6a1f]" />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 font-mono text-[11px] text-muted">Format</legend>
                <div className="flex gap-4">
                  {(['geojson', 'csv'] as const).map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 text-sm text-bone">
                      <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} className="h-4 w-4 accent-[#ff6a1f]" />
                      {f === 'geojson' ? 'GeoJSON' : 'CSV'}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-bone">
              <input type="checkbox" checked={harmonized} onChange={(e) => setHarmonized(e.target.checked)} className="h-4 w-4 accent-[#ff6a1f]" />
              Return VIIRS as MODIS-equivalent (harmonized)
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!sensors.length}
                className="whitespace-nowrap bg-ember px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
              >
                Generate request
              </button>
              <span className="font-mono text-[11px] text-bone-dim">{matched.length} records match</span>
            </div>
          </form>

          {state === 'submitted' && (
            <div className="mt-8 border border-line bg-ink-2" aria-live="polite">
              <div className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-[11px]">
                <span className="text-bone-dim">Demo response · 200</span>
                <span className="text-muted">{matched.length} features</span>
              </div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-5 text-bone-dim">
                <span className="text-ember">{url}</span>
                {'\n\n'}
                {preview(matched.slice(0, 2), format)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] text-muted">{label}</span>
      {children}
    </label>
  )
}

function preview(rows: typeof DETECTIONS, format: 'geojson' | 'csv') {
  if (format === 'csv') {
    return ['id,sensor,date,time,lat,lon,frp,confidence', ...rows.map((d) => `${d.id},${d.sensor},${d.date},${d.time},${d.lat},${d.lon},${d.frp},${d.confidence}`)].join('\n')
  }
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: rows.map((d) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
        properties: { id: d.id, sensor: d.sensor, date: d.date, frp: d.frp, confidence: d.confidence },
      })),
    },
    null,
    2
  )
}
