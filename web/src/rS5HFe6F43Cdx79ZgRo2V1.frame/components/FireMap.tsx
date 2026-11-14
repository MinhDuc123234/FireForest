import React, { useMemo } from 'react'
import { PARK_OUTLINE, SITE, type Detection } from '../../shared/data/fires'

type Props = {
  detections: Detection[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const W = 720
const H = 400
const PAD = 28

function project(lon: number, lat: number) {
  const { minLon, maxLon, minLat, maxLat } = SITE.bounds
  return {
    x: PAD + ((lon - minLon) / (maxLon - minLon)) * (W - PAD * 2),
    y: H - PAD - ((lat - minLat) / (maxLat - minLat)) * (H - PAD * 2),
  }
}

export function FireMap({ detections, selectedId, onSelect }: Props) {
  const outline = useMemo(() => PARK_OUTLINE.map(([lon, lat]) => project(lon, lat)).map(({ x, y }) => `${x},${y}`).join(' '), [])
  const selected = detections.find((d) => d.id === selectedId)

  return (
    <div className="relative">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Active fire detections</h2>
          <p className="mt-1 font-mono text-[11px] text-muted">Tràm Chim National Park · {detections.length} detections</p>
        </div>
        <span className="font-mono text-[10px] text-muted">{SITE.center.lat.toFixed(2)}°N / {SITE.center.lon.toFixed(2)}°E</span>
      </div>
      <div className="overflow-hidden border border-line bg-[#10120f]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Map of fire detections in Tràm Chim National Park">
          <defs>
            <pattern id="map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#252923" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#map-grid)" />
          <path d={`M${outline.replaceAll(' ', ' L')} Z`} fill="#26352b" fillOpacity=".72" stroke="#829478" strokeWidth="1.5" />
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#a8b39e" opacity=".65" fontSize="13" letterSpacing="2">TRÀM CHIM NATIONAL PARK</text>
          {detections.map((d) => {
            const { x, y } = project(d.lon, d.lat)
            const active = d.id === selectedId
            const color = d.sensor === 'MODIS' ? '#ff6a1f' : '#4ea8ff'
            return (
              <g key={d.id} role="button" tabIndex={0} aria-label={`${d.sensor} detection ${d.date}, ${d.zone}`} onClick={() => onSelect(d.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(d.id) }} className="cursor-pointer">
                {active && <circle cx={x} cy={y} r="9" fill={color} opacity=".22" />}
                {d.sensor === 'MODIS'
                  ? <circle cx={x} cy={y} r={active ? 4 : 2.6} fill={color} stroke={active ? '#fff4e8' : '#171714'} strokeWidth="1" />
                  : <rect x={x - (active ? 3.6 : 2.4)} y={y - (active ? 3.6 : 2.4)} width={active ? 7.2 : 4.8} height={active ? 7.2 : 4.8} fill={color} stroke={active ? '#e8f4ff' : '#171714'} strokeWidth=".8" transform={`rotate(45 ${x} ${y})`} />}
              </g>
            )
          })}
          <g transform={`translate(${W - 92},${H - 34})`} stroke="#c4c2b7" fill="none"><path d="M0 0h48M0 -4v8M48 -4v8" /><text x="24" y="-8" textAnchor="middle" fill="#c4c2b7" stroke="none" fontSize="10">5 km</text></g>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
        <span>Click a point to inspect · synthetic demo detections</span>
        {selected && <span className="text-bone-dim">Selected: {selected.sensor} · {selected.date} · {selected.zone}</span>}
      </div>
    </div>
  )
}
