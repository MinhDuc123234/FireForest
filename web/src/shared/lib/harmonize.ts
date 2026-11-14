import type { Detection } from '../data/fires'

export type MonthPoint = { key: string; year: number; month: number; modis: number; viirs: number }

/** Monthly detection counts per sensor over the same overlapping window. */
export function monthlySeries(dets: Detection[], yearFrom: number, yearTo: number): MonthPoint[] {
  const rows: MonthPoint[] = []
  const index = new Map<string, MonthPoint>()
  for (let y = yearFrom; y <= yearTo; y++) {
    for (let m = 0; m < 12; m++) {
      const p = { key: `${y}-${m}`, year: y, month: m, modis: 0, viirs: 0 }
      rows.push(p)
      index.set(p.key, p)
    }
  }
  for (const d of dets) {
    const p = index.get(`${d.year}-${d.month}`)
    if (!p) continue
    if (d.sensor === 'MODIS') p.modis++
    else p.viirs++
  }
  return rows
}

/**
 * ILLUSTRATIVE RESULT — through-origin least-squares ratio of VIIRS 375 m counts
 * to MODIS 1 km counts. Dividing VIIRS by k expresses it in MODIS-equivalent detections.
 */
export function fitRatio(series: MonthPoint[]) {
  let num = 0
  let den = 0
  for (const p of series) {
    num += p.viirs * p.modis
    den += p.modis * p.modis
  }
  const k = den > 0 ? num / den : 1
  const harmonized = series.map((p) => p.viirs / k)
  const meanM = series.reduce((s, p) => s + p.modis, 0) / Math.max(series.length, 1)
  let ssRes = 0
  let ssTot = 0
  series.forEach((p, i) => {
    ssRes += (p.modis - harmonized[i]) ** 2
    ssTot += (p.modis - meanM) ** 2
  })
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0
  const totalM = series.reduce((s, p) => s + p.modis, 0)
  const totalH = harmonized.reduce((s, v) => s + v, 0)
  return { k, r2, harmonized, bias: totalM > 0 ? (totalH - totalM) / totalM : 0 }
}
