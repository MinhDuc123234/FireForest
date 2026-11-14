# Harmonization report
Window: 2003-01 .. 2026-10 | Target sensor: Aqua | Vietnam mask: yes
VIIRS confidence kept: n,h | MODIS min confidence: 30 | afternoon passes only

## The 2012 step (mean 2012-16 / mean 2007-11, national annual cell-days)
- naive splice (Aqua -> raw VIIRS): x4.35
- harmonized: x1.08
- Aqua observed throughout (reference for the real change): x1.08

## Held-out validation (2019+), national monthly
                       bias_pct  wMAPE_pct  r_log
method                                           
raw VIIRS                317.87     317.87   0.97
constant ratio             0.51      13.21   0.97
physics + calibration     -5.96      12.36   0.97

Files: monthly_series.csv, seasonal_calendar.csv, calibration_bias_table.csv, validation_metrics.csv,
trend_check.csv, grid10km_monthly_harmonized.csv, province_monthly_harmonized.csv, fig1-5 PNG.

## Limits
Hotspot != burned area. No cloud mask in FIRMS: cloud omission is absorbed only on average by the ratio R.
Detection-limit anchors are approximations from Sofiev & Kouznetsov (2026) text; replace with Table 1 if available.
Province bands reflect calibration + operator uncertainty (shared across provinces), not local sampling noise.
Aqua gap months: see aqua_gap_report.csv (excluded from calibration; NaN before 2012, VIIRS-filled after).
NRT data (no 'type' column) are assumed vegetation fires. MODIS orbits drift in recent years: check Aqua after 2022.
