#!/usr/bin/env python3
"""Sanity checks for harmonize_fire_v2.py outputs.   python check_outputs.py --out ./out [--n-prov 63]"""
import argparse, sys
import numpy as np, pandas as pd
ap = argparse.ArgumentParser(); ap.add_argument("--out", default="out"); ap.add_argument("--n-prov", type=int, default=63)
a = ap.parse_args(); o = a.out
bad = 0
def chk(name, ok, detail=""):
    global bad; bad += (not ok)
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))

pm = pd.read_csv(f"{o}/province_monthly_harmonized.csv")
ms = pd.read_csv(f"{o}/monthly_series.csv")
gap = pd.read_csv(f"{o}/aqua_gap_report.csv")
cal = pd.read_csv(f"{o}/seasonal_calendar.csv")

# --- province table
npv = pm["province"].nunique()
chk("province count", npv >= a.n_prov - 2, f"{npv} found; geoBoundaries has 63 features, Con Dao is separate, "
    "tiny provinces may have no fire cells")
chk("no whitespace/tab in names", (pm["province"] != pm["province"].str.strip()).sum() == 0)
chk("no NaN", pm[["harmonized", "harmonized_lo", "harmonized_hi"]].isna().sum().sum() == 0)
tol = 0.011
chk("lo <= point <= hi", ((pm.harmonized_lo <= pm.harmonized + tol) & (pm.harmonized <= pm.harmonized_hi + tol)).all(),
    f"{((pm.harmonized_lo > pm.harmonized + tol) | (pm.harmonized > pm.harmonized_hi + tol)).sum()} violations")
# --- additivity: provinces must sum to national harmonized (same cells, same R)
nat = ms[ms.region == "Vietnam"].set_index("month")["harmonized"]
psum = pm.groupby("month")["harmonized"].sum()
j = pd.concat([psum, nat], axis=1, join="inner").dropna(); j.columns = ["prov", "nat"]
rel = ((j.prov - j.nat).abs() / j.nat.clip(lower=1)).max()
chk("sum(provinces) == national", rel < 0.02, f"max rel diff {rel:.3%} over {len(j)} months")
# --- band width
w = (pm.harmonized_hi - pm.harmonized_lo) / pm.harmonized.clip(lower=1)
big = pm[(pm.harmonized >= 20)].assign(w=w).groupby("province")["w"].median()
chk("bands not degenerate / not absurd", (big.median() > 0.005) and (big.median() < 1.0), f"median rel. width {big.median():.1%}")
zero = pm.groupby("province")["harmonized"].sum(); zero = zero[zero == 0].index.tolist()
print("INFO  provinces with zero fire cell-days:", zero or "none")
print("INFO  top 8 provinces (total cell-days):"); print(pm.groupby("province")["harmonized"].sum().sort_values(ascending=False).head(8).round(0).to_string())
pk = pm.assign(mm=pm.month.str[5:7].astype(int)).groupby(["province", "mm"])["harmonized"].mean().unstack().idxmax(axis=1)
print("INFO  peak calendar month per province (value counts; Vietnam is typically Jan-Apr, Central Highlands Feb-Mar):")
print(pk.value_counts().sort_index().to_string())

# --- gaps
g = gap[gap.gap]
print("INFO  Aqua gap months:", g.month.tolist() or "none")
if len(gap) > 1:
    chk("gap months are rare (<5% of months)", len(g) / len(gap) < 0.05, f"{len(g)}/{len(gap)}")
post = ms[(ms.region == "Vietnam") & (ms.month >= "2012-02")]
chk("no NaN in harmonized after Feb-2012 (gaps are VIIRS-filled)", post.harmonized.notna().all())
pre_nan = ms[(ms.region == "Vietnam") & (ms.month < "2012-02") & ms.harmonized.isna()].month.tolist()
print("INFO  pre-2012 months with NaN (unrecoverable Aqua gaps):", pre_nan or "none")

# --- calendar
s = cal.groupby("region")["share_of_year_pct"].sum()
chk("seasonal shares sum to 100 per region", (s.sub(100).abs() < 0.5).all(), s.round(1).to_dict().__str__())
z = ms[ms.region == "Vietnam"]["z"].dropna(); an = (z.abs() >= 2).mean()
chk("anomaly rate plausible (2-12% of months |z|>=2)", 0.02 <= an <= 0.12, f"{an:.1%}")
print("\nALL CHECKS PASSED" if not bad else f"\n{bad} CHECK(S) FAILED"); sys.exit(bad)