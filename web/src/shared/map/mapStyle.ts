/**
 * Hand-written dark MapLibre style on OpenFreeMap vector tiles (OpenMapTiles schema, no API key).
 * Attribution (required): OpenFreeMap © OpenMapTiles, data from OpenStreetMap (ODbL).
 *
 * What is deliberately NOT drawn from the basemap:
 *  - no `water_name` layer at all (no sea / gulf names);
 *  - no maritime or disputed boundary lines, no sub-national boundaries (provinces come from our
 *    own provinces.geojson);
 *  - no place label of any kind inside EAST_SEA. Hoàng Sa and Trường Sa are labelled only by
 *    this app, from provinces.geojson.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

import { INFERNO } from '../lib/colors'

const OFM = 'https://tiles.openfreemap.org'
const FONT = ['Noto Sans Regular']

export const LAND = '#121210'
export const WATER = '#0b1418'

/** Sea area east of Vietnam's mainland coast (easternmost mainland point is about 109.46°E). */
const EAST_SEA: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[109.75, 3.5], [121.5, 3.5], [121.5, 18.1], [109.75, 18.1], [109.75, 3.5]]],
}
const OUTSIDE_EAST_SEA: ExpressionSpecification = ['!', ['within', EAST_SEA]]
/** City and town names are drawn only around Vietnam (keeps the map quiet; the East Sea is excluded anyway). */
const AROUND_VIETNAM: ExpressionSpecification = ['within', { type: 'Polygon', coordinates: [[[101.6, 8], [109.75, 8], [109.75, 23.45], [101.6, 23.45], [101.6, 8]]] }]
const LATIN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']]

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

const ramp = (stops: readonly string[]): (number | string)[] => stops.flatMap((c, i) => [i / (stops.length - 1), c])

/** Columns get shorter as you zoom in, so they never bury the province you are looking at. */
export function heightExpr(vmax: number, k: number): ExpressionSpecification {
  const f: ExpressionSpecification = ['sqrt', ['/', ['min', ['get', 'v'], vmax], vmax]]
  return ['interpolate', ['linear'], ['zoom'], 5, ['*', f, HMAX_M * k], 7, ['*', f, 0.36 * HMAX_M * k], 9, ['*', f, 0.14 * HMAX_M * k]]
}
export function colorExpr(vmax: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['+', 0.12, ['*', 0.88, ['sqrt', ['/', ['min', ['get', 'v'], vmax], vmax]]]], ...ramp(INFERNO)] as unknown as ExpressionSpecification
}

/** Our own sources carry their data inline, so they draw even when the basemap cannot be reached. */
export function buildStyle(data: Record<'provinces' | 'provinceLabels' | 'islands' | 'cells' | 'cellPoints', GeoJSON.FeatureCollection>): StyleSpecification {
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      basemap: { type: 'vector', url: `${OFM}/planet` },
      provinces: { type: 'geojson', data: data.provinces },
      provinceLabels: { type: 'geojson', data: data.provinceLabels },
      islands: { type: 'geojson', data: data.islands },
      cells: { type: 'geojson', data: data.cells },
      cellPoints: { type: 'geojson', data: data.cellPoints },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': LAND } },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': WATER } },
      {
        id: 'border',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]],
        paint: { 'line-color': 'rgba(236,235,228,0.22)', 'line-width': 0.8 },
      },
      // --- our own geometry
      { id: 'prov-fill', type: 'fill', source: 'provinces', paint: { 'fill-color': 'rgba(236,235,228,0.035)' } },
      {
        id: 'prov-line',
        type: 'line',
        source: 'provinces',
        paint: { 'line-color': 'rgba(236,235,228,0.2)', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 1] },
      },
      {
        id: 'cells-flat',
        type: 'fill',
        source: 'cells',
        minzoom: FADE.from,
        paint: { 'fill-color': 'rgba(236,235,228,0.05)', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0, FADE.to, 1] },
      },
      {
        id: 'heat',
        type: 'heatmap',
        source: 'cellPoints',
        maxzoom: FADE.to + 0.2,
        filter: ['>', ['get', 'v'], 0],
        paint: {
          'heatmap-weight': ['get', 'w'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 5, 1.1],
          'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 2, 1.6, 5, 11, 6, 20],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(27,12,46,0)', 0.08, INFERNO[0], 0.3, INFERNO[1], 0.55, INFERNO[2], 0.8, INFERNO[3], 1, INFERNO[4]],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0.95, FADE.to, 0],
        },
      },
      {
        id: 'cells-3d',
        type: 'fill-extrusion',
        source: 'cells',
        minzoom: FADE.from,
        filter: ['>', ['get', 'v'], 0],
        paint: {
          'fill-extrusion-color': INFERNO[2],
          'fill-extrusion-height': 0,
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], FADE.from, 0, FADE.to, 0.94],
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'prov-selected',
        type: 'line',
        source: 'provinces',
        filter: ['==', ['get', 'name'], ''],
        paint: { 'line-color': '#ecebe4', 'line-width': 2 },
      },
      { id: 'islands', type: 'circle', source: 'islands', paint: { 'circle-radius': 1.8, 'circle-color': 'rgba(236,235,228,0.85)' } },
      // --- labels
      label('country', ['==', ['get', 'class'], 'country'], 2, 10, '#75746d', { 'text-transform': 'uppercase', 'text-letter-spacing': 0.15, 'text-field': ['coalesce', ['get', 'name_en'], LATIN_NAME] }),
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
    ],
  }
}
