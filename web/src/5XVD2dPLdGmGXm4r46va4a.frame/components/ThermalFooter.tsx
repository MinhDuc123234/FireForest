import React from 'react'

import { Logo, SECTIONS } from './SiteNav'

const REPO = 'https://github.com/MinhDuc123234/FireForest'
const SPACE_APPS = 'https://www.spaceappschallenge.org/'

/** Team members, in display order. Names to be supplied by the team. */
const TEAM: string[] = []

export function ThermalFooter({ onDashboard }: { onDashboard?: () => void }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-24 md:px-10 md:pt-32">
        <p className="max-w-[16ch] text-[clamp(2.5rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Read the fire season before it starts.
        </p>
        <button
          type="button"
          onClick={onDashboard}
          className="mt-10 whitespace-nowrap bg-bone px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-ember focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
        >
          Open Explorer
        </button>

        <div className="mt-24 grid gap-10 border-t border-line pt-8 text-sm md:grid-cols-12 md:gap-8">
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
                <a href={SPACE_APPS} className="text-bone-dim hover:text-bone" rel="noreferrer" target="_blank">
                  NASA Space Apps Challenge
                </a>
              </li>
              <li>
                <a href="https://firms.modaps.eosdis.nasa.gov/" className="text-bone-dim hover:text-bone" rel="noreferrer" target="_blank">
                  NASA FIRMS
                </a>
              </li>
            </ul>
          </div>
          <div className="md:col-span-3">
            <h3 className="font-mono text-[11px] text-muted">Team</h3>
            {TEAM.length ? (
              <ul className="mt-3 space-y-2 text-bone-dim">
                {TEAM.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 font-mono text-[11px] text-muted">[team names pending]</p>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
