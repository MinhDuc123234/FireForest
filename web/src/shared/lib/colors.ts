import { scaleLinear } from 'd3-scale'

/**
 * Colour roles (one meaning each):
 *  - FIRE:    fire intensity only (deep red -> pale yellow, no purple); INFERNO kept for reference
 *  - ACTION:  buttons / interactive accent
 *  - TRUST:   the harmonized series (our result)
 *  - NAIVE:   naive splice (grey, dashed) - never red/orange so it is not read as intensity
 *  - AQUA:    Aqua MODIS observed (reference)
 *  - WARN:    caveats (gap months, orbit drift, FAIL)
 */
export const INFERNO = ['#1B0C2E', '#6A1B4D', '#C8371F', '#F28C28', '#FFE08A'] as const
/** The fire end of the same ramp, starting from deep red (map columns and heat): no purple on the map. */
export const FIRE = ['#5a1610', '#9a2416', '#C8371F', '#F28C28', '#FFE08A'] as const
/**
 * Map columns by absolute fire days per 10 km square (not normalised): faint deep red at the drawing
 * threshold, red, orange, pale yellow from 4 days up. The same stops drive the map and its legend.
 */
export const MAP_STOPS = [
  { v: 0.1, c: 'rgba(122,29,18,0.35)' },
  { v: 0.5, c: '#C8371F' },
  { v: 1.5, c: '#F28C28' },
  { v: 4, c: '#FFE08A' },
] as const
export const ACTION = '#FF6A1F'
export const TRUST = '#3BC9DB'
export const NAIVE = '#8d8c85'
export const AQUA = '#ecebe4'
export const WARN = '#FFB020'
export const GRID = '#2a2a26'
export const MUTED = '#75746d'

const inf = scaleLinear<string>()
  .domain(INFERNO.map((_, i) => i / (INFERNO.length - 1)))
  .range(INFERNO as unknown as string[])
  .clamp(true)

/** t in [0, 1] -> inferno hex/rgb string */
export const inferno = (t: number) => inf(t)

const fireScale = scaleLinear<string>()
  .domain(FIRE.map((_, i) => i / (FIRE.length - 1)))
  .range(FIRE as unknown as string[])
  .clamp(true)
/** t in [0, 1] -> map fire colour */
export const fire = (t: number) => fireScale(t)

/** t in [0, 1] -> [r, g, b] in 0..1 (for WebGL) */
export function infernoRGB(t: number): [number, number, number] {
  const s = inf(t)
  const m = s.match(/\d+(\.\d+)?/g)
  if (!m) return [0, 0, 0]
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255]
}
