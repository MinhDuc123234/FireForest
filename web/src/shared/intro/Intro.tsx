import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProjectionSpecification } from 'maplibre-gl'

import type { GlobalFires } from '../data/load'
import { FIRE } from '../lib/colors'
import { markIntroSeen, type IntroCtl, type IntroHandoff } from './gate'
import { T, createStage, type Stage, type Target } from './stage'

type Props = {
  ctl: IntroCtl
  /** global_fires.json, fetched by the hero in parallel; null if missing */
  fires: Promise<GlobalFires | null>
  onDone: () => void
}

const GIVE_UP_AT = 5 // the hero map is still not ready: skip
const GLOBE_CENTER: [number, number] = [70, 10]
const ROTATE_TO: [number, number] = [100, 14]
const EASE_IN_OUT = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
// globe -> mercator as the camera comes down to the hero's zoom
const PROJECTION = { type: ['interpolate', ['linear'], ['zoom'], 3, 'vertical-perspective', 4.4, 'mercator'] } as unknown as ProjectionSpecification

/* fire point style: the same ramp and sizes for maplibre's circles and for the embers that land on them */
const FRP_STOPS: [number, string][] = [[0, FIRE[2]], [20, FIRE[3]], [100, FIRE[4]]]
const RADIUS_STOPS: [number, number][] = [[0, 0.8], [4, 1.4], [12, 2.6]] // by sqrt(frp)
function interp(stops: [number, number][], v: number) {
  if (v <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [x0, y0] = stops[i - 1], [x1, y1] = stops[i]
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0)
  }
  return stops[stops.length - 1][1]
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function frpColor(f: number) {
  let i = 1
  while (i < FRP_STOPS.length - 1 && f > FRP_STOPS[i][0]) i++
  const [x0, c0] = FRP_STOPS[i - 1], [x1, c1] = FRP_STOPS[i]
  const k = Math.max(0, Math.min(1, (f - x0) / (x1 - x0)))
  const a = hex(c0), b = hex(c1)
  return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * k).toString(16).padStart(2, '0')).join('')
}
const expr = <E,>(e: unknown) => e as E

/** "Nov 13, 00:17 – Nov 14, 23:24 UTC" from the file's own first and last acquisition times. */
function windowLabel(a: string, b: string) {
  const f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
  return `${f.format(new Date(a))} – ${f.format(new Date(b))} UTC`
}

/**
 * Real fire points for the embers: on the visible side of the globe, the strongest detection per 3° box
 * (spreads them over the continents), strongest boxes first. Never more than `max`; never invented.
 */
function pickTargets(gf: GlobalFires, map: IntroHandoff['map'], canvas: HTMLCanvasElement, max: number): Target[] {
  const r = Math.PI / 180
  const [l0, p0] = GLOBE_CENTER
  const best = new Map<string, [number, number, number]>()
  for (const q of gf.points) {
    const [lon, lat, f] = q
    const cosd = Math.sin(p0 * r) * Math.sin(lat * r) + Math.cos(p0 * r) * Math.cos(lat * r) * Math.cos((lon - l0) * r)
    if (cosd < 0.3) continue // behind or near the limb
    const key = `${Math.floor(lon / 3)}:${Math.floor(lat / 3)}`
    const b = best.get(key)
    if (!b || f > b[2]) best.set(key, q)
  }
  const a = canvas.getBoundingClientRect(), m = map.getContainer().getBoundingClientRect()
  return [...best.values()]
    .sort((x, y) => y[2] - x[2])
    .slice(0, max)
    .map(([lon, lat, f]) => {
      const p = map.project([lon, lat])
      return { x: p.x + m.left - a.left, y: p.y + m.top - a.top, color: frpColor(f), size: 2 * interp(RADIUS_STOPS, Math.sqrt(f)) + 1 }
    })
}

/**
 * Home intro, 4.5 s, once per session. A flame (own shader, bloom, embers) burns out; its embers fly to
 * real FIRMS fire points on the hero map shown as a globe, which then flies to the hero camera and hands
 * control back.
 */
export default function Intro({ ctl, fires, onDone }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLParagraphElement>(null)
  const [phase, setPhase] = useState<'flame' | 'globe' | 'fly' | 'out'>('flame')
  const [label, setLabel] = useState<string | null>(null)
  const [labelOn, setLabelOn] = useState(false)
  const [canvasOn, setCanvasOn] = useState(true)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const t0 = performance.now()
    document.documentElement.dataset.introStart = String(t0) // timing hook for the screenshot script
    markIntroSeen()
    let alive = true
    let raf = 0
    let h: IntroHandoff | null = null
    const timers: number[] = []
    const now = () => (performance.now() - t0) / 1000
    const at = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, t0 + sec * 1000 - performance.now())))

    const removeFires = (map: IntroHandoff['map']) => {
      for (const id of ['gf-glow', 'gf-core']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource('gfires')) map.removeSource('gfires')
    }
    let stage: Stage | null = null
    const end = (immediate: boolean) => {
      if (!alive) return
      alive = false
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      if (h) {
        const map = h.map
        map.stop()
        h.finish(true)
        if (immediate) removeFires(map)
        else window.setTimeout(() => removeFires(map), 900)
      }
      ctl.end()
      setPhase('out')
      setCanvasOn(false)
      done.current()
    }
    ctl.abort = () => end(true)

    try {
      stage = canvas.current ? createStage(canvas.current) : null
    } catch {
      stage = null
    }
    if (!stage) {
      end(true)
      return
    }
    const onResize = () => stage?.resize()
    window.addEventListener('resize', onResize)
    const loop = () => {
      if (!alive || !stage) return
      if (stage.frame(now())) raf = requestAnimationFrame(loop)
      else setCanvasOn(false)
    }
    raf = requestAnimationFrame(loop)
    at(GIVE_UP_AT, () => !h && end(true))

    Promise.all([ctl.handoff, fires]).then(([hand, gf]) => {
      if (!alive) return
      if (!hand) {
        end(true)
        return
      }
      h = hand
      const { map } = hand
      // set the globe up while the dark backdrop still covers the map
      map.setMinZoom(0)
      map.setProjection(PROJECTION)
      const el = map.getContainer()
      // a globe about 78% of the shorter side: world size / π = diameter
      const z = Math.log2((0.78 * Math.min(el.clientWidth, el.clientHeight) * Math.PI) / 512)
      map.jumpTo({ center: GLOBE_CENTER, zoom: z, pitch: 0, bearing: 0 })
      if (gf) {
        map.addSource('gfires', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: gf.points.map(([lon, lat, frp]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { f: frp } })),
          },
        })
        const color = expr<string>(['interpolate', ['linear'], ['get', 'f'], ...FRP_STOPS.flat()])
        const fade = { duration: 350, delay: 0 }
        map.addLayer({
          id: 'gf-glow',
          type: 'circle',
          source: 'gfires',
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 4, 7], 'circle-color': color, 'circle-opacity': 0, 'circle-blur': 1, 'circle-opacity-transition': fade },
        })
        map.addLayer({
          id: 'gf-core',
          type: 'circle',
          source: 'gfires',
          paint: {
            'circle-radius': expr<number>(['interpolate', ['linear'], ['sqrt', ['get', 'f']], ...RADIUS_STOPS.flat()]),
            'circle-color': color,
            'circle-opacity': 0,
            'circle-opacity-transition': fade,
          },
        })
        setLabel(`NASA FIRMS · MODIS C6.1 · global · ${windowLabel(gf.meta.time_start_utc, gf.meta.time_end_utc)}`)
        // the embers can only land on points projected before they set off
        if (canvas.current && now() < T.landFrom - 0.05) stage!.setTargets(pickTargets(gf, map, canvas.current, stage!.count))
      }

      let water = false
      at(T.reveal - 0.05, () => {
        // sea and land from the first globe frame: water only if its tiles are already in, never half-drawn
        water = map.getLayer('water') ? map.isSourceLoaded('basemap') : false
        if (water) map.setLayoutProperty('water', 'visibility', 'visible')
      })
      at(T.reveal, () => setPhase('globe'))
      at(T.mapFires, () => {
        if (map.getLayer('gf-core')) {
          map.setPaintProperty('gf-core', 'circle-opacity', 0.9)
          map.setPaintProperty('gf-glow', 'circle-opacity', 0.16)
        }
        setLabelOn(true)
      })
      at(T.rotate, () => {
        const left = Math.max(300, t0 + T.fly * 1000 - performance.now())
        map.easeTo({ center: ROTATE_TO, zoom: z + 0.12, duration: left, easing: (t) => t })
      })
      at(T.fly, () => {
        setPhase('fly')
        setLabelOn(false)
        if (!water && map.getLayer('water')) map.setLayoutProperty('water', 'visibility', 'visible')
        if (map.getLayer('gf-core')) {
          map.setPaintProperty('gf-core', 'circle-opacity', 0)
          map.setPaintProperty('gf-glow', 'circle-opacity', 0)
        }
        const left = Math.max(300, t0 + T.end * 1000 - performance.now())
        map.flyTo({ ...hand.target, duration: left, easing: EASE_IN_OUT, curve: 1.2, essential: true })
      })
      at(T.end, () => end(false))
    })

    return () => {
      window.removeEventListener('resize', onResize)
      if (alive) end(true)
      stage?.dispose()
      if (ctl.abort) ctl.abort = null
    }
  }, [ctl, fires])

  // label bottom-left; if the attribution (bottom-right) is in the way, sit 24 px above it
  useLayoutEffect(() => {
    const lab = labelRef.current
    if (!lab || !labelOn) return
    const place = () => {
      lab.style.bottom = ''
      const box = lab.parentElement?.parentElement?.querySelector('.maplibregl-ctrl-attrib')?.getBoundingClientRect()
      if (!box) return
      const r = lab.getBoundingClientRect()
      const host = lab.parentElement!.getBoundingClientRect()
      if (r.right + 24 > box.left && r.bottom + 24 > box.top) lab.style.bottom = `${Math.ceil(host.bottom - box.top + 24)}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [labelOn, label])

  return (
    // no z-index here: the screen-blended canvas must blend with the map below, not inside its own group
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[#080807] transition-opacity duration-[400ms] ease-out" style={{ opacity: phase === 'flame' ? 1 : 0 }} />
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full" style={{ mixBlendMode: 'screen', display: canvasOn ? 'block' : 'none' }} />
      {label && (
        <p
          ref={labelRef}
          className="absolute bottom-3 left-5 max-w-[calc(100%-2.5rem)] font-mono text-[11px] leading-snug text-bone md:left-10"
          style={{ visibility: labelOn ? 'visible' : 'hidden' }}
          data-intro-label
        >
          {label}
        </p>
      )}
    </div>
  )
}
