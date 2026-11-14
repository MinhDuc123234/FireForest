import { gauss, mulberry32 } from '../lib/random'

/**
 * DEMO DATASET — synthetic active-fire detections for Tràm Chim National Park.
 * Shaped after FIRMS MODIS (MCD14) and VIIRS 375 m (VNP14IMG) attribute tables,
 * with a Mekong Delta dry-season cycle. Not real observations.
 */

export type Sensor = 'MODIS' | 'VIIRS'
export type Quality = 'low' | 'nominal' | 'high'

export type Detection = {
  id: string
  sensor: Sensor
  satellite: 'Terra' | 'Aqua' | 'Suomi NPP' | 'NOAA-20'
  date: string
  year: number
  month: number
  time: string
  daynight: 'D' | 'N'
  lat: number
  lon: number
  zone: string
  frp: number
  brightness: number
  confidence: Quality
  confidenceRaw: string
  scan: number
  track: number
}

export const SITE = {
  name: 'Tràm Chim National Park',
  province: 'Đồng Tháp, Vietnam',
  center: { lat: 10.71, lon: 105.52 },
  bounds: { minLat: 10.635, maxLat: 10.78, minLon: 105.45, maxLon: 105.6 },
  areaHa: 7313,
}

export const YEARS = [2019, 2020, 2021, 2022, 2023, 2024]
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const ZONES = [
  { id: 'A1', lat: 10.738, lon: 105.502, weight: 1.2 },
  { id: 'A2', lat: 10.72, lon: 105.548, weight: 0.9 },
  { id: 'A3', lat: 10.697, lon: 105.497, weight: 1.4 },
  { id: 'A4', lat: 10.69, lon: 105.565, weight: 0.8 },
  { id: 'A5', lat: 10.664, lon: 105.528, weight: 1.0 },
]

/** Park outline used for the map, lon/lat pairs. Simplified. */
export const PARK_OUTLINE: [number, number][] = [
  [105.468, 10.752],
  [105.497, 10.768],
  [105.535, 10.762],
  [105.566, 10.748],
  [105.588, 10.722],
  [105.584, 10.69],
  [105.566, 10.664],
  [105.538, 10.646],
  [105.504, 10.65],
  [105.478, 10.672],
  [105.462, 10.708],
]

// Dry season (Dec–Apr) carries almost all burning; flood season almost none.
const SEASON = [0.65, 1.0, 1.45, 1.15, 0.4, 0.1, 0.04, 0.03, 0.04, 0.08, 0.15, 0.35]
// 2020 and 2024 were drought years in the Mekong Delta.
const YEAR_FACTOR: Record<number, number> = { 2019: 1.0, 2020: 1.4, 2021: 0.7, 2022: 0.6, 2023: 0.9, 2024: 1.3 }

function pickZone(rand: () => number) {
  const total = ZONES.reduce((s, z) => s + z.weight, 0)
  let r = rand() * total
  for (const z of ZONES) {
    r -= z.weight
    if (r <= 0) return z
  }
  return ZONES[0]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function generate(): Detection[] {
  const rand = mulberry32(2024)
  const out: Detection[] = []
  let n = 0
  for (const year of YEARS) {
    for (let month = 0; month < 12; month++) {
      const activity = Math.max(0, 5.5 * SEASON[month] * YEAR_FACTOR[year] * (1 + 0.25 * gauss(rand)))
      const counts: Record<Sensor, number> = {
        MODIS: Math.round(activity * (0.85 + 0.3 * rand())),
        VIIRS: Math.round(activity * 3.4 * (0.82 + 0.36 * rand())),
      }
      const days = new Date(year, month + 1, 0).getDate()
      for (const sensor of ['MODIS', 'VIIRS'] as Sensor[]) {
        for (let i = 0; i < counts[sensor]; i++) {
          const zone = pickZone(rand)
          const day = 1 + Math.floor(rand() * days)
          const night = rand() < 0.18
          const isModis = sensor === 'MODIS'
          const satellite = isModis ? (rand() < 0.5 ? 'Terra' : 'Aqua') : rand() < 0.55 ? 'Suomi NPP' : 'NOAA-20'
          const hourBase =
            satellite === 'Terra' ? 10 : satellite === 'Aqua' || satellite === 'Suomi NPP' ? 13 : 12
          const hour = night ? (hourBase + 12) % 24 : hourBase
          const minute = Math.floor(rand() * 55)
          let confidence: Quality
          let confidenceRaw: string
          if (isModis) {
            const c = Math.round(18 + rand() * 82)
            confidence = c < 30 ? 'low' : c < 80 ? 'nominal' : 'high'
            confidenceRaw = `${c}%`
          } else {
            const r = rand()
            confidence = r < 0.16 ? 'low' : r < 0.82 ? 'nominal' : 'high'
            confidenceRaw = confidence[0]
          }
          const frp = isModis ? Math.exp(2.6 + gauss(rand) * 0.7) : Math.exp(1.5 + gauss(rand) * 0.75)
          out.push({
            id: `${isModis ? 'M' : 'V'}${year}${pad(month + 1)}-${String(++n).padStart(4, '0')}`,
            sensor,
            satellite,
            date: `${year}-${pad(month + 1)}-${pad(day)}`,
            year,
            month,
            time: `${pad(hour)}:${pad(minute)}`,
            daynight: night ? 'N' : 'D',
            lat: +(zone.lat + gauss(rand) * 0.009).toFixed(4),
            lon: +(zone.lon + gauss(rand) * 0.011).toFixed(4),
            zone: zone.id,
            frp: +frp.toFixed(1),
            brightness: +(isModis ? 306 + rand() * 38 : 300 + rand() * 62).toFixed(1),
            confidence,
            confidenceRaw,
            scan: +(isModis ? 1 + rand() * 1.4 : 0.37 + rand() * 0.2).toFixed(2),
            track: +(isModis ? 1 + rand() * 0.9 : 0.36 + rand() * 0.18).toFixed(2),
          })
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const DETECTIONS: Detection[] = generate()
