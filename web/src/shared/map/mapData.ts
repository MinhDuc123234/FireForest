/** Geometry prepared once from grid_cells.json and provinces.geojson for the map layers. */
import type { GridCells, ProvincesGeo } from '../data/load'

/** Parts east of this longitude are the two archipelagos (same rule as export_data.py). */
const OFFSHORE_LON = 110.5
/** Display names of the offshore parts, keyed by the province they belong to in provinces.geojson. */
const ARCHIPELAGO: Record<string, string> = { 'Đà Nẵng': 'Quần đảo Hoàng Sa', 'Khánh Hòa': 'Quần đảo Trường Sa' }

export type Bounds = [[number, number], [number, number]]
export type MapGeometry = {
  cells: GeoJSON.FeatureCollection<GeoJSON.Polygon, { i: number; p: string; r: string; v: number }>
  points: GeoJSON.FeatureCollection<GeoJSON.Point, { i: number; v: number; w: number }>
  provinces: GeoJSON.FeatureCollection
  provinceLabels: GeoJSON.FeatureCollection<GeoJSON.Point, { name: string }>
  islands: GeoJSON.FeatureCollection<GeoJSON.Point>
  /** [lon, lat, label] */
  archipelagos: { lon: number; lat: number; label: string }[]
  provinceBounds: Map<string, Bounds>
  regionBounds: Map<string, Bounds>
  /** mainland + archipelagos */
  bounds: Bounds
  /** sample of points that must stay in view at national scale: cells + every island */
  fitPoints: [number, number][]
  mainland: Bounds
}

const grow = (b: Bounds, x: number, y: number) => {
  b[0][0] = Math.min(b[0][0], x); b[0][1] = Math.min(b[0][1], y)
  b[1][0] = Math.max(b[1][0], x); b[1][1] = Math.max(b[1][1], y)
}
const empty = (): Bounds => [[Infinity, Infinity], [-Infinity, -Infinity]]

function ringCentroid(r: number[][]): [number, number, number] {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < r.length - 1; i++) {
    const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f
  }
  if (!a) return [r[0][0], r[0][1], 0]
  return [cx / (3 * a), cy / (3 * a), Math.abs(a / 2)]
}

export function prepare(grid: GridCells, geo: ProvincesGeo): MapGeometry {
  const half = grid.meta.cell_km / 2 / grid.meta.km_per_degree // half a cell, degrees of latitude
  const cells: MapGeometry['cells'] = { type: 'FeatureCollection', features: [] }
  const points: MapGeometry['points'] = { type: 'FeatureCollection', features: [] }
  const regionBounds = new Map<string, Bounds>()
  const mainland = empty()
  grid.cells.forEach((c, i) => {
    const [, lat, lon, p, r] = c
    // the pipeline grid is sinusoidal: a cell is 10 km in y and 10 km / cos(lat) in degrees of longitude
    const dx = half / Math.cos((lat * Math.PI) / 180)
    cells.features.push({
      type: 'Feature',
      id: i,
      properties: { i, p, r, v: 0 },
      geometry: { type: 'Polygon', coordinates: [[[lon - dx, lat - half], [lon + dx, lat - half], [lon + dx, lat + half], [lon - dx, lat + half], [lon - dx, lat - half]]] },
    })
    points.features.push({ type: 'Feature', id: i, properties: { i, v: 0, w: 0 }, geometry: { type: 'Point', coordinates: [lon, lat] } })
    if (!regionBounds.has(r)) regionBounds.set(r, empty())
    grow(regionBounds.get(r)!, lon, lat)
    grow(mainland, lon, lat)
  })

  const provinceLabels: MapGeometry['provinceLabels'] = { type: 'FeatureCollection', features: [] }
  const islands: MapGeometry['islands'] = { type: 'FeatureCollection', features: [] }
  const archipelagos: MapGeometry['archipelagos'] = []
  const provinceBounds = new Map<string, Bounds>()
  const bounds: Bounds = [[mainland[0][0], mainland[0][1]], [mainland[1][0], mainland[1][1]]]
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const b = empty()
    const far = empty()
    let best: [number, number, number] = [0, 0, -1]
    for (const poly of polys) {
      const c = ringCentroid(poly[0])
      const offshore = Math.min(...poly[0].map((q) => q[0])) > OFFSHORE_LON
      if (offshore) {
        islands.features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c[0], c[1]] } })
        for (const q of poly[0]) grow(far, q[0], q[1])
      } else {
        for (const q of poly[0]) grow(b, q[0], q[1])
        if (c[2] > best[2]) best = c
      }
    }
    if (best[2] >= 0) {
      provinceBounds.set(f.properties.name, b)
      provinceLabels.features.push({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'Point', coordinates: [best[0], best[1]] } })
    }
    if (Number.isFinite(far[0][0])) {
      const name = ARCHIPELAGO[f.properties.name] ?? f.properties.name
      // anchored at the group's south-east corner and right-aligned, so the label never runs past the islands
      archipelagos.push({ lon: far[1][0], lat: far[0][1], label: `${name} (${f.properties.name})` })
      grow(bounds, far[0][0], far[0][1])
      grow(bounds, far[1][0], far[1][1])
    }
  }
  const fitPoints: [number, number][] = [
    ...grid.cells.filter((_, i) => i % 20 === 0).map((c) => [c[2], c[1]] as [number, number]),
    ...islands.features.map((f) => f.geometry.coordinates as [number, number]),
  ]
  return { cells, points, provinces: geo as unknown as GeoJSON.FeatureCollection, provinceLabels, islands, archipelagos, provinceBounds, regionBounds, bounds, mainland, fitPoints }
}
