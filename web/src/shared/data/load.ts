/**
 * Data layer: every number on the site comes from web/public/data/*.json, written by
 * web/scripts/export_data.py from the pipeline outputs in out/ (harmonize_fire_v2.py).
 * Nothing here computes or invents values; it only fetches, caches and types them.
 */
import { useEffect, useState } from 'react'

export const UNIT = 'fire-active 10 km cell-days'

export type Region = 'Vietnam' | 'South' | 'Central' | 'North-Central' | 'North'
export type MacroRegion = Exclude<Region, 'Vietnam'>

type Meta = {
  generator: string
  pipeline: string
  source: string
  unit: string
  notes?: string[]
}

/* ---------------------------------------------------------------- national.json */
export type RegionSeries = {
  aqua_observed: (number | null)[]
  snpp_raw: (number | null)[]
  naive_splice: (number | null)[]
  harmonized: (number | null)[]
  lo: (number | null)[]
  hi: (number | null)[]
  z: (number | null)[]
  anomaly: ('high' | 'low' | null)[]
  aqua_gap: boolean[]
}
export type National = {
  meta: Meta & { first_month: string; last_month: string; viirs_start: string; regions: Region[] }
  months: string[]
  regions: Record<Region, RegionSeries>
}

/* ---------------------------------------------------------------- provinces.json */
export type Trend = { years: string; theil_sen_pct_per_year: number | null; kendall_tau: number; p_value: number }
export type Province = {
  name: string
  region: MacroRegion | null
  region_share: Partial<Record<MacroRegion, number>>
  n_cells: number
  total: number
  total_lo: number
  total_hi: number
  /** Calendar month 1-12. */
  peak_month: number
  peak_month_mean: number
  calendar_mean: number[]
  annual: { years: number[]; values: number[] }
  trend: Trend | null
  band_rel_width_median: number | null
  rank_total: number
  harmonized: number[]
  lo: number[]
  hi: number[]
}
export type Provinces = {
  meta: Meta & { first_month: string; last_month: string; n_provinces: number; full_years: number[] }
  months: string[]
  provinces: Province[]
}

/* ---------------------------------------------------------------- grid */
/** [lat, lon, month_index 0-11, harm] */
export type GridRow = [number, number, number, number]
export type GridYear = { meta: Meta & { year: number; columns: string[] }; rows: GridRow[] }
/** [cell10, lat, lon, province, region, mean_monthly, total] */
export type GridCell = [number, number, number, string, MacroRegion, number, number]
export type GridCells = {
  meta: Meta & { first_month: string; last_month: string; n_months: number; n_cells: number; columns: string[] }
  cells: GridCell[]
}
export type GridMarch = { meta: Meta & { years: number[] }; years: number[]; values: number[][] }

/* ---------------------------------------------------------------- seasonal.json */
export type SeasonalRow = {
  cal_month: number
  mean: number
  median: number
  sd: number
  p10: number
  p90: number
  share_of_year_pct: number
}
export type Seasonal = { meta: Meta; regions: Record<Region, SeasonalRow[]> }

/* ---------------------------------------------------------------- trust.json */
export type ValidationMethod = 'raw VIIRS' | 'constant ratio' | 'physics + calibration'
export type Trust = {
  meta: { generator: string; pipeline: string; unit: string; sources: Record<string, string> }
  validation: {
    train_end: number
    note: string
    rows: { region: Region; method: ValidationMethod; bias_pct: number; wMAPE_pct: number; r_log: number }[]
  }
  trend: ({ region: Region; series: 'aqua_observed' | 'naive_splice' | 'harmonized' } & Trend)[]
  calibration_R: {
    regions: MacroRegion[]
    calendar_months: number[]
    R: Record<MacroRegion, number[]>
    calib_end: number
    note: string
  }
  overpass: { note: string; rows: { year: number; median_local_hour: number }[] }
  aqua_gap: {
    months: string[]
    flagged: { month: string; aqua_days: number; snpp_days: number; coverage: number | null; gap: boolean }[]
    columns: string[]
    report: [string, number, number, number | null, boolean][]
  }
}

/* ---------------------------------------------------------------- kpi.json */
type Step = { ratio: number; mean_2012_2016: number; mean_2007_2011: number; years_used: [number, number] }
type Held = { bias_pct: number; wMAPE_pct: number; r_log: number }
export type Kpi = {
  meta: { generator: string; pipeline: string; unit: string; sources: Record<string, string>; notes: string[] }
  step_2012: Record<'naive_splice' | 'harmonized' | 'aqua_observed', Step>
  annual_national: Record<'naive_splice' | 'harmonized' | 'aqua_observed', Record<string, number | null>>
  trend: Record<'naive_splice' | 'harmonized' | 'aqua_observed', Trend>
  held_out: Record<'raw_viirs' | 'constant_ratio' | 'physics_calibration', Held>
  headline: {
    step: { naive: number; harmonized: number; aqua_observed: number }
    trend_pct_per_year: { naive: number; harmonized: number }
    held_out_bias_pct: { naive: number; naive_label: string; harmonized: number }
  }
}

/* ---------------------------------------------------------------- method.json */
export type Method = {
  path: string
  sha256: string
  lines: number
  docstring: string
  constants: Record<string, { value: unknown; source: string; line: number; comment?: string }>
  functions: {
    name: string
    line: number
    signature: string
    docstring: string | null
    params: { name: string; default: unknown; default_source: string | null }[]
  }[]
  arguments: {
    flag: string
    default: unknown
    default_source: string | null
    type: string | null
    action: string | null
    help: string | null
    line: number
  }[]
  viirs_start: { value: string; comment: string; line: number } | null
  pixel_area_formula: { source: string; comment: string } | null
}

/* ---------------------------------------------------------------- checks.json */
export type CheckItem = {
  status: 'PASS' | 'FAIL' | 'INFO' | 'OTHER'
  name: string
  detail: string | null
  extra: string[]
}
export type Checks = {
  meta: { generator: string; script: string; command: string }
  exit_code: number
  n_checks: number
  n_pass: number
  n_fail: number
  summary: string | null
  all_passed: boolean
  items: CheckItem[]
  stdout: string
  stderr: string
}

/* ---------------------------------------------------------------- provinces.geojson */
export type ProvinceFeature = {
  type: 'Feature'
  bbox: [number, number, number, number]
  properties: { name: string; iso: string; region: MacroRegion | null; has_data: boolean; offshore_parts: number }
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}
export type ProvincesGeo = {
  type: 'FeatureCollection'
  meta: Record<string, unknown>
  features: ProvinceFeature[]
}

/* ---------------------------------------------------------------- fetching */
export type DataFiles = {
  'national.json': National
  'provinces.json': Provinces
  'grid_cells.json': GridCells
  'grid_march.json': GridMarch
  'seasonal.json': Seasonal
  'trust.json': Trust
  'kpi.json': Kpi
  'method.json': Method
  'checks.json': Checks
  'provinces.geojson': ProvincesGeo
}
export type DataFile = keyof DataFiles
export type GridFile = `grid/${number}.json`
export type AnyFile = DataFile | GridFile
export type FileData<F extends AnyFile> = F extends DataFile ? DataFiles[F] : GridYear

/** URL of a file in public/data, respecting Vite's base path (for static hosting under a sub-path). */
export function dataUrl(file: string) {
  return `${import.meta.env.BASE_URL}data/${file}`
}

const cache = new Map<string, Promise<unknown>>()

/** Fetch one data file once per page load; failed requests are evicted so they can be retried. */
export function loadFile<F extends AnyFile>(file: F): Promise<FileData<F>> {
  let p = cache.get(file) as Promise<FileData<F>> | undefined
  if (!p) {
    p = fetch(dataUrl(file)).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return p
}

export const gridFile = (year: number): GridFile => `grid/${year}.json`
export const loadGridYear = (year: number) => loadFile(gridFile(year))

export type Loadable<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error }

/** React hook: state of one data file. Pass null to wait (stays 'loading', nothing is fetched). */
export function useData<F extends AnyFile>(file: F | null): Loadable<FileData<F>> {
  const [state, setState] = useState<Loadable<FileData<F>>>({ status: 'loading', data: null, error: null })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading', data: null, error: null })
    if (file === null) return
    loadFile(file).then(
      (data) => alive && setState({ status: 'ready', data, error: null }),
      (error: unknown) =>
        alive && setState({ status: 'error', data: null, error: error instanceof Error ? error : new Error(String(error)) })
    )
    return () => {
      alive = false
    }
  }, [file])
  return state
}

/** Provenance chip text: NASA FIRMS · harmonize_fire_v2.py · <csv> · <unit>. */
export function sourceChip(csv: string, unit: string = UNIT) {
  return `NASA FIRMS · harmonize_fire_v2.py · ${csv} · ${unit}`
}
