import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { loadFile, useData } from '../../shared/data/load'
import { IntroCtl, shouldPlayIntro, type IntroHandoff } from '../../shared/intro/gate'
import { WARN } from '../../shared/lib/colors'
import { fmtInt } from '../../shared/lib/format'
import { FireMap, MapLegend } from '../../shared/map/FireMap'
import { DRAW_MIN } from '../../shared/map/mapStyle'

type Props = { title: string; subtitle: string }

// flame shader + globe timeline: a separate chunk, fetched only when the intro plays
const Intro = lazy(() => import('../../shared/intro/Intro'))

/** decimal hours (13.3) -> "13:18" */
const hhmm = (h: number) => `${Math.floor(h)}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`

/**
 * Full-bleed hero: the national map flies in and the March columns rise. Text sits on the left
 * on desktop and above the map on phones.
 */
export function Hero({ title, subtitle }: Props) {
  const grid = useData('grid_cells.json')
  const march = useData('grid_march.json')
  const geo = useData('provinces.geojson')
  const trust = useData('trust.json')
  const [yi, setYi] = useState(-1)
  const hud = useRef<HTMLDivElement>(null)
  const [hudH, setHudH] = useState(58)
  const [playing, setPlaying] = useState(false)
  const [size, setSize] = useState(() => (typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 1440, h: 900 }))
  const wide = size.w >= 1024
  // first visit of the session: intro over the same map instance; the hero data keeps loading meanwhile
  const [ctl] = useState(() => (shouldPlayIntro() ? new IntroCtl() : null))
  const [introOn, setIntroOn] = useState(!!ctl)
  const fires = useMemo(() => (ctl ? loadFile('global_fires.json').catch(() => null) : null), [ctl])
  const onIntro = useCallback((h: IntroHandoff | null) => ctl?.give(h), [ctl])
  const endIntro = useCallback(() => setIntroOn(false), [])
  const skip = () => {
    ctl?.skip()
    setIntroOn(false)
  }
  const fade: React.CSSProperties = { opacity: introOn ? 0 : 1, transition: 'opacity 700ms ease-out' }

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  useEffect(() => {
    if (march.status === 'ready' && yi < 0) setYi(march.data.years.length - 1)
  }, [march, yi])
  useEffect(() => {
    if (!playing || march.status !== 'ready') return
    const n = march.data.years.length
    const id = window.setInterval(() => setYi((i) => (i + 1) % n), 1600)
    return () => window.clearInterval(id)
  }, [playing, march])

  const ready = grid.status === 'ready' && march.status === 'ready' && geo.status === 'ready' && yi >= 0
  // the map attribution sits just above the HUD, whatever its height at this width
  useEffect(() => {
    const el = hud.current
    if (!el) return
    const ro = new ResizeObserver(() => setHudH(Math.ceil(el.offsetHeight)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])
  const values = ready ? march.data.values[yi] : null
  const active = useMemo(() => (values ? values.reduce((s, v) => s + (v >= DRAW_MIN ? 1 : 0), 0) : 0), [values])
  const year = ready ? march.data.years[yi] : undefined
  const pass = trust.status === 'ready' && year ? trust.data.overpass.rows.find((r) => r.year === year)?.median_local_hour : undefined
  const calibEnd = trust.status === 'ready' ? trust.data.calibration_R.calib_end : Infinity
  // keep the country clear of the text: to its right on desktop, below it on phones
  const padding = useMemo(
    () =>
      wide
        ? { left: Math.round(Math.max(size.w * (size.w < 1280 ? 0.4 : 0.44), (size.w - 1280) / 2 + 520)), right: size.w < 1280 ? 20 : 30, top: 36, bottom: 76 }
        : { left: 12, right: 12, top: Math.round(size.h * 0.42), bottom: 96 },
    [wide, size]
  )

  // below 1280 px the archipelagos go to corner insets so the mainland can fill the frame
  const insets = size.w < 1280 ? { top: wide ? 24 : Math.round(size.h * 0.42), right: 12, bottom: hudH + 30, small: !wide } : null

  return (
    <section id="top" className="relative h-[calc(100svh-3.5rem)] min-h-[600px] overflow-hidden border-b border-line lg:min-h-[640px]" style={{ ['--hud-h' as string]: `${hudH}px` }}>
      {ready && (
        <FireMap grid={grid.data} geo={geo.data} values={values} vmax={grid.data.meta.max_monthly} variant="hero" padding={padding} insets={insets} onIntro={ctl ? onIntro : undefined} className="ff-hero absolute inset-0" />
      )}
      {/* legibility scrim behind the text only */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          ...fade,
          background: wide
            ? 'radial-gradient(120% 90% at 0% 50%, rgba(8,8,7,0.94) 0%, rgba(8,8,7,0.78) 32%, rgba(8,8,7,0) 58%)'
            : 'linear-gradient(180deg, #080807 0%, rgba(8,8,7,0.88) 36%, rgba(8,8,7,0) 58%)',
        }}
        aria-hidden
      />

      <div className="pointer-events-none relative mx-auto flex h-full max-w-[1280px] flex-col px-5 pt-8 md:px-10 lg:justify-center lg:pb-16 lg:pt-0" style={fade} aria-hidden={introOn || undefined}>
        <div className="pointer-events-auto max-w-[30rem]">
          <h1 className="text-[clamp(3.25rem,15vw,5.5rem)] font-semibold leading-[0.85] tracking-[-0.05em] text-bone lg:text-[clamp(4rem,7vw,6.5rem)]">{title}</h1>
          <p className="mt-5 max-w-[22ch] text-[clamp(1.25rem,2.2vw,1.75rem)] font-medium leading-tight tracking-[-0.015em] text-bone lg:mt-8">{subtitle}</p>
          <p className="mt-4 hidden max-w-[40ch] text-base leading-relaxed text-bone-dim sm:block">
            Two NASA sensors, one fire record for Vietnam. Every square on the map is 10 km wide; its height is the number of days it
            burned in March.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 lg:mt-8">
            <Link
              to="/explore"
              className="group inline-flex items-center gap-2 whitespace-nowrap bg-ember px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
            >
              Explore the map
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"><path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <Link to="/method" className="whitespace-nowrap px-2 py-3 text-sm text-bone-dim underline-offset-4 hover:text-bone hover:underline">
              How it works
            </Link>
          </div>
        </div>
      </div>

      {/* HUD + year control */}
      {ready && (
        <div ref={hud} className="absolute inset-x-0 bottom-0 border-t border-line/70 bg-ink/80" style={fade}>
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 md:px-10 xl:flex-nowrap">
            <p className="font-mono text-[11px] tabular-nums text-bone xl:shrink-0">
              March {year} · {fmtInt(active)} squares with fire
              {pass !== undefined && <span className="text-bone-dim"> · Aqua pass {hhmm(pass)} local</span>}
              <span className="hidden text-muted 2xl:inline"> · NASA FIRMS</span>
            </p>
            {year !== undefined && year > calibEnd && (
              <span className="whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px]" style={{ color: WARN, background: 'rgba(255,176,32,0.12)' }}>
                satellite drift after {calibEnd} · estimated
              </span>
            )}
            <div className="flex min-w-[200px] flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause' : 'Play years'}
                className="grid h-7 w-7 shrink-0 place-items-center border border-line text-bone transition-colors hover:border-bone-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember"
              >
                {playing ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M3 1.5v9l7-4.5z" fill="currentColor" /></svg>
                )}
              </button>
              <span className="font-mono text-[10px] tabular-nums text-muted">{march.data.years[0]}</span>
              <input
                type="range"
                min={0}
                max={march.data.years.length - 1}
                step={1}
                value={yi}
                onChange={(e) => {
                  setPlaying(false)
                  setYi(Number(e.target.value))
                }}
                aria-label="Year"
                aria-valuetext={String(year)}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-[#ecebe4] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ember"
              />
              <span className="font-mono text-[10px] tabular-nums text-muted">{march.data.years[march.data.years.length - 1]}</span>
            </div>
            <MapLegend vmax={grid.data.meta.max_monthly} className="hidden w-48 shrink-0 xl:block" />
          </div>
        </div>
      )}

      {introOn && ctl && fires && (
        <>
          <Suspense fallback={<div className="absolute inset-0 z-20 bg-[#080807]" />}>
            <Intro ctl={ctl} fires={fires} onDone={endIntro} />
          </Suspense>
          <button
            type="button"
            onClick={skip}
            className="absolute bottom-5 right-5 z-30 border border-line bg-ink/70 px-3 py-1.5 font-mono text-[11px] text-bone-dim transition-colors hover:border-bone-dim hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember md:right-10"
          >
            Skip intro
          </button>
        </>
      )}
    </section>
  )
}
