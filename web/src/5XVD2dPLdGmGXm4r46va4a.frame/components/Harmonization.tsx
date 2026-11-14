import React, { useMemo, useState } from 'react'

import { ScanFrame } from '../../shared/components/ScanFrame'
import { Segmented } from '../../shared/components/Segmented'
import { SensorChart, SensorGlyph, type ChartMode } from '../../shared/components/SensorChart'
import { PointScene } from '../../shared/three/PointScene'
import { buildHarmonizationScene } from '../../shared/three/scenes'
import { DETECTIONS } from '../../shared/data/fires'
import { fitRatio, monthlySeries } from '../../shared/lib/harmonize'

const STEPS = [
  ['Grid to a common cell', 'Aggregate VIIRS 375 m detections onto the MODIS 1 km grid so one fire is not counted as several.'],
  ['Match confidence', 'Map MODIS 0–100% and VIIRS low / nominal / high onto one three-class quality scale.'],
  ['Restrict to overlap', 'Fit only on months both sensors observed — here 2019 to 2024 — never extrapolate across gaps.'],
  ['Fit and rescale', 'A through-origin ratio expresses VIIRS in MODIS-equivalent detections, extending the long record.'],
]

export function Harmonization({ initialMode }: { initialMode: ChartMode }) {
  const [mode, setMode] = useState<ChartMode>(initialMode)
  const series = useMemo(() => monthlySeries(DETECTIONS, 2019, 2024), [])
  const fit = useMemo(() => fitRatio(series), [series])

  return (
    <section id="harmonization" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <h2 className="max-w-3xl text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
          Two sensors, one scale
        </h2>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
          <ScanFrame tone="border-ember" className="aspect-square w-full bg-ink-2/40">
            <PointScene
              build={buildHarmonizationScene}
              camera={{ position: [0, 4.2, 12.5], target: [0, 2.9, 0], fov: 40 }}
              drift={0.25}
              parallax={0.8}
              label="A tall particle tree with smaller trees and rings at its base, crossed by a slow horizontal scan line"
            />
            <div className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] leading-5 text-bone-dim">
              <div className="text-bone">Canopy scan</div>
              <div>375 m → 1 km</div>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[11px] text-ember">Scan pass</div>
          </ScanFrame>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented<ChartMode>
                label="Chart view"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'raw', label: 'Raw' },
                  { value: 'harmonized', label: 'Harmonized' },
                  { value: 'compare', label: 'Compare Both' },
                ]}
              />
              <span className="border border-ember/50 px-2 py-1 font-mono text-[11px] text-ember">Illustrative result</span>
            </div>

            <div className="mt-6">
              <SensorChart series={series} mode={mode} height={mode === 'compare' ? 180 : 240} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-bone-dim">
              <span className="flex items-center gap-2">
                <SensorGlyph sensor="MODIS" /> MODIS · Terra/Aqua
              </span>
              <span className="flex items-center gap-2">
                <SensorGlyph sensor="VIIRS" /> VIIRS · S-NPP/NOAA-20
              </span>
              <span>
                k = {fit.k.toFixed(2)} · R² = {fit.r2.toFixed(2)} · 2019–2024 overlap
              </span>
            </div>

            <ol className="mt-10 border-t border-line">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-line py-4">
                  <span className="font-mono text-xs text-ember">{i + 1}</span>
                  <div>
                    <h3 className="text-sm font-medium text-bone">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-bone-dim">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
