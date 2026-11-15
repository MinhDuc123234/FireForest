import React from 'react'

import { UNIT, UNIT_PLAIN } from '../data/load'

/**
 * Provenance line under every chart: NASA FIRMS · harmonize_fire_v2.py · <csv> · <unit>.
 * `plain` uses the everyday wording of the unit (home page); the full term is used on /method, /trust, /explore.
 */
export function SourceChip({ csv, unit, plain, extra, className = '' }: { csv: string; unit?: string; plain?: boolean; extra?: string; className?: string }) {
  return (
    <p className={`font-mono text-[10px] leading-relaxed text-muted ${className}`}>
      NASA FIRMS · harmonize_fire_v2.py · {csv} · {unit ?? (plain ? UNIT_PLAIN : UNIT)}
      {extra ? ` · ${extra}` : ''}
    </p>
  )
}
