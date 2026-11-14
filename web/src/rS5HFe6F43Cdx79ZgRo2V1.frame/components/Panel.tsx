import React, { useMemo, useState } from 'react'

import type { BandRow } from '../../shared/components/BandChart'
import { sourceChip, type GridCells, type National, type Provinces, type Trust } from '../../shared/data/load'
import { TRUST, WARN } from '../../shared/lib/colors'
import { MONTHS_LONG, fmtInt, fmtMonth, fmtNum, fmtPctSigned, fmtSigned } from '../../shared/lib/format'
import { entityLabel, fold, sameMonthMedian, type Entity } from '../entity'

type Props = {
  entity: Entity
  onEntity: (e: Entity) => void
  month: string
  rows: BandRow[]
  prov: Provinces
  nat: National
  trust: Trust
  grid: GridCells
}

const SIG = 0.05 // trends with p >= SIG are reported as "no significant trend"

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Panel({ entity, onEntity, month, rows, prov, nat, trust, grid }: Props) {
  const row = rows.find((r) => r.month === month)
  const lastFull = Math.max(...prov.meta.full_years)
  const med = sameMonthMedian(rows, month, lastFull)
  const p = entity.kind === 'province' ? prov.provinces.find((x) => x.name === entity.name) : undefined
  const regionTrend = entity.kind !== 'province' ? trust.trend.find((t) => t.region === (entity.kind === 'all' ? 'Vietnam' : entity.name) && t.series === 'harmonized') : undefined
  const trend = p ? p.trend : regionTrend ?? null
  const mi = prov.months.indexOf(month)
  const top = useMemo(
    () => (mi < 0 ? [] : [...prov.provinces].map((x) => ({ name: x.name, v: x.harmonized[mi] })).sort((a, b) => b.v - a.v).slice(0, 10)),
    [prov, mi]
  )
  const d = (v: number) => (v < 100 ? 1 : 0)

  const exportCsv = () => {
    const name = entityLabel(entity)
    const s = entity.kind === 'province' ? null : nat.regions[entity.kind === 'all' ? 'Vietnam' : entity.name]
    const header = s ? 'month,harmonized,harmonized_lo,harmonized_hi,aqua_observed,naive_splice,aqua_gap' : 'month,harmonized,harmonized_lo,harmonized_hi,aqua_gap'
    const body = rows.map((r) => {
      const base = [r.month, r.v, r.lo, r.hi]
      if (s) {
        const i = nat.months.indexOf(r.month)
        base.push(s.aqua_observed[i] ?? '', s.naive_splice[i] ?? '')
      }
      base.push(String(!!r.gap))
      return base.join(',')
    })
    const src = sourceChip(entity.kind === 'province' ? 'out/province_monthly_harmonized.csv' : 'out/monthly_series.csv')
    download(`fireforest-${fold(name).replace(/\s+/g, '-')}.csv`, [`# ${src} · ${name} · lo/hi = 95% band`, header, ...body].join('\n'))
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Picker entity={entity} onEntity={onEntity} prov={prov} nat={nat} />

      <section aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="truncate text-xl font-semibold tracking-tight">{entityLabel(entity)}</h2>
          {p && <span className="shrink-0 font-mono text-[11px] text-muted">{p.region} · rank {p.rank_total}/{prov.meta.n_provinces}</span>}
        </div>
        <p className="mt-3 font-mono text-[11px] text-muted">{fmtMonth(month)}</p>
        {row ? (
          <>
            <p className="mt-1 flex items-baseline gap-2 tabular-nums">
              <span className="text-4xl font-semibold tracking-tight" style={{ color: TRUST }}>{fmtNum(row.v, d(row.v))}</span>
              <span className="font-mono text-[11px] text-bone-dim">fire days · 95% {fmtNum(row.lo, d(row.lo))}–{fmtNum(row.hi, d(row.hi))}</span>
            </p>
            {med && (
              <p className="mt-2 text-sm text-bone-dim">
                vs {med.from}–{med.to} median for {MONTHS_LONG[Number(month.slice(5)) - 1]}:{' '}
                <span className="tabular-nums text-bone">{fmtNum(med.median, d(med.median))}</span>
                {med.median > 0 && <span className="tabular-nums text-bone"> ({fmtPctSigned((100 * (row.v - med.median)) / med.median, 0)})</span>}
              </p>
            )}
            {row.gap && <p className="mt-2 inline-block px-1.5 py-0.5 font-mono text-[10px]" style={{ color: WARN, background: 'rgba(255,176,32,0.12)' }}>Aqua gap month · VIIRS-filled</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">No value for this month.</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-px border border-line bg-line text-sm">
          <Fact k={`Total since ${fmtMonth(rows[0].month)}`} v={fmtInt(rows.reduce((s, r) => s + r.v, 0))} />
          {p ? <Fact k="Peak month" v={`${MONTHS_LONG[p.peak_month - 1]}`} /> : <Fact k="Provinces" v={fmtInt(prov.meta.n_provinces)} />}
          <Fact
            k={`Trend ${trend?.years.replace('-', '–') ?? ''}`}
            v={trend && trend.theil_sen_pct_per_year !== null ? (trend.p_value < SIG ? `${fmtSigned(trend.theil_sen_pct_per_year, 1)}%/yr` : 'no significant trend') : '—'}
            note={trend ? `p = ${fmtNum(trend.p_value, 3)}` : undefined}
          />
          {p ? (
            <Fact k="95% band width" v={p.band_rel_width_median !== null ? `${fmtNum(100 * p.band_rel_width_median, 0)}% of value` : '—'} note="median month" />
          ) : (
            <Fact k="10 km squares" v={fmtInt(grid.meta.n_cells)} />
          )}
        </dl>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted">
          {p
            ? 'Trend computed in web/scripts/export_data.py — same method as trend_check.csv (Theil–Sen on annual totals).'
            : 'Trend from trend_check.csv (Theil–Sen on annual totals, harmonized).'}
        </p>
      </section>

      <section>
        <h3 className="font-mono text-[11px] text-muted">Top 10 provinces · {fmtMonth(month)}</h3>
        <ol className="mt-2">
          {top.map((t, i) => {
            const on = entity.kind === 'province' && entity.name === t.name
            return (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => onEntity({ kind: 'province', name: t.name })}
                  className={`grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 py-1 text-left text-sm transition-colors hover:text-bone focus-visible:outline focus-visible:outline-1 focus-visible:outline-ember ${on ? 'text-bone' : 'text-bone-dim'}`}
                >
                  <span className="font-mono text-[10px] tabular-nums text-muted">{i + 1}</span>
                  <span className="truncate">{t.name}</span>
                  <span className="font-mono text-[11px] tabular-nums">{fmtNum(t.v, d(t.v))}</span>
                  <span className="col-span-3 h-px bg-line">
                    <span className="block h-full" style={{ width: `${top[0].v > 0 ? (t.v / top[0].v) * 100 : 0}%`, background: on ? '#ecebe4' : '#75746d' }} />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <button
        type="button"
        onClick={exportCsv}
        className="bg-ember px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
      >
        Download CSV · {entityLabel(entity)}
      </button>

      <details className="border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-mono text-[11px] text-bone-dim hover:text-bone">About this data</summary>
        <dl className="mt-3 space-y-2 text-xs leading-relaxed text-bone-dim">
          <About k="Sensors" v="NASA FIRMS active fires: MODIS C6.1 on Aqua (1 km) and VIIRS C2 on S-NPP (375 m), afternoon passes." />
          <About k="Unit" v="Fire days: a 10 × 10 km square counts once for each local day with at least one afternoon detection (fire-active cell-days on the Method page)." />
          <About k="Period" v={`${fmtMonth(nat.meta.first_month)} – ${fmtMonth(nat.meta.last_month)}; the grid and provinces start with VIIRS in ${fmtMonth(grid.meta.first_month)}.`} />
          <About k="Method" v="VIIRS detections are weighted by the chance Aqua MODIS would have seen them, then calibrated (harmonize_fire_v2.py)." />
          <About k="Uncertainty" v="95% bands for provinces, regions and Vietnam; the 10 km grid shows point estimates." />
          <About k="Basemap" v="© OpenFreeMap, © OpenMapTiles, data from OpenStreetMap. Province outlines: geoBoundaries." />
        </dl>
      </details>
    </div>
  )
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="min-w-0 bg-ink p-3">
      <dt className="truncate font-mono text-[10px] text-muted">{k}</dt>
      <dd className="mt-1 text-sm tabular-nums text-bone">{v}</dd>
      {note && <dd className="font-mono text-[10px] tabular-nums text-muted">{note}</dd>}
    </div>
  )
}

function About({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2">
      <dt className="font-mono text-[10px] text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

/** Vietnam / region / province chooser; the search ignores diacritics. */
function Picker({ entity, onEntity, prov, nat }: { entity: Entity; onEntity: (e: Entity) => void; prov: Provinces; nat: National }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const options = useMemo(() => {
    const regions = nat.meta.regions.filter((r) => r !== 'Vietnam')
    return [
      { label: 'Vietnam', hint: 'country', e: { kind: 'all' } as Entity },
      ...regions.map((r) => ({ label: r, hint: 'region', e: { kind: 'region', name: r } as Entity })),
      ...prov.provinces.map((p) => ({ label: p.name, hint: p.region ?? '', e: { kind: 'province', name: p.name } as Entity })),
    ].map((o) => ({ ...o, key: fold(o.label) }))
  }, [prov, nat])
  const fq = fold(q)
  const shown = fq ? options.filter((o) => o.key.includes(fq)) : options
  const choose = (e: Entity) => {
    onEntity(e)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="relative">
      <label className="relative z-20 block">
        <span className="mb-1.5 block font-mono text-[11px] text-muted">Place · Vietnam, {nat.meta.regions.length - 1} regions, {prov.meta.n_provinces} provinces</span>
        <input
          type="search"
          value={q}
          placeholder={`${entityLabel(entity)} — type to search`}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) choose(shown[0].e)
            if (e.key === 'Escape') setOpen(false)
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="ff-places"
          aria-autocomplete="list"
          className="w-full border border-line bg-ink-2 px-3 py-2 text-sm text-bone placeholder:text-bone-dim focus:border-bone-dim focus:outline-none"
        />
      </label>
      {open && (
        <ul id="ff-places" role="listbox" className="absolute inset-x-0 top-full z-20 max-h-64 overflow-y-auto border border-t-0 border-line bg-ink-2">
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">No place matches.</li>}
          {shown.map((o) => (
            <li key={o.hint + o.label} role="option" aria-selected={entityLabel(entity) === o.label}>
              <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => choose(o.e)} className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm text-bone-dim hover:bg-ink-3 hover:text-bone focus-visible:bg-ink-3 focus-visible:outline-none">
                <span className="truncate">{o.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{o.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />}
    </div>
  )
}
