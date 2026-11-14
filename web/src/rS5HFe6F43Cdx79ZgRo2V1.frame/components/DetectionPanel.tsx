import React from 'react'
import { SensorGlyph } from '../../shared/components/SensorChart'
import { MONTHS, type Detection } from '../../shared/data/fires'

type Props = {
  detection: Detection | null
  candidates: Detection[]
  onSelect: (id: string) => void
}

export function DetectionPanel({ detection, candidates, onSelect }: Props) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Detection details</h2>
        <span className="font-mono text-[10px] text-muted">{detection ? detection.id : 'NO SELECTION'}</span>
      </div>
      {detection ? (
        <>
          <div className="mt-5 flex items-center gap-2"><SensorGlyph sensor={detection.sensor} size={12} /><span className="text-lg font-semibold">{detection.sensor}</span><span className="text-sm text-bone-dim">· {detection.satellite}</span></div>
          <p className="mt-1 font-mono text-xs text-bone-dim">{detection.date} · {detection.time} UTC · {detection.daynight === 'D' ? 'Day' : 'Night'}</p>
          <dl className="mt-5 grid grid-cols-2 gap-px border border-line bg-line">
            <Metric label="FRP" value={`${detection.frp} MW`} />
            <Metric label="Brightness" value={`${detection.brightness} K`} />
            <Metric label="Confidence" value={`${detection.confidence} (${detection.confidenceRaw})`} />
            <Metric label="Zone" value={detection.zone} />
            <Metric label="Latitude" value={`${detection.lat.toFixed(4)}°`} />
            <Metric label="Longitude" value={`${detection.lon.toFixed(4)}°`} />
            <Metric label="Scan × track" value={`${detection.scan} × ${detection.track} km`} />
            <Metric label="Month" value={`${MONTHS[detection.month]} ${detection.year}`} />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">Fire radiative power estimates the rate of radiant energy released by the fire.</p>
        </>
      ) : (
        <div className="mt-5 border border-dashed border-line p-4"><p className="text-sm text-bone-dim">Select a point on the map to inspect its sensor reading.</p><p className="mt-2 font-mono text-[10px] text-muted">{candidates.length} detections in the current view</p></div>
      )}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="font-mono text-[10px] text-muted">RECENT DETECTIONS</h3>
        <div className="mt-2 divide-y divide-line">
          {[...candidates].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, 5).map((d) => (
            <button key={d.id} type="button" onClick={() => onSelect(d.id)} className={`flex w-full items-center gap-2 py-2 text-left transition-colors hover:text-bone ${d.id === detection?.id ? 'text-ember' : 'text-bone-dim'}`}>
              <SensorGlyph sensor={d.sensor} size={9} /><span className="min-w-0 flex-1 truncate font-mono text-[10px]">{d.date} · {d.time}</span><span className="font-mono text-[10px]">{d.frp} MW</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-ink-2 p-3"><dt className="font-mono text-[9px] uppercase tracking-wide text-muted">{label}</dt><dd className="mt-1 truncate text-xs text-bone">{value}</dd></div>
}
