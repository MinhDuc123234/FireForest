import React from 'react'
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'

import { SourceChip } from '../../shared/components/SourceChip'
import { dataUrl, useData, type Checks, type Trust, type ValidationMethod } from '../../shared/data/load'
import { AQUA, GRID, MUTED, NAIVE, TRUST, WARN } from '../../shared/lib/colors'
import { MONTHS, fmtNum, fmtPctSigned } from '../../shared/lib/format'
import { useWidth } from '../../shared/lib/useWidth'

const OURS: ValidationMethod = 'physics + calibration'
const METHODS: ValidationMethod[] = ['raw VIIRS', 'constant ratio', 'physics + calibration']
const METHOD_COLOR: Record<ValidationMethod, string> = { 'raw VIIRS': NAIVE, 'constant ratio': '#d8d7cf', 'physics + calibration': TRUST }
/** Aqua's nominal 13:30 local equator crossing (NASA Aqua mission). */
const NOMINAL_PASS_H = 13.5
const REPO = 'https://github.com/MinhDuc123234/FireForest'
const mono = { fontFamily: 'JetBrains Mono, monospace' }

const hhmm = (h: number) => `${Math.floor(h)}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`
const H3 = ({ children }: { children: React.ReactNode }) => <h2 className="text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.02em]">{children}</h2>

/** /trust body: the evidence as pictures first, tables on demand. */
export function TrustLimits() {
  const trust = useData('trust.json')
  const checks = useData('checks.json')
  if (trust.status === 'error' || checks.status === 'error') return null
  if (trust.status !== 'ready' || checks.status !== 'ready') return <section className="min-h-[900px]" />
  const t = trust.data
  return (
    <>
      <Validation t={t} />
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1280px] gap-16 px-5 py-20 md:px-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <RTable t={t} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Overpass t={t} />
          </div>
        </div>
      </section>
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1280px] gap-16 px-5 py-20 md:px-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <Terminal c={checks.data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Limits t={t} />
          </div>
        </div>
      </section>
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1280px] gap-16 px-5 py-20 md:px-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-7">
            <Reproduce c={checks.data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Sources />
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------ validation: one sentence, one picture */
function Validation({ t }: { t: Trust }) {
  const rows = t.validation.rows
  const regions = [...new Set(rows.map((r) => r.region))]
  const macro = regions.filter((r) => r !== 'Vietnam')
  const get = (reg: string, m: ValidationMethod) => rows.find((r) => r.region === reg && r.method === m)!
  const bestBy = (reg: string, f: (r: (typeof rows)[number]) => number) => METHODS.reduce((a, b) => (f(get(reg, b)) < f(get(reg, a)) ? b : a))
  const winsW = macro.filter((r) => bestBy(r, (x) => x.wMAPE_pct) === OURS).length
  const winsB = macro.filter((r) => bestBy(r, (x) => Math.abs(x.bias_pct)) === OURS).length
  const natW = bestBy('Vietnam', (x) => x.wMAPE_pct) === OURS
  const natBest = bestBy('Vietnam', (x) => Math.abs(x.bias_pct))
  const signs = new Set(macro.map((r) => Math.sign(get(r, natBest).bias_pct)))
  const cancels = signs.has(1) && signs.has(-1)

  return (
    <header className="mx-auto max-w-[1280px] px-5 pb-20 pt-16 md:px-10 md:pt-24">
      <p className="font-mono text-[11px] text-muted">Trust</p>
      <h1 className="mt-3 max-w-[20ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.04em]">Tested on years the fit never saw</h1>
      <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-bone">
        Fitted on months up to {t.validation.train_end} and checked against Aqua from {t.validation.train_end + 1}, physics + calibration
        has the smallest error in {winsW} of {macro.length} regions{natW ? ' and nationally' : ''}, and the smallest bias in {winsB} of{' '}
        {macro.length}.
        {natBest !== OURS && (
          <span className="text-bone-dim">
            {' '}
            Nationally, the {natBest} baseline has the smaller bias ({fmtPctSigned(get('Vietnam', natBest).bias_pct, 1)} against{' '}
            {fmtPctSigned(get('Vietnam', OURS).bias_pct, 1)}){cancels ? ': its regional biases have opposite signs and cancel out.' : '.'}
          </span>
        )}
      </p>

      <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px]">
        {METHODS.map((m) => (
          <span key={m} className="flex items-center gap-2" style={{ color: METHOD_COLOR[m] }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLOR[m] }} />
            {m}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-8">
        <DotPanel t={t} regions={regions} metric="bias_pct" title="Bias vs Aqua, %" domain={[-40, 40]} zero />
        <DotPanel t={t} regions={regions} metric="wMAPE_pct" title="Month-to-month error (wMAPE), %" domain={[0, 40]} />
      </div>
      <details className="group mt-8 border-t border-line pt-4">
        <summary className="cursor-pointer list-none font-mono text-[11px] text-bone-dim hover:text-bone">
          <span className="group-open:hidden">Show table +</span>
          <span className="hidden group-open:inline">Hide table −</span>
        </summary>
        <ValidationTable t={t} regions={regions} />
      </details>
      <SourceChip csv="validation_metrics.csv" unit="monthly fire-active 10 km cell-days" extra={`fit ≤ ${t.validation.train_end}, test ${t.validation.train_end + 1}+`} className="mt-4" />
    </header>
  )
}

/** One row per region, one dot per method; values beyond the axis are pinned to the edge with their value. */
function DotPanel({ t, regions, metric, title, domain, zero }: { t: Trust; regions: string[]; metric: 'bias_pct' | 'wMAPE_pct'; title: string; domain: [number, number]; zero?: boolean }) {
  const [ref, W] = useWidth()
  const lw = 104, rw = 64
  const rowH = 44
  const H = 30 + regions.length * rowH + 22
  const x = scaleLinear().domain(domain).range([lw, W - rw]).clamp(true)
  const ticks = x.ticks(4)
  return (
    <div ref={ref}>
      <h3 className="font-mono text-[11px] text-bone-dim">{title}</h3>
      <svg width={W} height={H} className="mt-2 block" role="img" aria-label={`${title}, held-out test years, by region and method`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={18} y2={H - 20} stroke={zero && v === 0 ? AQUA : GRID} strokeWidth={zero && v === 0 ? 1.4 : 1} />
            <text x={x(v)} y={H - 4} textAnchor="middle" fontSize={10} fill={MUTED} style={mono}>{v > 0 && zero ? `+${v}` : v}</text>
          </g>
        ))}
        {regions.map((reg, i) => {
          const y = 34 + i * rowH
          const vals = METHODS.map((m) => ({ m, v: t.validation.rows.find((r) => r.region === reg && r.method === m)![metric] }))
          const off = vals.filter((d) => d.v > domain[1] || d.v < domain[0])
          return (
            <g key={reg}>
              <text x={0} y={y + 4} fontSize={12} fill={reg === 'Vietnam' ? AQUA : '#a9a8a0'} fontWeight={reg === 'Vietnam' ? 600 : 400} style={mono}>{reg}</text>
              <line x1={lw} x2={W - rw} y1={y} y2={y} stroke={GRID} strokeDasharray="1 3" />
              {vals.filter((d) => d.v <= domain[1] && d.v >= domain[0]).map((d) => (
                <g key={d.m}>
                  <circle cx={x(d.v)} cy={y} r={d.m === OURS ? 6 : 5} fill={METHOD_COLOR[d.m]} stroke="#080807" strokeWidth={1.5} />
                  {d.m === OURS && <text x={x(d.v)} y={y - 11} textAnchor="middle" fontSize={10} fill={TRUST} style={mono}>{metric === 'bias_pct' ? fmtPctSigned(d.v, 1) : fmtNum(d.v, 1)}</text>}
                </g>
              ))}
              {off.map((d) => (
                <g key={d.m}>
                  <path d={`M${W - rw + 2},${y - 5} L${W - rw + 10},${y} L${W - rw + 2},${y + 5} Z`} fill={METHOD_COLOR[d.m]} />
                  <text x={W - rw + 14} y={y + 4} fontSize={10} fill={METHOD_COLOR[d.m]} style={mono}>{metric === 'bias_pct' ? fmtPctSigned(d.v, 0) : fmtNum(d.v, 0)}</text>
                </g>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ValidationTable({ t, regions }: { t: Trust; regions: string[] }) {
  return (
    <table className="mt-4 w-full border-collapse text-left text-xs tabular-nums sm:text-sm">
      <thead>
        <tr className="border-b border-line font-mono text-[11px] text-muted">
          <th className="py-2 pr-2 font-normal">Region · method</th>
          <th className="py-2 pr-2 text-right font-normal">bias %</th>
          <th className="py-2 pr-2 text-right font-normal">wMAPE %</th>
          <th className="py-2 text-right font-normal">r (log)</th>
        </tr>
      </thead>
      <tbody>
        {regions.flatMap((reg) => [
          <tr key={reg}>
            <th colSpan={4} className="pb-1 pt-4 text-left font-medium text-bone">{reg}</th>
          </tr>,
          ...METHODS.map((m, i) => {
            const r = t.validation.rows.find((x) => x.region === reg && x.method === m)!
            return (
              <tr key={reg + m} className={`${i === METHODS.length - 1 ? 'border-b border-line' : ''} ${m === OURS ? 'text-bone' : 'text-bone-dim'}`}>
                <td className="py-1.5 pr-2" style={{ color: m === OURS ? TRUST : undefined }}>{m}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{fmtPctSigned(r.bias_pct, 1)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{fmtNum(r.wMAPE_pct, 1)}</td>
                <td className="whitespace-nowrap py-1.5 text-right">{fmtNum(r.r_log, 3)}</td>
              </tr>
            )
          }),
        ])}
      </tbody>
    </table>
  )
}

/* ------------------------------------------------------------ R: diverging around 1 */
function RTable({ t }: { t: Trust }) {
  const { regions, R, calib_end } = t.calibration_R
  const all = regions.flatMap((r) => R[r])
  const dev = Math.max(...all.map((v) => Math.abs(Math.log(v))))
  const below = all.filter((v) => v < 1).length
  const fill = (v: number) => {
    const k = Math.abs(Math.log(v)) / dev
    return v < 1 ? `rgba(59,201,219,${0.12 + 0.78 * k})` : `rgba(255,176,32,${0.12 + 0.78 * k})`
  }
  return (
    <div>
      <H3>The physics over-predicts, by a known amount</H3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        R = Aqua observed ÷ predicted, per region and calendar month, fitted up to {calib_end}. {below} of {all.length} values are below 1:
        the operator predicts more detections than Aqua made, and R scales them back.
      </p>
      <div className="mt-6 grid grid-cols-[5.5rem_repeat(12,minmax(0,1fr))] gap-[3px] font-mono text-[10px] tabular-nums sm:grid-cols-[6.5rem_repeat(12,minmax(0,1fr))]">
        <span />
        {MONTHS.map((m) => (
          <span key={m} className="pb-1 text-center text-muted">{m[0]}</span>
        ))}
        {regions.map((reg) => (
          <React.Fragment key={reg}>
            <span className="flex items-center truncate pr-2 text-bone-dim">{reg}</span>
            {R[reg].map((v, i) => {
              const strong = Math.abs(Math.log(v)) / dev > 0.5
              return (
                <span
                  key={i}
                  title={`${reg}, ${MONTHS[i]}: R = ${fmtNum(v, 3)}`}
                  className="flex aspect-square items-center justify-center text-[9px] font-medium sm:text-[11px]"
                  style={{ background: fill(v), color: strong ? '#080807' : '#ecebe4' }}
                >
                  <span className="hidden sm:inline">{fmtNum(v, 2).replace(/^0/, '')}</span>
                </span>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-6" style={{ background: 'linear-gradient(90deg, rgba(59,201,219,0.9), rgba(59,201,219,0.12))' }} />R &lt; 1 · physics over-predicts</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 border border-line" />R = 1 · exact</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-6" style={{ background: 'linear-gradient(90deg, rgba(255,176,32,0.12), rgba(255,176,32,0.9))' }} />R &gt; 1 · under-predicts</span>
      </div>
      <SourceChip csv="calibration_bias_table.csv" unit="ratio" className="mt-2" />
    </div>
  )
}

/* ------------------------------------------------------------ Aqua overpass: a line, 13:30 reference, drift shaded */
function Overpass({ t }: { t: Trust }) {
  const [ref, W] = useWidth()
  const rows = t.overpass.rows
  const calibEnd = t.calibration_R.calib_end
  const H = 220
  const m = { l: 44, r: 12, t: 16, b: 26 }
  const x = scaleLinear().domain([rows[0].year, rows[rows.length - 1].year]).range([m.l, W - m.r])
  const ys = rows.map((r) => r.median_local_hour)
  const y = scaleLinear().domain([Math.min(13, ...ys), Math.max(...ys) + 0.15]).range([H - m.b, m.t])
  const path = line<(typeof rows)[number]>().x((r) => x(r.year)).y((r) => y(r.median_local_hour))(rows) ?? ''
  const lastR = rows[rows.length - 1]
  return (
    <div>
      <H3>Aqua is drifting later</H3>
      <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-bone-dim">
        Median local time of Aqua's afternoon detections. After {calibEnd} the pass slides away from its nominal {hhmm(NOMINAL_PASS_H)},
        reaching {hhmm(lastR.median_local_hour)} in {lastR.year}, so calibration stops at {calibEnd}.
      </p>
      <div ref={ref} className="mt-6">
        <svg width={W} height={H} role="img" aria-label={`Median local Aqua pass time ${rows[0].year}–${lastR.year}, with the nominal 13:30 marked`}>
          <rect x={x(calibEnd + 0.5)} y={m.t} width={W - m.r - x(calibEnd + 0.5)} height={H - m.t - m.b} fill={WARN} fillOpacity={0.08} />
          <text x={x(calibEnd + 0.5) - 6} y={H - m.b - 8} textAnchor="end" fontSize={10} fill={WARN} style={mono}>after {calibEnd} →</text>
          {[13, 14, 15].filter((h) => h >= y.domain()[0] && h <= y.domain()[1]).map((h) => (
            <g key={h}>
              <line x1={m.l} x2={W - m.r} y1={y(h)} y2={y(h)} stroke={GRID} />
              <text x={m.l - 8} y={y(h) + 3} textAnchor="end" fontSize={10} fill={MUTED} style={mono}>{hhmm(h)}</text>
            </g>
          ))}
          <line x1={m.l} x2={W - m.r} y1={y(NOMINAL_PASS_H)} y2={y(NOMINAL_PASS_H)} stroke={AQUA} strokeDasharray="4 3" />
          <text x={m.l + 4} y={y(NOMINAL_PASS_H) - 6} fontSize={10} fill={AQUA} style={mono}>nominal {hhmm(NOMINAL_PASS_H)}</text>
          <path d={path} fill="none" stroke={AQUA} strokeWidth={1.6} />
          {rows.map((r) => (
            <circle key={r.year} cx={x(r.year)} cy={y(r.median_local_hour)} r={r.year > calibEnd ? 3 : 2} fill={r.year > calibEnd ? WARN : AQUA} />
          ))}
          <text x={x(lastR.year) - 6} y={y(lastR.median_local_hour) + 4} textAnchor="end" fontSize={10} fill={WARN} style={mono}>{hhmm(lastR.median_local_hour)}</text>
          {rows.filter((r) => r.year % 4 === 2).map((r) => (
            <text key={r.year} x={x(r.year)} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED} style={mono}>{r.year}</text>
          ))}
        </svg>
      </div>
      <SourceChip csv="aqua_overpass_by_year.csv" unit="local time (UTC+7)" className="mt-2" />
    </div>
  )
}

/* ------------------------------------------------------------ check_outputs.py */
function Terminal({ c }: { c: Checks }) {
  const pass = c.items.filter((i) => i.status === 'PASS' || i.status === 'FAIL')
  return (
    <div>
      <H3>Automatic checks on every export</H3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        <code className="font-mono text-bone">harmonize/check_outputs.py</code>, run when the site data were built. A failure would be
        listed here.
      </p>
      <div className="mt-6 border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.7]">
        <div className="break-all text-muted">$ {c.meta.command}</div>
        {pass.map((it, i) => (
          <div key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-1">
            <span style={{ color: it.status === 'PASS' ? TRUST : WARN }}>{it.status === 'PASS' ? '✓ PASS' : '✗ FAIL'}</span>
            <span className="break-words text-bone">
              {it.name}
              {it.detail && <span className="text-muted"> · {it.detail}</span>}
            </span>
          </div>
        ))}
        <div className="mt-2" style={{ color: c.all_passed ? TRUST : WARN }}>
          {c.summary ?? 'no summary line'} · {c.n_pass}/{c.n_checks}
        </div>
      </div>
      <details className="group mt-3">
        <summary className="cursor-pointer list-none font-mono text-[11px] text-bone-dim hover:text-bone">
          <span className="group-open:hidden">Show full log +</span>
          <span className="hidden group-open:inline">Hide full log −</span>
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.6] text-bone-dim">{c.stdout}</pre>
      </details>
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
      <H3>Limits</H3>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {items.map((s) => (
          <li key={s} className="py-3 text-sm leading-relaxed text-bone-dim">{s}</li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------ reproduce + sources */
const FILES: [string, string][] = [
  ['national.json', 'monthly series, 5 regions'],
  ['provinces.json', '63 provinces with bands'],
  ['seasonal.json', 'seasonal calendar'],
  ['trust.json', 'validation, R, overpass, gaps'],
  ['kpi.json', 'headline numbers'],
  ['method.json', 'pipeline constants and counts'],
  ['checks.json', 'check_outputs.py output'],
  ['grid_cells.json', 'the 3,509 10 km cells'],
  ['provinces.geojson', 'province outlines'],
]

function Reproduce({ c }: { c: Checks }) {
  return (
    <div>
      <H3>Data &amp; reproducibility</H3>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-bone-dim">
        Every number on this site is read from these static files, exported from the pipeline outputs. The 10 km grid is split by year
        (grid/2012.json …).
      </p>
      <ul className="mt-5 grid gap-x-6 sm:grid-cols-2">
        {FILES.map(([f, what]) => (
          <li key={f} className="border-b border-line">
            <a href={dataUrl(f)} download={f} className="flex items-baseline justify-between gap-3 py-2 text-sm text-bone-dim transition-colors hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember">
              <span className="font-mono text-[12px] text-bone">{f}</span>
              <span className="truncate text-right text-xs">{what}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-6 border border-line bg-[#050504] p-4 font-mono text-[11px] leading-[1.7] text-bone-dim">
        <div className="text-muted"># rebuild the site data from the pipeline outputs (read-only on out/)</div>
        <div className="break-all">$ python web/scripts/export_data.py --out out --web web/public/data</div>
        <div className="text-muted"># the checks above</div>
        <div className="break-all">$ {c.meta.command}</div>
        <div className="text-muted"># the site</div>
        <div className="break-all">$ cd web &amp;&amp; npm install &amp;&amp; npm run build</div>
      </div>
    </div>
  )
}

function Sources() {
  const src: [string, string, string][] = [
    ['NASA FIRMS active fires', 'MODIS C6.1 (Aqua), VIIRS C2 (S-NPP, NOAA-20)', 'https://firms.modaps.eosdis.nasa.gov/'],
    ['geoBoundaries', 'Vietnam ADM1, gbOpen', 'https://www.geoboundaries.org/'],
    ['Sofiev & Kouznetsov (2026)', 'MODIS detection-limit anchors used by the observation operator', ''],
    ['OpenFreeMap basemap', '© OpenMapTiles, data © OpenStreetMap contributors (ODbL); no API key', 'https://openfreemap.org/'],
    ['Mapzen Terrain Tiles', 'hillshade, AWS Open Data (SRTM, GMTED2010, ETOPO1)', 'https://registry.opendata.aws/terrain-tiles/'],
    ['FireForest repository', 'pipeline, checks and this site', REPO],
  ]
  return (
    <div>
      <H3>Sources</H3>
      <ul className="mt-6 space-y-4">
        {src.map(([a, b, href]) => (
          <li key={a} className="text-sm">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="text-bone underline decoration-line underline-offset-4 hover:decoration-bone">{a}</a>
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
