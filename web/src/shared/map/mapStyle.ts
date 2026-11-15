/**
 * Hand-written dark MapLibre style, no API keys:
 *  - vector basemap: OpenFreeMap (OpenMapTiles schema), © OpenMapTiles, data © OpenStreetMap (ODbL);
 *  - hillshade: Mapzen Terrain Tiles on AWS Open Data (terrarium encoding).
 *
 * What is deliberately NOT drawn from the basemap:
 *  - no `water_name` layer at all (no sea / gulf names);
 *  - no maritime or disputed boundary lines, no sub-national boundaries (provinces come from our
 *    own provinces.geojson);
 *  - no place label of any kind inside EAST_SEA. Hoàng Sa and Trường Sa are labelled only by
 *    this app, from provinces.geojson.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

import { MAP_STOPS } from '../lib/colors'

const OFM = 'https://tiles.openfreemap.org'
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const FONT = ['Noto Sans Regular']

export const LAND = '#121210'
export const WATER = '#0b1418'
export const ATTRIBUTION = {
  basemap:
    '© <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  dem: 'terrain <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen/AWS</a>',
  data: 'NASA FIRMS · geoBoundaries',
}

/** Sea area east of Vietnam's mainland coast (easternmost mainland point is about 109.46°E). */
const EAST_SEA: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[109.75, 3.5], [121.5, 3.5], [121.5, 18.1], [109.75, 18.1], [109.75, 3.5]]],
}
const OUTSIDE_EAST_SEA: ExpressionSpecification = ['!', ['within', EAST_SEA]]
/** City and town names are drawn only around Vietnam (keeps the map quiet; the East Sea is excluded anyway). */
const AROUND_VIETNAM: ExpressionSpecification = ['within', { type: 'Polygon', coordinates: [[[101.6, 8], [109.75, 8], [109.75, 23.45], [101.6, 23.45], [101.6, 8]]] }]
const LATIN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']]
/** The four cities named on the home map (OpenStreetMap names). */
const HERO_CITIES = ['Hà Nội', 'Đà Nẵng', 'Thành phố Hồ Chí Minh', 'Cần Thơ']
const SHORT_NAME: ExpressionSpecification = ['match', ['get', 'name'], 'Thành phố Hồ Chí Minh', 'TP. Hồ Chí Minh', LATIN_NAME]

const label = (id: string, filter: ExpressionSpecification, minzoom: number, size: number, color: string, extra: Record<string, unknown> = {}): LayerSpecification => ({
  id,
  type: 'symbol',
  source: 'basemap',
  'source-layer': 'place',
  minzoom,
  filter: ['all', filter, OUTSIDE_EAST_SEA],
  layout: { 'text-field': LATIN_NAME, 'text-font': FONT, 'text-size': size, 'text-max-width': 7, ...extra },
  paint: { 'text-color': color, 'text-halo-color': '#080807', 'text-halo-width': 1.2 },
})

/** Zoom window in which the heatmap hands over to the extruded 10 km squares. */
export const FADE = { from: 4.3, to: 5.0 }
/** Height of the tallest column, metres. */
export const HMAX_M = 90000
/** Squares below this many fire days in the month are not drawn (stated in the legends). */
export const DRAW_MIN = MAP_STOPS[0].v
/** Squares below this are drawn almost flat and faint, so the hot clusters stand out. */
export const FLAT_MAX = MAP_STOPS[1].v
/** Height of the faint, almost flat squares, metres. */
const FLAT_M = 900

const ramp = (stops: readonly string[]): (number | string)[] => stops.flatMap((c, i) => [i / (stops.length - 1), c])
const norm = (vmax: number): ExpressionSpecification => ['sqrt', ['/', ['min', ['get', 'v'], vmax], vmax]]

/** Columns (fire days >= FLAT_MAX): sqrt height; shorter as you zoom in so they never bury the province in view. */
export function heightExpr(vmax: number, k: number): ExpressionSpecification {
  const f = norm(vmax)
  return ['interpolate', ['linear'], ['zoom'], 5.6, ['*', f, HMAX_M * k], 7.4, ['*', f, 0.36 * HMAX_M * k], 9, ['*', f, 0.14 * HMAX_M * k]]
}
/** Faint squares (DRAW_MIN <= fire days < FLAT_MAX): a constant, almost flat height. */
export const flatHeightExpr = (k: number): ExpressionSpecification => ['literal', FLAT_M * k] as unknown as ExpressionSpecification
/** Colour by absolute fire days (MAP_STOPS), so 4 days looks the same in every month and year. */
export function colorExpr(_vmax?: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['get', 'v'], ...MAP_STOPS.slice(1).flatMap((s) => [s.v, s.c])] as unknown as ExpressionSpecification
}

/** Our own sources carry their data inline, so they draw even when the basemap cannot be reached. */
export function buildStyle(
  data: Record<'provinces' | 'provinceLabels' | 'islands' | 'cells' | 'cellPoints', GeoJSON.FeatureCollection>,
  variant: 'hero' | 'explore'
): StyleSpecification {
  const hero = variant === 'hero'
  const exploreLabels: LayerSpecification[] = [
    label('city-major', ['all', ['==', ['get', 'class'], 'city'], ['<=', ['get', 'rank'], 6], AROUND_VIETNAM], 4.4, 11, '#a9a8a0'),
    label('city', ['all', ['==', ['get', 'class'], 'city'], ['>', ['get', 'rank'], 6], AROUND_VIETNAM], 6.4, 11, '#a9a8a0'),
    label('town', ['all', ['==', ['get', 'class'], 'town'], AROUND_VIETNAM], 8, 10, '#75746d'),
    {
      id: 'prov-label',
      type: 'symbol',
      source: 'provinceLabels',
      minzoom: 6.1,
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-max-width': 6 },
      paint: { 'text-color': '#ecebe4', 'text-opacity': 0.75, 'text-halo-color': '#080807', 'text-halo-width': 1.2 },
    },
  ]
  const heroLabels: LayerSpecification[] = [label('city-hero', ['in', ['get', 'name'], ['literal', HERO_CITIES]], 3, 11, '#c9c8c0', { 'text-field': SHORT_NAME })]
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      basemap: { type: 'vector', url: `${OFM}/planet`, attribution: ATTRIBUTION.basemap },
      dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 11, attribution: ATTRIBUTION.dem },
      provinces: { type: 'geojson', data: data.provinces, attribution: ATTRIBUTION.data },
      provinceLabels: { type: 'geojson', data: data.provinceLabels },
      islands: { type: 'geojson', data: data.islands },
      cells: { type: 'geojson', data: data.cells },
      cellPoints: { type: 'geojson', data: data.cellPoints },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': LAND } },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 6, 0.6, 9, 0.45],
          'hillshade-shadow-color': 'rgba(0,0,0,0.95)',
          'hillshade-highlight-color': 'rgba(150,180,200,0.26)',
          'hillshade-accent-color': 'rgba(8,16,22,0.9)',
          'hillshade-illumination-direction': 315,
        },
      },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': WATER, 'fill-opacity': 1, 'fill-antialias': false } },
      {
        id: 'border',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]],
        paint: { 'line-color': 'rgba(236,235,228,0.16)', 'line-width': 0.7 },
      },
      // --- our own geometry
      { id: 'prov-fill', type: 'fill', source: 'provinces', paint: { 'fill-color': 'rgba(236,235,228,0.02)' } },
      {
        id: 'prov-line',
        type: 'line',
        source: 'provinces',
        paint: { 'line-color': 'rgba(236,235,228,0.16)', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 8, 0.9] },
      },
      {
        id: 'cells-flat',
        type: 'fill',
        source: 'cells',
        minzoom: FADE.from,
        paint: { 'fill-color': 'rgba(0,0,0,0)' },
      },
      {
        id: 'heat',
        type: 'heatmap',
        source: 'cellPoints',
        maxzoom: FADE.to + 0.2,
        filter: ['>=', ['get', 'v'], DRAW_MIN],
        paint: {
          'heatmap-weight': ['get', 'w'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 5, 1.1],
          'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 2, 1.6, 5, 11, 6, 20],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(122,29,18,0)', 0.12, 'rgba(122,29,18,0.4)', 0.35, MAP_STOPS[1].c, 0.7, MAP_STOPS[2].c, 1, MAP_STOPS[3].c],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0.95, FADE.to, 0],
        },
      },
      {
        id: 'cells-low',
        type: 'fill-extrusion',
        source: 'cells',
        minzoom: FADE.from,
        filter: ['all', ['>=', ['get', 'v'], DRAW_MIN], ['<', ['get', 'v'], FLAT_MAX]],
        paint: {
          'fill-extrusion-color': '#7a1d12',
          'fill-extrusion-height': 0,
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0, FADE.to, 0.35],
        },
      },
      {
        id: 'cells-3d',
        type: 'fill-extrusion',
        source: 'cells',
        minzoom: FADE.from,
        filter: ['>=', ['get', 'v'], FLAT_MAX],
        paint: {
          'fill-extrusion-color': MAP_STOPS[1].c,
          'fill-extrusion-height': 0,
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0, FADE.to, 0.97],
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'prov-hover',
        type: 'line',
        source: 'provinces',
        filter: ['==', ['get', 'name'], ''],
        paint: { 'line-color': 'rgba(236,235,228,0.6)', 'line-width': 1.2 },
      },
      {
        id: 'prov-selected',
        type: 'line',
        source: 'provinces',
        filter: ['==', ['get', 'name'], ''],
        paint: { 'line-color': '#ecebe4', 'line-width': 2 },
      },
      { id: 'islands', type: 'circle', source: 'islands', paint: { 'circle-radius': 1.8, 'circle-color': 'rgba(236,235,228,0.85)' } },
      // --- labels: the home map names four cities only; the explorer names cities around Vietnam
      ...(hero ? heroLabels : exploreLabels),
    ],
  }
}
