import React from 'react'

import { ScanFrame } from '../../shared/components/ScanFrame'

const STAGES = [
  {
    n: '01',
    title: 'Detect',
    body: 'MODIS (1 km, since 2000) and VIIRS (375 m, since 2012) flag pixels hotter than their surroundings, four overpasses a day.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/a590496e-99df-458c-9257-3f36aa7b5be3.jpg',
    alt: 'Aerial view at dusk of a melaleuca wetland with a smoke plume rising from a small fire',
  },
  {
    n: '02',
    title: 'Locate',
    body: 'Each detection carries a footprint, a brightness temperature and fire radiative power, so a hotspot can be pinned to a park zone.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/d9049219-8151-4a1d-b5be-5f97a195d5eb.jpg',
    alt: 'Night thermal satellite view of a river delta with small bright hotspots',
  },
  {
    n: '03',
    title: 'Assess',
    body: 'Detections are read against the burned surface they leave behind — peat, reed and melaleuca respond differently to the same fire.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/a9432691-2cb2-44f8-9dc4-1c37430937e5.jpg',
    alt: 'A blackened burn scar cutting across green wetland reeds and channels',
  },
  {
    n: '04',
    title: 'Validate',
    body: 'Ranger reports and handheld thermal checks close the loop, separating real fires from sun-glint and agricultural burns at the edge.',
    src: 'https://cdn.magicpatterns.com/patterns/generated-images/9a219a35-bed0-42f0-87e2-fa7cb6f8f690.jpg',
    alt: 'A researcher on a boardwalk at night aiming a thermal camera at a distant glow',
  },
]

export function Methodology() {
  return (
    <section id="methodology" className="mx-auto max-w-[1280px] scroll-mt-20 px-5 py-24 md:px-10 md:py-32">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
        <h2 className="text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
          From a hot pixel to a fire record
        </h2>
        <p className="max-w-xl text-bone-dim lg:justify-self-end">
          Four stages turn raw satellite flags into something a park manager can act on. The dashboard exposes
          the first three; the fourth is where local knowledge comes in.
        </p>
      </div>

      <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2">
        {STAGES.map((s) => (
          <article key={s.n} className="grid grid-rows-[auto_auto_1fr]">
            <ScanFrame tone="border-bone/70" size="sm" className="aspect-[4/3] overflow-hidden bg-ink-2">
              <img src={s.src} alt={s.alt} loading="lazy" className="h-full w-full object-cover opacity-90" />
              <span className="absolute left-3 top-3 font-mono text-[11px] text-bone">{s.n}</span>
            </ScanFrame>
            <h3 className="mt-5 text-2xl font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-bone-dim">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
