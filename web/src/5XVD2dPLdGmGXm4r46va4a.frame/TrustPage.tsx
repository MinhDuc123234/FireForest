import React from 'react'

import { TrustLimits } from './components/TrustLimits'
import { KpiStrip } from '../shared/components/KpiStrip'
import { usePageMeta } from '../shared/lib/usePageMeta'

/** /trust: the evidence. Held-out validation, R table, Aqua overpass, checks, limits, data and sources. */
export default function TrustPage() {
  usePageMeta(
    'Trust · FireForest',
    'Held-out validation of the MODIS/VIIRS harmonization for Vietnam, calibration ratios, automatic checks, limits and sources.'
  )
  return (
    <>
      <div className="mx-auto max-w-[1280px] px-5 pt-16 md:px-10 md:pt-24">
        <p className="font-mono text-[11px] text-muted">Trust</p>
        <h1 className="mt-3 max-w-[18ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.04em]">
          The evidence, and where it stops
        </h1>
        <div className="mt-12">
          <KpiStrip />
        </div>
      </div>
      <TrustLimits />
    </>
  )
}
