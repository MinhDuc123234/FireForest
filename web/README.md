# FireForest web

Static front end for the MODIS/VIIRS harmonized fire record of Vietnam (NASA Space Apps 2026,
"Harmonization of MODIS and VIIRS Hot Spots"). React 18 + Vite + Tailwind 4.

Every number on the site is read from `public/data/*.json`. Those files are produced from the
pipeline outputs in `out/` (written by `harmonize/harmonize_fire_v2.py`); the web app never
computes or invents values. Unit everywhere: **fire-active 10 km cell-days**.

## Run

From the repository root:

```bash
python web/scripts/export_data.py --out out --web web/public/data
cd web && npm install && npm run dev
```

**Requires a Python with pandas + numpy** for the `check_outputs.py` step (on Windows: `py -3`,
e.g. `py -3 web/scripts/export_data.py --out out --web web/public/data`).
`export_data.py` itself uses only the standard library; it runs `harmonize/check_outputs.py` with
the first interpreter that can import pandas (`python`, then `py -3`) or with
`--check-python <path>`. It reads `out/`, `geometry/` and `harmonize/` and never writes there.

`npm run build` type-checks (`tsc --noEmit`) and then builds into `web/dist/`.

## Pages

Hash-routed (`react-router-dom` HashRouter), so any static host works and a refresh never 404s.

| Route | Content |
| --- | --- |
| `#/` | Home: hero map, the 2012 jump (scrollytelling), where and when Vietnam burns, why trust it |
| `#/explore` | Full-screen map: place search, province card, top 10, timeline, charts drawer, CSV |
| `#/method` | Five pipeline steps, observation operator diagram, splice rule, docstring quotes |
| `#/trust` | Held-out validation, R table, Aqua overpass, `check_outputs.py`, limits, data, sources |

The map (`src/shared/map/`) is MapLibre GL JS on OpenFreeMap vector tiles (no API key; attribution
© OpenFreeMap, © OpenMapTiles, data from OpenStreetMap). The style is written by hand: no sea names,
no maritime or disputed boundaries, and no basemap labels in the East Sea; Hoàng Sa and Trường Sa are
labelled by the app from `provinces.geojson`. If the tiles cannot be reached, the provinces and fire
cells still draw on a plain background.

## Data files (`public/data/`)

| File | Built from | Content |
| --- | --- | --- |
| `national.json` | `monthly_series.csv` | 5 regions × 2003-01..2026-10: naive splice, harmonized + 95% band, Aqua observed, raw S-NPP, z, anomaly, Aqua gap flag |
| `provinces.json` | `province_monthly_harmonized.csv` (+ grid for region shares) | 63 provinces × 2012-02..2026-10 with band; total, peak month, Theil-Sen trend, band width, rank |
| `grid/<YYYY>.json` | `grid10km_monthly_harmonized.csv` | `[lat, lon, month_index 0-11, harm]` per cell-month with harm > 0, one file per year 2012-2026 |
| `grid_cells.json` | same | the 3,509 10 km cells: id, lat, lon, province, region, mean monthly, total |
| `grid_march.json` | same | March values per cell, 2012-2026 (Hero) |
| `seasonal.json` | `seasonal_calendar.csv` | calendar-month mean, median, sd, p10, p90, share of year |
| `trust.json` | `validation_metrics.csv`, `trend_check.csv`, `calibration_bias_table.csv`, `aqua_overpass_by_year.csv`, `aqua_gap_report.csv` | held-out validation, trends, R table, overpass drift, gap months |
| `kpi.json` | `monthly_series.csv`, `trend_check.csv`, `validation_metrics.csv` | 2012 step, trends, held-out bias; asserted equal to `out/report.md` at export time |
| `method.json` | `harmonize_fire_v2.py` (parsed as text with `ast`) | docstring, constants, function signatures, CLI defaults |
| `checks.json` | `check_outputs.py` stdout | each PASS/FAIL/INFO line + verbatim output |
| `provinces.geojson` | `geometry/vietnam_adm1.geojson` (geoBoundaries) | simplified ADM1 outlines (Douglas-Peucker 0.004°), names match the CSVs |

The grid exists only from 2012-02 (VIIRS era) and carries point estimates only; province and
national series carry the 95% bootstrap band.

Front-end access goes through `src/shared/data/load.ts` (typed loaders, cache, `useData` hook).

### Raw CSV copies (pending)

`public/data/monthly_series.csv` (123 KB) and `public/data/grid10km_monthly_harmonized.csv` (8.6 MB)
are verbatim copies of the `out/` files added in commit 3ba58e2. The burning calendar and the
Vietnam map now read `national.json` and `grid/<YYYY>.json` (via `load.ts`); whether to keep these copies
is still open.
