import React, { useEffect, useRef, useState } from 'react'

import { MONTHS } from '../data/fires'
import { fitRatio, type MonthPoint } from '../lib/harmonize'

export type ChartMode = 'raw' | 'harmonized' | 'compare'

type Props = {
  series: MonthPoint[]
  mode: ChartMode
  height?: number
  /** Highlight one month in the series, by its key "YYYY-M". */
  highlightKey?: string | null
}

export function SensorChart({ series, mode, height = 220, highlightKey }: Props) {
  const fit = fitRatio(series)
  const modis = series.map((p) => p.modis)
  const viirsRaw = series.map((p) => p.viirs)

  if (mode === 'compare') {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Raw counts" note="VIIRS 375 m vs MODIS 1 km">
          <LineChart series={series} lines={[line('MODIS', modis), line('VIIRS', viirsRaw)]} height={height} highlightKey={highlightKey} />
        </Panel>
        <Panel title="Harmonized" note={`VIIRS ÷ ${fit.k.toFixed(2)} → MODIS-equivalent`}>
          <LineChart series={series} lines={[line('MODIS', modis), line('VIIRS', fit.harmonized)]} height={height} highlightKey={highlightKey} />
        </Panel>
      </div>
    )
  }
  return (
    <LineChart
      series={series}
      lines={[line('MODIS', modis), line('VIIRS', mode === 'raw' ? viirsRaw : fit.harmonized)]}
      height={height}
      highlightKey={highlightKey}
    />
  )
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h4 className="text-sm font-medium text-bone">{title}</h4>
        <span className="font-mono text-[11px] text-muted">{note}</span>
      </div>
      {children}
    </div>
  )
}

type Line = { sensor: 'MODIS' | 'VIIRS'; values: number[] }
const line = (sensor: Line['sensor'], values: number[]): Line => ({ sensor, values })

function LineChart({
  series,
  lines,
  height,
  highlightKey,
}: {
  series: MonthPoint[]
  lines: Line[]
  height: number
  highlightKey?: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { l: 34, r: 8, t: 10, b: 24 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const max = Math.max(1, ...lines.flatMap((l) => l.values))
  const niceMax = Math.ceil(max / 5) * 5
  const n = Math.max(series.length - 1, 1)
  const x = (i: number) => pad.l + (i / n) * w
  const y = (v: number) => pad.t + h - (v / niceMax) * h
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t))
  const markEvery = series.length > 36 ? 1 : 1

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} className="block" role="img" aria-label="Monthly detections by sensor">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} stroke="#2a2a26" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" className="fill-muted font-mono text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {series.map((p, i) =>
          p.month === 0 || i === 0 ? (
            <text key={p.key} x={x(i)} y={height - 6} textAnchor="start" className="fill-muted font-mono text-[10px]">
              {series.length <= 12 ? MONTHS[p.month] : p.year}
            </text>
          ) : series.length <= 12 ? (
            <text key={p.key} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted font-mono text-[10px]">
              {MONTHS[p.month][0]}
            </text>
          ) : null
        )}
        {highlightKey &&
          series.map((p, i) =>
            p.key === highlightKey ? (
              <rect key="hl" x={x(i) - Math.max(3, w / n / 2)} y={pad.t} width={Math.max(6, w / n)} height={h} fill="#ff6a1f" opacity={0.14} />
            ) : null
          )}
        {lines.map((l) => {
          const color = l.sensor === 'MODIS' ? '#ff6a1f' : '#4ea8ff'
          const d = l.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
          return (
            <g key={l.sensor}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" opacity={0.9} />
              {l.values.map((v, i) =>
                i % markEvery === 0 ? (
                  l.sensor === 'MODIS' ? (
                    <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="#080807" stroke={color} strokeWidth={1.4} />
                  ) : (
                    <rect
                      key={i}
                      x={x(i) - 2.4}
                      y={y(v) - 2.4}
                      width={4.8}
                      height={4.8}
                      fill="#080807"
                      stroke={color}
                      strokeWidth={1.4}
                      transform={`rotate(45 ${x(i)} ${y(v)})`}
                    />
                  )
                ) : null
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Legend glyphs: orange circle for MODIS, blue diamond for VIIRS. */
export function SensorGlyph({ sensor, size = 10 }: { sensor: 'MODIS' | 'VIIRS'; size?: number }) {
  return sensor === 'MODIS' ? (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <circle cx={5} cy={5} r={3.8} fill="#ff6a1f" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <rect x={2.2} y={2.2} width={5.6} height={5.6} fill="#4ea8ff" transform="rotate(45 5 5)" />
    </svg>
  )
}
