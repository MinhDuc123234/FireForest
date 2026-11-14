import type { Method } from '../data/load'

/** Physics of harmonize_fire_v2.py, evaluated with the constants parsed into method.json. */
export function physics(m: Method) {
  const c = (k: string) => Number(m.constants[k]?.value)
  const RE = c('R_E'), H = c('H_MODIS'), TH = c('THETA_MAX')
  const D1 = c('D1_DAY'), SL = c('SLOPE_DAY'), W = c('W_FRAC')
  const nNodes = Number(m.functions.find((f) => f.name === 'swath_nodes')?.params.find((p) => p.name === 'n')?.default ?? 14)
  /** swath_nodes(): pixel area (km2) at scan angle th (deg) */
  const pixelArea = (thDeg: number) => {
    const th = (thDeg * Math.PI) / 180
    const Rs = RE + H
    const v = Math.asin((Rs * Math.sin(th)) / RE)
    const r = Rs * Math.cos(th) - RE * Math.cos(v)
    return (r / H) ** 2 / Math.cos(v)
  }
  /** viirs_cellday(): detection limit and logistic detection probability */
  const limit = (ap: number) => D1 + SL * (ap - 1)
  const pDetect = (frp: number, ap: number) => {
    const D = limit(ap)
    return 1 / (1 + Math.exp(-(frp - D) / (W * D)))
  }
  return { RE, H, TH, D1, SL, W, nNodes, pixelArea, limit, pDetect }
}
export type Physics = ReturnType<typeof physics>
