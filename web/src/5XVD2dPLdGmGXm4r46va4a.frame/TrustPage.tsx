import React from 'react'

import { TrustLimits } from './components/TrustLimits'
import { usePageMeta } from '../shared/lib/usePageMeta'

/** /trust: the evidence. Held-out validation, R table, Aqua overpass, checks, limits, data and sources. */
export default function TrustPage() {
  usePageMeta(
    'HotSpot · Trust',
    'HotSpot · Held-out validation of the MODIS/VIIRS harmonization for Vietnam, calibration ratios, Aqua orbit drift, automatic checks, limits and sources.'
  )
  return <TrustLimits />
}
