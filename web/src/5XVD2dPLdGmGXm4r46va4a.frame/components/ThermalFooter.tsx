import React from 'react'

import { Logo, SECTIONS } from './SiteNav'
import { FireStripes } from '../../shared/components/FireStripes'
import { DataValue } from '../../shared/components/DataStatus'
import { fmtInt } from '../../shared/lib/format'

const REPO = 'https://github.com/MinhDuc123234/FireForest'
const CHALLENGE = 'https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/'

/** Team members, in display order. Names to be supplied by the team. */
const TEAM: string[] = []

export function ThermalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-24 md:px-10 md:pt-32">
        <p className="max-w-[30ch] text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-bone">
          <DataValue file="national.json" pick={(d) => fmtInt(d.months.length)} /> months of Vietnam's fires, one sensor scale.
        </p>
        <FireStripes height={72} className="mt-8" />

        <div className="mt-16 grid gap-10 border-t border-line pt-8 text-sm md:grid-cols-12 md:gap-8">
          <div className="md:col-span-5">
            <Logo />
            <p className="mt-4 max-w-[44ch] text-bone-dim">
              NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots. Harmonized active-fire record
              for Vietnam from NASA FIRMS (MODIS C6.1, VIIRS C2).
            </p>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-mono text-[11px] text-muted">Sections</h3>
            <ul className="mt-3 space-y-2">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <a href={s.href} className="text-bone-dim hover:text-bone">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-mono text-[11px] text-muted">Links</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={REPO} className="text-bone-dim hover:text-bone" rel="noreferrer" target="_blank">
                  GitHub repository
                </a>
              </li>
              <li>
                <a href={CHALLENGE} className="text-bone-dim hover:text-bone" rel="noreferrer" target="_blank">
                  Challenge page
                </a>
              </li>
              <li>
                <a href="https://firms.modaps.eosdis.nasa.gov/" className="text-bone-dim hover:text-bone" rel="noreferrer" target="_blank">
                  NASA FIRMS
                </a>
              </li>
            </ul>
          </div>
          {TEAM.length > 0 && (
            <div className="md:col-span-3">
              <h3 className="font-mono text-[11px] text-muted">Team</h3>
              <ul className="mt-3 space-y-2 text-bone-dim">
                {TEAM.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
