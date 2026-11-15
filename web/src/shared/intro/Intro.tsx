import React, { useEffect, useRef, useState } from 'react'
import type { ProjectionSpecification } from 'maplibre-gl'

import type { GlobalFires } from '../data/load'
import { FIRE } from '../lib/colors'
import { createFlame, type Flame } from './flame'
import { markIntroSeen, type IntroCtl, type IntroHandoff } from './gate'

type Props = {
  ctl: IntroCtl
  /** global_fires.json, fetched by the hero in parallel; null if missing */
  fires: Promise<GlobalFires | null>
  onDone: () => void
}

// timeline, seconds from the first frame
const SHRINK_FROM = 1.05
const GLOBE_AT = 1.5
const FLY_AT = 3.5
const END_AT = 4.5
const GIVE_UP_AT = 5 // the hero map is still not ready: skip

const EASE_IN = (t: number) => t * t
const EASE_IN_OUT = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
// globe -> mercator as the camera comes down to the hero's zoom
const PROJECTION = { type: ['interpolate', ['linear'], ['zoom'], 3, 'vertical-perspective', 4.4, 'mercator'] } as unknown as ProjectionSpecification

/** "Nov 13, 00:17 – Nov 14, 23:24 UTC" from the file's own first and last acquisition times. */
function windowLabel(a: string, b: string) {
  const f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
  return `${f.format(new Date(a))} – ${f.format(new Date(b))} UTC`
}

/**
 * Home intro, about 4.5 s, once per session: a flame (own shader) shrinks to a point, the hero map shows
 * as a globe with the last FIRMS global day of fires, then flies to the hero camera and hands control back.
 */
export default function Intro({ ctl, fires, onDone }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'flame' | 'globe' | 'fly' | 'out'>('flame')
  const [label, setLabel] = useState<string | null>(null)
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
    const at = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, t0 + sec * 1000 - performance.now())))

    const removeFires = (map: IntroHandoff['map']) => {
      for (const id of ['gf-glow', 'gf-core']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource('gfires')) map.removeSource('gfires')
    }
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
      done.current()
    }
    ctl.abort = () => end(true)

    let flame: Flame | null = null
    try {
      flame = canvas.current ? createFlame(canvas.current) : null
    } catch {
      flame = null
    }
    if (!flame) {
      end(true)
      return
    }
    const onResize = () => flame?.resize()
    window.addEventListener('resize', onResize)
    const loop = (now: number) => {
      const t = (now - t0) / 1000
      flame!.draw(t, EASE_IN(clamp01((t - SHRINK_FROM) / (GLOBE_AT - SHRINK_FROM))))
      if (alive && t < GLOBE_AT + 0.6) raf = requestAnimationFrame(loop)
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
      // set the globe up while the flame still covers the map
      map.setMinZoom(0)
      map.setProjection(PROJECTION)
      if (gf) {
        map.addSource('gfires', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: gf.points.map(([lon, lat, frp]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { f: frp } })),
          },
        })
        const color = ['interpolate', ['linear'], ['get', 'f'], 0, FIRE[2], 20, FIRE[3], 100, FIRE[4]] as unknown as string
        map.addLayer({
          id: 'gf-glow',
          type: 'circle',
          source: 'gfires',
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 4, 7], 'circle-color': color, 'circle-opacity': 0.16, 'circle-blur': 1, 'circle-opacity-transition': { duration: 700, delay: 0 } },
        })
        map.addLayer({
          id: 'gf-core',
          type: 'circle',
          source: 'gfires',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'f']], 0, 0.8, 4, 1.4, 12, 2.6],
            'circle-color': color,
            'circle-opacity': 0.9,
            'circle-opacity-transition': { duration: 700, delay: 0 },
          },
        })
        setLabel(`NASA FIRMS · MODIS C6.1 · global · ${windowLabel(gf.meta.time_start_utc, gf.meta.time_end_utc)}`)
      }
      const el = map.getContainer()
      // a globe about 80% of the shorter side: world size / π = diameter
      const z = Math.log2((0.8 * Math.min(el.clientWidth, el.clientHeight) * Math.PI) / 512)
      map.jumpTo({ center: [30, 6], zoom: z, pitch: 0, bearing: 0 })

      at(GLOBE_AT, () => {
        setPhase('globe')
        const left = Math.max(400, t0 + FLY_AT * 1000 - performance.now())
        map.easeTo({ center: [92, 12], zoom: z + 0.15, duration: left, easing: (t) => t })
      })
      at(FLY_AT, () => {
        setPhase('fly')
        // basemap back on now, so its tiles for the hero area start loading during the flight
        for (const id of ['water', 'hillshade']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
        if (map.getLayer('gf-core')) {
          map.setPaintProperty('gf-core', 'circle-opacity', 0)
          map.setPaintProperty('gf-glow', 'circle-opacity', 0)
        }
        const left = Math.max(300, t0 + END_AT * 1000 - performance.now())
        map.flyTo({ ...hand.target, duration: left, easing: EASE_IN_OUT, curve: 1.2, essential: true })
      })
      at(END_AT, () => end(false))
    })

    return () => {
      window.removeEventListener('resize', onResize)
      if (alive) end(true)
      flame?.dispose()
      if (ctl.abort) ctl.abort = null
    }
  }, [ctl, fires])

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div className="absolute inset-0 bg-[#080807] transition-opacity duration-[450ms] ease-out" style={{ opacity: phase === 'flame' ? 1 : 0 }}>
        <canvas ref={canvas} className="block h-full w-full" />
      </div>
      {label && (
        <p
          className="absolute bottom-5 left-5 max-w-[calc(100%-9rem)] font-mono text-[11px] leading-snug text-bone-dim transition-opacity duration-500 md:left-10"
          style={{ opacity: phase === 'globe' ? 1 : 0 }}
        >
          {label}
        </p>
      )}
    </div>
  )
}
