import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useData } from '../../shared/data/load'
import { inferno } from '../../shared/lib/colors'
import { fmtInt } from '../../shared/lib/format'
import { FireMap } from '../../shared/map/FireMap'

type Props = { title: string; subtitle: string }

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
  const [playing, setPlaying] = useState(false)
  const [size, setSize] = useState(() => (typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 1440, h: 900 }))
  const wide = size.w >= 1024

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
  const values = ready ? march.data.values[yi] : null
  const active = useMemo(() => (values ? values.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) : 0), [values])
  const year = ready ? march.data.years[yi] : undefined
  const pass = trust.status === 'ready' && year ? trust.data.overpass.rows.find((r) => r.year === year)?.median_local_hour : undefined
  // keep the country clear of the text: to its right on desktop, below it on phones
  const padding = useMemo(
    () => (wide ? { left: Math.round(size.w * 0.4), right: 24, top: 40, bottom: 96 } : { left: 12, right: 12, top: Math.round(size.h * 0.4), bottom: 110 }),
    [wide, size]
  )

  return (
    <section id="top" className="relative h-[calc(100svh-3.5rem)] min-h-[600px] overflow-hidden border-b border-line lg:min-h-[640px]">
      {ready && (
        <FireMap grid={grid.data} geo={geo.data} values={values} vmax={grid.data.meta.max_monthly} variant="hero" padding={padding} className="absolute inset-0" />
      )}
      {/* legibility scrim behind the text only */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: wide ? 'linear-gradient(90deg, #080807 0%, rgba(8,8,7,0.82) 30%, rgba(8,8,7,0) 56%)' : 'linear-gradient(180deg, #080807 0%, rgba(8,8,7,0.85) 34%, rgba(8,8,7,0) 56%)' }}
        aria-hidden
      />

      <div className="pointer-events-none relative mx-auto flex h-full max-w-[1280px] flex-col px-5 pt-8 md:px-10 lg:justify-center lg:pb-16 lg:pt-0">
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
        <div className="absolute inset-x-0 bottom-0 border-t border-line/70 bg-ink/80">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 md:px-10">
            <p className="font-mono text-[11px] tabular-nums text-bone">
              March {year} · {fmtInt(active)} squares with fire
              {pass !== undefined && <span className="text-bone-dim"> · Aqua pass {hhmm(pass)} local</span>}
              <span className="hidden text-muted xl:inline"> · point estimate · NASA FIRMS</span>
            </p>
            <div className="flex min-w-[220px] flex-1 items-center gap-3">
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
            <div className="hidden w-40 shrink-0 font-mono text-[10px] text-muted lg:block">
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => inferno(0.12 + (0.88 * i) / 8)).join(',')})` }} />
              <div className="mt-1 flex justify-between"><span>fewer fire days</span><span>more</span></div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
