import React from 'react'

import { ScanFrame } from '../../shared/components/ScanFrame'
import { PointScene } from '../../shared/three/PointScene'
import { buildHeroScene } from '../../shared/three/scenes'
import { DETECTIONS, SITE } from '../../shared/data/fires'

type Props = { line1: string; line2: string; onExplore?: () => void }

export function Hero({ line1, line2, onExplore }: Props) {
  const modis = DETECTIONS.filter((d) => d.sensor === 'MODIS').length
  const viirs = DETECTIONS.length - modis
  return (
    <section id="top" className="relative mx-auto max-w-[1280px] px-5 pt-12 md:px-10 md:pt-20">
      <div className="relative lg:min-h-[760px]">
        <h1 className="relative z-10 max-w-[11ch] text-[clamp(3rem,10vw,8.75rem)] font-semibold leading-[0.88] tracking-[-0.045em] text-bone lg:max-w-none">
          <span className="block">{line1}</span>
          <span className="block">{line2}</span>
        </h1>

        <div className="relative z-10 mt-8 max-w-sm lg:absolute lg:left-0 lg:top-[330px] lg:mt-0">
          <p className="text-base leading-relaxed text-bone-dim">
            Satellite fire detections from MODIS and VIIRS, put on one scale so two decades of burning in
            Mekong Delta wetlands can be read as a single record.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExplore}
              className="group inline-flex items-center gap-2 whitespace-nowrap bg-ember px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone"
            >
              Explore Dashboard
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"><path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <a href="#methodology" className="whitespace-nowrap px-2 py-3 text-sm text-bone-dim underline-offset-4 hover:text-bone hover:underline">
              How it works
            </a>
          </div>
        </div>

        <ScanFrame className="mt-10 h-[340px] sm:h-[420px] lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:h-[500px] lg:w-[66%]">
          <PointScene
            build={buildHeroScene}
            camera={{ position: [0, 6.2, 14], target: [1, -0.4, 0], fov: 40 }}
            label="Point-cloud terrain of dotted contour lines with particle tree clusters and glowing fire hotspots"
          />
          <div className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] leading-5 text-bone-dim">
            <div className="text-bone">{SITE.name}</div>
            <div>10.71°N / 105.52°E</div>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 font-mono text-[11px] text-bone-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Thermal anomaly · Demo dataset
          </div>
        </ScanFrame>
      </div>

      <dl className="mt-12 grid grid-cols-2 border-y border-line md:grid-cols-4">
        {[
          ['Site', SITE.name],
          ['Window', '2019 – 2024'],
          ['MODIS detections', modis.toLocaleString()],
          ['VIIRS detections', viirs.toLocaleString()],
        ].map(([k, v], i) => (
          <div key={k} className={`px-0 py-5 md:px-6 ${i % 2 ? 'pl-5' : ''} ${i > 0 ? 'md:border-l md:border-line' : 'md:pl-0'}`}>
            <dt className="font-mono text-[11px] text-muted">{k}</dt>
            <dd className="mt-1 truncate text-sm text-bone">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
