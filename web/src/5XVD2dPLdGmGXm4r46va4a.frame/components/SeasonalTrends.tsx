import React, { useMemo } from 'react'

import { ScanFrame } from '../../shared/components/ScanFrame'
import { DETECTIONS, MONTHS, YEARS } from '../../shared/data/fires'

const PHASES = [
  {
    month: 0,
    phase: 'Early dry season',
    note: 'Canals still hold water; first fires appear at the reed margins.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/a5ddfa05-753b-4fd6-9ecc-412e4cd78397.jpg',
    offset: 'md:mt-0',
  },
  {
    month: 2,
    phase: 'Peak burn',
    note: 'Peat dries out and grass fires spread fastest — most detections land here.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/bfbba48a-1c9b-4871-a560-b2eba11e64a5.jpg',
    offset: 'md:mt-24',
  },
  {
    month: 4,
    phase: 'Scar & regrowth',
    note: 'First rains; burn scars stay visible while new grass comes through.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/d240ce5e-38b2-49c5-beef-b1d585d46ddb.jpg',
    offset: 'md:mt-10',
  },
  {
    month: 8,
    phase: 'Flood season',
    note: 'The Mekong floods the park. Detections drop to almost none.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/bb09a363-5fa0-4100-b85a-6088750674f5.jpg',
    offset: 'md:mt-36',
  },
]

export function SeasonalTrends() {
  const perMonth = useMemo(() => {
    const counts = Array(12).fill(0)
    for (const d of DETECTIONS) counts[d.month]++
    return counts.map((c) => c / YEARS.length)
  }, [])
  const max = Math.max(...perMonth)

  return (
    <section id="seasonal" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
            Fire follows the water
          </h2>
          <p className="max-w-md text-bone-dim">
            Tràm Chim burns on a calendar set by the Mekong. Average detections per month, both sensors, demo
            dataset 2019–2024.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {PHASES.map((p) => (
            <figure key={p.phase} className={`flex flex-col ${p.offset}`}>
              <ScanFrame tone="border-bone/70" size="sm" className="aspect-[3/4] overflow-hidden bg-ink-2">
                <img src={p.src} alt={`${p.phase} in a Mekong Delta wetland`} loading="lazy" className="h-full w-full object-cover" />
              </ScanFrame>
              <figcaption className="mt-4">
                <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                  <span className="text-ember">{MONTHS[p.month]}</span>
                  <span className="text-bone-dim">{perMonth[p.month].toFixed(1)} / mo</span>
                </div>
                <div className="mt-1 text-base font-medium text-bone">{p.phase}</div>
                <p className="mt-1 text-sm leading-relaxed text-bone-dim">{p.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-12 items-end gap-1 sm:gap-2" aria-label="Average detections per month">
          {perMonth.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end">
                <div
                  className={`w-full ${PHASES.some((p) => p.month === i) ? 'bg-ember' : 'bg-bone/25'}`}
                  style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                  title={`${MONTHS[i]}: ${v.toFixed(1)} detections / month`}
                />
              </div>
              <span className="font-mono text-[10px] text-muted">{MONTHS[i][0]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
