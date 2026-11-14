# 🔥 Fire Forest

**One comparable fire history, many local decisions.**

Fire Forest harmonizes NASA MODIS and VIIRS active-fire hotspots into a single, comparable 2003–2026 time series for Vietnam, with seasonal fire calendars, anomaly flags, and uncertainty bands at national, regional and province level.

Built for NASA Space Apps 2026, challenge *Harmonization of MODIS and VIIRS Hot Spots*.

---

## The problem

VIIRS (375 m) detects far more small fires than MODIS (1 km). Splicing the two records directly creates a fake jump in fire activity in 2012, when VIIRS data begin, and can reverse the apparent trend.

| Series | 2012 step (mean 2012-16 / mean 2007-11) | Trend 2003-2025 |
|---|---|---|
| Naive splice (Aqua then raw VIIRS) | ×4.35 | +4.3 % / yr |
| **Fire Forest harmonized** | **×1.08** | **−2.3 % / yr** (p = 0.002) |
| Aqua observed (reference) | ×1.08 | −1.9 % / yr |

## Approach

For every VIIRS fire we ask: *would MODIS Aqua, on the same afternoon overpass, have detected it?*

1. **Observation operator.** MODIS detection limit grows with pixel area, and detection probability is a logistic curve in FRP. The unknown swath position is integrated out with deterministic quadrature (no Monte-Carlo noise). Based on Sofiev & Kouznetsov (2026).
2. **Unit of count.** Fire-active 10 km cell-days: at least one afternoon detection in a 10×10 km cell on a local date. This is much less sensitive to pixel size than raw counts.
3. **Empirical calibration.** On the 2012–2022 overlap, the ratio *observed Aqua / predicted* is fitted per region × calendar month and shrunk toward the national ratio.
4. **Uncertainty.** Year-block bootstrap plus detection-limit scenarios (×0.7, ×1.0, ×1.4) give 95 % bands.
5. **Final series.** Aqua observed (2003 to Jan 2012) plus VIIRS converted to MODIS-equivalent (Feb 2012 onward). Aqua gap months are filled from VIIRS.

Processing details: UTC to local time (UTC+7), afternoon passes only, vegetation-fire type only, VIIRS confidence `n,h`, MODIS confidence ≥ 30, duplicate removal, equal-area sinusoidal grid.

## Validation

Fit on 2012–2018, tested on 2019+ (national monthly):

| Method | Bias | wMAPE | r (log) |
|---|---|---|---|
| Raw VIIRS | +317.9 % | 317.9 % | 0.97 |
| Constant ratio | +0.5 % | 13.2 % | 0.97 |
| **Physics + calibration** | −6.0 % | **12.4 %** | 0.97 |

The regional benefit is larger: for example Central 14.9 % vs 29.9 % wMAPE, and North 16.3 % vs 26.0 %, compared with the constant ratio. NOAA-20 converted with the SNPP calibration overlays SNPP almost exactly, which is an independent cross-check (`fig5`).

## Repository contents

```
harmonize_fire_v2.py     main pipeline
check_outputs.py         sanity checks on outputs
data/                    NASA FIRMS CSVs (archive + NRT)
out/                     generated outputs
```

### Outputs

| File | Description |
|---|---|
| `monthly_series.csv` | Monthly series per region and Vietnam: raw, naive, harmonized, 95 % band, z-score, anomaly flag |
| `province_monthly_harmonized.csv` | 63 provinces × months, with 95 % bands |
| `grid10km_monthly_harmonized.csv` | Gridded 10 km monthly values |
| `seasonal_calendar.csv` | Monthly mean, median, p10/p90 and share of year |
| `calibration_bias_table.csv` | R factors by region × calendar month |
| `validation_metrics.csv` | Held-out metrics by region and method |
| `trend_check.csv` | Theil-Sen and Kendall trend tests |
| `aqua_gap_report.csv` | Detected Aqua gap months |
| `aqua_overpass_by_year.csv` | Median Aqua local pass time per year |
| `fig1`–`fig5` | Raw vs harmonized, validation, calendar heatmap, bias, NOAA-20 cross-check |
| `report.md` | Auto-generated run summary |

## Quick start

```bash
pip install pandas numpy scipy matplotlib geopandas shapely

# put FIRMS files in ./data:
#   fire_archive_M-C61*.csv   fire_nrt_M-C61*.csv      (MODIS)
#   fire_archive_SV-C2*.csv   fire_nrt_SV-C2*.csv      (VIIRS SNPP)
#   fire_archive_J1V-C2*.csv  fire_nrt_J1V-C2*.csv     (VIIRS NOAA-20, optional)

python harmonize_fire_v2.py --data-dir ./data --out ./out
python harmonize_fire_v2.py --data-dir ./data --out ./out --boundary vietnam_adm1.geojson   # offline boundary
python check_outputs.py --out ./out
```

Useful flags: `--viirs-conf`, `--modis-min-conf`, `--calib-end`, `--train-end`, `--scenarios`, `--boot`, `--no-nrt`.
Without `geopandas` the Vietnam mask is skipped, and results then cover the whole CSV bounding box including Laos, Cambodia and southern China.

## Key findings (Vietnam)

- Fire season peaks in March to April (Central Highlands February to March); most provinces peak in March or April.
- Highest cumulative activity: Điện Biên, Sơn La, Gia Lai, Đắk Lắk, Kon Tum.
- 3.8 % of months are flagged as anomalous (|z| ≥ 2).

## Limitations

- A hotspot is not burned area. Hotspots may include crop-residue burning or other heat sources.
- FIRMS has no cloud mask. Cloud omission is absorbed only on average by R.
- Detection-limit anchors are approximations from the paper's text, and calibration factors R are 0.43–0.96, so the operator is semi-empirical. Replace with the paper's Table 1 coefficients if available.
- **Aqua orbit drift:** its local pass time moves from about 13.3 h (to 2022) to about 15.0 h (2026). Calibration therefore uses data to 2022 only, and the harmonized series is more reliable than raw Aqua after 2023.
- Province bands reflect calibration and operator uncertainty, not local sampling noise.
- NRT data lack a `type` column and are assumed to be vegetation fires.

## Roadmap

| Component | Status |
|---|---|
| **C1 Harmonize**: sensor separation, time zone, grid, quality thresholds, bias legend | ✅ Done |
| **C2 Seasonal calendar**: monthly and seasonal stats, change rate, uncertainty | ✅ Done |
| **C3 Local dashboard**: map, province picker, naive vs harmonized toggle (FastAPI, DuckDB, MapLibre/Folium, Plotly) | 🚧 In progress |
| Per-hotspot traceability (raw FIRMS rows for drill-down) | 🚧 Planned |
| NISAR/SAR surface-change layer (extension, only if data are verified) | ⏸ Optional |

## Data and credits

- NASA FIRMS: MODIS C6.1 (Aqua), VIIRS SNPP and NOAA-20 (375 m)
- Province boundaries: geoBoundaries ADM1 (Vietnam)
- Method inspiration: Sofiev & Kouznetsov (2026)

*Benefit Humanity: turning NASA Earth observation into verified information for understanding fire seasons and environmental conditions in Vietnam.*