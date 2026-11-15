/** What the explorer is looking at, and the series that goes with it. */
import type { BandRow } from '../shared/components/BandChart'
import type { MacroRegion, National, Province, Provinces, Region } from '../shared/data/load'

export type Entity = { kind: 'all' } | { kind: 'region'; name: MacroRegion } | { kind: 'province'; name: string }

export const entityLabel = (e: Entity) => (e.kind === 'all' ? 'Vietnam' : e.name)
export const entityRegion = (e: Entity): Region | null => (e.kind === 'all' ? 'Vietnam' : e.kind === 'region' ? e.name : null)

/** Lower-case, diacritics removed, đ → d: "Dien Bien" finds "Điện Biên". */
export function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/** Monthly rows of a national / regional series (full record, from national.json). */
export function regionRows(nat: National, region: Region): BandRow[] {
  const s = nat.regions[region]
  return nat.months.flatMap((month, i) => {
    const v = s.harmonized[i]
    if (v === null) return []
    return [{ month, v, lo: s.lo[i] ?? v, hi: s.hi[i] ?? v, gap: s.aqua_gap[i], z: s.z[i], anomaly: s.anomaly[i] }]
  })
}

/** Monthly rows of a province (VIIRS era only, from provinces.json); gap flags come from the national series. */
export function provinceRows(p: Province, prov: Provinces, nat: National): BandRow[] {
  const gap = new Map(nat.months.map((m, i) => [m, nat.regions.Vietnam.aqua_gap[i]]))
  return prov.months.map((month, i) => ({ month, v: p.harmonized[i], lo: p.lo[i], hi: p.hi[i], gap: gap.get(month) ?? false }))
}

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null
}

/** Median of the same calendar month over the years up to `lastYear` (the comparison in the province card). */
export function sameMonthMedian(rows: BandRow[], month: string, lastYear: number) {
  const mm = month.slice(5)
  const same = rows.filter((r) => r.month.slice(5) === mm && Number(r.month.slice(0, 4)) <= lastYear)
  const med = median(same.map((r) => r.v))
  if (med === null) return null
  return { median: med, from: Number(same[0].month.slice(0, 4)), to: Number(same[same.length - 1].month.slice(0, 4)) }
}
