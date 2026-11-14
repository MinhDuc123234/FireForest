import React from 'react'

import { UNIT } from '../data/load'

/** Provenance line under every chart: NASA FIRMS · harmonize_fire_v2.py · <csv> · <unit>. */
export function SourceChip({ csv, unit = UNIT, extra, className = '' }: { csv: string; unit?: string; extra?: string; className?: string }) {
  return (
    <p className={`font-mono text-[10px] leading-relaxed text-muted ${className}`}>
      NASA FIRMS · harmonize_fire_v2.py · {csv} · {unit}
      {extra ? ` · ${extra}` : ''}
    </p>
  )
}
