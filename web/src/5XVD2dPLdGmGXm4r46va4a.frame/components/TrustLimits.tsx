import React from 'react'

import { SourceChip } from '../../shared/components/SourceChip'
import { dataUrl, useData, type Checks, type Trust, type ValidationMethod } from '../../shared/data/load'
import { AQUA, NAIVE, TRUST, WARN } from '../../shared/lib/colors'
import { MONTHS, fmtNum, fmtPctSigned } from '../../shared/lib/format'

const OURS: ValidationMethod = 'physics + calibration'
const METHODS: ValidationMethod[] = ['raw VIIRS', 'constant ratio', 'physics + calibration']
/** Aqua's nominal 13:30 local equator crossing (NASA Aqua mission); later medians are flagged as drift. */
const NOMINAL_PASS_H = 13.5
const REPO = 'https://github.com/MinhDuc123234/FireForest'

const hhmm = (h: number) => `${Math.floor(h)}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`

export function TrustLimits() {
  const trust = useData('trust.json')
  const checks = useData('checks.json')
  if (trust.status === 'error' || checks.status === 'error') return null
  if (trust.status !== 'ready' || checks.status !== 'ready') return <section id="trust" className="min-h-[900px]" />
  const t = trust.data

  return (
    <section id="trust" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[11px] text-muted">Trust &amp; limits</p>
        <Validation t={t} />
        <div className="mt-20 grid gap-16 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <RTable t={t} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Overpass t={t} />
          </div>
        </div>
        <div className="mt-20 grid gap-16 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <Terminal c={checks.data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Limits t={t} />
          </div>
        </div>
        <div className="mt-20 grid gap-16 border-t border-line pt-12 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <Reproduce c={checks.data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Sources />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ validation */
function Validation({ t }: { t: Trust }) {
  const rows = t.validation.rows
  const regions = [...new Set(rows.map((r) => r.region))]
  const macro = regions.filter((r) => r !== 'Vietnam')
  const get = (reg: string, m: ValidationMethod) => rows.find((r) => r.region === reg && r.method === m)!
  const bestBy = (reg: string, f: (r: (typeof rows)[number]) => number) =>
    METHODS.reduce((a, b) => (f(get(reg, b)) < f(get(reg, a)) ? b : a))
  // claims are counted from the table, not written by hand
  const winsW = macro.filter((r) => bestBy(r, (x) => x.wMAPE_pct) === OURS).length
  const winsB = macro.filter((r) => bestBy(r, (x) => Math.abs(x.bias_pct)) === OURS).length
  const natBest = bestBy('Vietnam', (x) => Math.abs(x.bias_pct))
  const natOurs = get('Vietnam', OURS)
  const natBestRow = get('Vietnam', natBest)
  const natW = bestBy('Vietnam', (x) => x.wMAPE_pct) === OURS
  const signs = new Set(macro.map((r) => Math.sign(get(r, natBest).bias_pct)))
  const cancels = signs.has(1) && signs.has(-1)

  return (
    <div>
      <h2 className="max-w-[22ch] text-[clamp(2.25rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
        Tested on years the fit never saw
      </h2>
      <p className="mt-6 max-w-[64ch] text-base leading-relaxed text-bone-dim">
        Fitted on months up to {t.validation.train_end} and compared with Aqua observations from{' '}
        {t.validation.train_end + 1}. Physics + calibration has the lowest error (wMAPE) in {winsW} of {macro.length} regions
        {natW ? ' and nationally' : ''}, and the smallest bias in {winsB} of {macro.length} regions.{' '}
        {natBest !== OURS && (
          <>
            Nationally, the {natBest} baseline has the smaller bias ({fmtPctSigned(natBestRow.bias_pct, 1)} against{' '}
            {fmtPctSigned(natOurs.bias_pct, 1)}){cancels ? ': its regional biases have opposite signs and cancel in the national sum.' : '.'}
          </>
        )}
      </p>

      <div className="mt-10">
        <table className="w-full border-collapse text-left text-xs tabular-nums sm:text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] text-muted">
              <th className="py-2 pr-2 font-normal sm:pr-4">Region · method</th>
              <th className="py-2 pr-4 text-right font-normal">bias %</th>
              <th className="py-2 pr-4 text-right font-normal">wMAPE %</th>
              <th className="py-2 text-right font-normal">r (log)</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((reg) => {
              const bB = bestBy(reg, (x) => Math.abs(x.bias_pct))
              const bW = bestBy(reg, (x) => x.wMAPE_pct)
              const bR = bestBy(reg, (x) => -x.r_log)
              return [
                <tr key={reg}>
                  <th colSpan={4} className={`pb-1 pt-4 text-left text-sm ${reg === 'Vietnam' ? 'font-semibold' : 'font-medium'} text-bone`}>{reg}</th>
                </tr>,
                ...METHODS.map((m, i) => {
                const r = get(reg, m)
                const ours = m === OURS
                return (
                  <tr key={reg + m} className={`${i === METHODS.length - 1 ? 'border-b border-line' : ''} ${ours ? 'text-bone' : 'text-bone-dim'}`}>
                    <td className="py-1.5 pr-2 sm:pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-[3px]" style={{ background: ours ? TRUST : 'transparent' }} />
                        <span style={{ color: m === 'raw VIIRS' ? NAIVE : undefined }}>{m}</span>
                      </span>
                    </td>
                    <Cell v={fmtPctSigned(r.bias_pct, 1)} best={bB === m} />
                    <Cell v={fmtNum(r.wMAPE_pct, 1)} best={bW === m} />
                    <Cell v={fmtNum(r.r_log, 3)} best={bR === m} last />
                  </tr>
                )
              }),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[10px] text-muted">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: AQUA }} />best in region (smallest |bias|, smallest
        wMAPE, largest r) · <span style={{ color: TRUST }}>▍</span>our method
      </p>
      <SourceChip csv="validation_metrics.csv" unit="monthly fire-active 10 km cell-days" extra={`fit ≤ ${t.validation.train_end}, test ${t.validation.train_end + 1}+`} className="mt-1" />
    </div>
  )
}

function Cell({ v, best, last }: { v: string; best: boolean; last?: boolean }) {
  return (
    <td className={`whitespace-nowrap py-1.5 text-right ${last ? '' : 'pr-2 sm:pr-4'}`}>
      {best && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: AQUA }} aria-label="best" />}
      <span className={best ? 'text-bone' : ''}>{v}</span>
    </td>
  )
}

/* ------------------------------------------------------------ R table */
function RTable({ t }: { t: Trust }) {
  const { regions, R, calib_end } = t.calibration_R
  const all = regions.flatMap((r) => R[r])
  const dev = Math.max(...all.map((v) => Math.abs(Math.log(v))))
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Residual bias of the physics, by month</h3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        R = Aqua observed ÷ predicted. R = 1 means the physics was exact; below 1, the operator predicts more detections than Aqua
        made. Fitted on months up to {calib_end} (gap months excluded), shrunk towards the national ratio.
      </p>
      <div className="mt-6 grid grid-cols-[5.25rem_repeat(12,minmax(0,1fr))] gap-[2px] font-mono text-[10px] tabular-nums sm:grid-cols-[6.5rem_repeat(12,minmax(0,1fr))]">
        <span />
        {MONTHS.map((m) => (
          <span key={m} className="pb-1 text-center text-muted">{m[0]}</span>
        ))}
        {regions.map((reg) => (
          <React.Fragment key={reg}>
            <span className="flex items-center truncate pr-2 text-bone-dim">{reg}</span>
            {R[reg].map((v, i) => {
              const k = Math.abs(Math.log(v)) / dev
              return (
                <span
                  key={i}
                  title={`${reg}, ${MONTHS[i]}: R = ${fmtNum(v, 3)}`}
                  className="flex aspect-square items-center justify-center text-[9px] sm:text-[10px]"
                  style={{ background: `rgba(236,235,228,${0.04 + 0.5 * k})`, color: k > 0.55 ? '#080807' : '#a9a8a0' }}
                >
                  <span className="hidden sm:inline">{fmtNum(v, 2).replace(/^0/, '')}</span>
                </span>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted">shade = distance from R = 1 (log scale)</p>
      <SourceChip csv="calibration_bias_table.csv" unit="ratio" className="mt-1" />
    </div>
  )
}

/* ------------------------------------------------------------ overpass drift */
function Overpass({ t }: { t: Trust }) {
  const rows = t.overpass.rows.slice(-7)
  const calibEnd = t.calibration_R.calib_end
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Aqua is drifting later</h3>
      <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-bone-dim">
        Median local time of Aqua afternoon detections. After {calibEnd} the pass slides away from its nominal{' '}
        {hhmm(NOMINAL_PASS_H)}, so the satellite no longer samples the same part of the daily fire cycle. Calibration stops at{' '}
        {calibEnd}.
      </p>
      <ol className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4 xl:grid-cols-7">
        {rows.map((r) => {
          const late = r.median_local_hour > NOMINAL_PASS_H
          return (
            <li key={r.year} className="border px-2 py-2 font-mono tabular-nums" style={{ borderColor: late ? WARN : '#2a2a26' }}>
              <div className="text-[10px] text-muted">{r.year}</div>
              <div className="mt-0.5 text-sm" style={{ color: late ? WARN : '#ecebe4' }}>{hhmm(r.median_local_hour)}</div>
            </li>
          )
        })}
      </ol>
      <SourceChip csv="aqua_overpass_by_year.csv" unit="local time (UTC+7)" className="mt-3" />
    </div>
  )
}

/* ------------------------------------------------------------ check_outputs.py terminal */
function Terminal({ c }: { c: Checks }) {
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Automatic checks on every export</h3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        The output of <code className="font-mono text-bone">harmonize/check_outputs.py</code>, captured when the site data were
        built. Failures would be shown here verbatim.
      </p>
      <div className="mt-6 overflow-x-auto border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.7]">
        <div className="text-muted">$ {c.meta.command}</div>
        {c.items.map((it, i) => (
          <div key={i} className="whitespace-pre">
            {it.status === 'PASS' && <span style={{ color: TRUST }}>✓ PASS </span>}
            {it.status === 'FAIL' && <span style={{ color: WARN }}>✗ FAIL </span>}
            {it.status === 'INFO' && <span className="text-muted">  INFO </span>}
            {it.status === 'OTHER' && <span className="text-muted">       </span>}
            <span className={it.status === 'INFO' ? 'text-bone-dim' : 'text-bone'}>{it.name}</span>
            {it.detail && <span className="text-muted">  [{it.detail}]</span>}
            {it.extra.map((x, j) => (
              <div key={j} className="text-muted">       {x}</div>
            ))}
          </div>
        ))}
        <div className="mt-2" style={{ color: c.all_passed ? TRUST : WARN }}>
          {c.summary ?? 'no summary line'} · {c.n_pass}/{c.n_checks}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ limits */
function Limits({ t }: { t: Trust }) {
  const items = [
    'Hotspot ≠ burned area; some detections are crop-residue burning.',
    'FIRMS has no cloud mask; clouds are absorbed only on average by R.',
    'Detection-limit anchors are approximations from Sofiev & Kouznetsov (2026).',
    'Province bands reflect method uncertainty, not local sampling noise.',
    `Aqua gap months ${t.aqua_gap.months.join(' and ')} are VIIRS-filled.`,
    `Aqua's pass drifts after ${t.calibration_R.calib_end}; later years use the calibration fitted up to then.`,
  ]
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Limits</h3>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {items.map((s) => (
          <li key={s} className="grid grid-cols-[1.25rem_minmax(0,1fr)] py-3 text-sm leading-relaxed text-bone-dim">
            <span className="text-muted">–</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------ reproduce + sources */
const FILES = ['national.json', 'provinces.json', 'seasonal.json', 'trust.json', 'kpi.json', 'method.json', 'checks.json', 'grid_cells.json', 'grid_march.json', 'provinces.geojson']

function Reproduce({ c }: { c: Checks }) {
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Data &amp; reproducibility</h3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        Every number on this page is read from these static files, exported from the pipeline outputs. The 10 km grid is split by
        year (grid/2012.json … ). Each chart's CSV download carries its source line.
      </p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {FILES.map((f) => (
          <li key={f}>
            <a href={dataUrl(f)} download className="inline-block border border-line px-2.5 py-1.5 font-mono text-[11px] text-bone-dim transition-colors hover:border-bone-dim hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember">
              {f}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-6 overflow-x-auto border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.7] text-bone-dim">
        <div className="text-muted"># rebuild the site data from the pipeline outputs (read-only on out/)</div>
        <div className="whitespace-pre">$ python web/scripts/export_data.py --out out --web web/public/data</div>
        <div className="text-muted"># the checks above</div>
        <div className="whitespace-pre">$ {c.meta.command}</div>
        <div className="text-muted"># the site</div>
        <div className="whitespace-pre">$ cd web &amp;&amp; npm install &amp;&amp; npm run build</div>
      </div>
    </div>
  )
}

function Sources() {
  const src: [string, string, string][] = [
    ['NASA FIRMS active fires', 'MODIS C6.1 (Aqua), VIIRS C2 (S-NPP, NOAA-20)', 'https://firms.modaps.eosdis.nasa.gov/'],
    ['geoBoundaries', 'Vietnam ADM1, gbOpen', 'https://www.geoboundaries.org/'],
    ['Sofiev & Kouznetsov (2026)', 'MODIS detection-limit anchors used by the observation operator', ''],
    ['FireForest repository', 'pipeline, checks and this site', REPO],
  ]
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Sources</h3>
      <ul className="mt-6 space-y-4">
        {src.map(([a, b, href]) => (
          <li key={a} className="text-sm">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-bone underline decoration-line underline-offset-4 hover:decoration-bone">
                {a}
              </a>
            ) : (
              <span className="text-bone">{a}</span>
            )}
            <div className="mt-0.5 text-bone-dim">{b}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
