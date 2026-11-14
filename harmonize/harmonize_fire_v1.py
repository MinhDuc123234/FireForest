#!/usr/bin/env python3
"""
harmonize_fire.py  -  MODIS / VIIRS hotspot harmonization for Vietnam (NASA FIRMS CSVs)

Idea
----
VIIRS (375 m) sees more small fires than MODIS (1 km), so naively splicing the two
makes fire activity "jump" in 2012.  We ask instead, for every VIIRS fire:
"would MODIS (Aqua, same afternoon overpass) have detected it?"
  1. Physical observation operator (Sofiev & Kouznetsov 2026): MODIS detection limit
     grows linearly with pixel area; detection probability is a logistic curve in FRP.
     The MODIS pixel area depends on swath position, which is unknown -> we integrate
     over the MODIS swath geometry (deterministic quadrature, no Monte-Carlo noise).
  2. Unit of count = "fire-active 10 km cell-days" (>=1 afternoon detection in a 10x10 km
     cell on a local date).  This is far less sensitive to pixel size than raw counts.
  3. Empirical calibration on the 2012-now overlap: ratio  observed Aqua / predicted,
     per region x calendar month (shrunk to the national ratio), with a year-block
     bootstrap + operator-sensitivity scenarios for uncertainty bands.
  4. Validation: fit on 2012-2018, test on 2019-2025, compared to a constant-ratio baseline.
  5. Final series = Aqua observed (2003 - Jan 2012) + VIIRS->MODIS-equivalent (Feb 2012 - now).

Run
---
  python harmonize_fire.py --data-dir ./data --out ./out
  python harmonize_fire.py --data-dir ./data --out ./out --boundary vietnam_adm1.geojson

Requires: pandas numpy scipy matplotlib   (optional: geopandas shapely  -> Vietnam mask + provinces)
"""
import argparse
import glob
import json
import os
import sys
import urllib.request
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ----------------------------------------------------------------------------- constants
KM_DEG = 111.195          # km per degree (sinusoidal projection, equal-area)
TZ_HOURS = 7              # Vietnam local time (UTC+7)
R_E, H_MODIS = 6378.137, 705.0
THETA_MAX = 55.0          # MODIS scan half-angle (deg)
EPOCH = pd.Timestamp("2000-01-01")

# Detection-limit anchors for MODIS C6.1 DAYTIME, quoted in Sofiev & Kouznetsov (2026):
#   ~5.7 MW for the smallest (1 km2) pixel, ~42 MW at the swath edge (9.7 km2).
# D(Ap) = D1 + SLOPE * (Ap - 1).  Replace with Table 1 coefficients if you have them.
D1_DAY, SLOPE_DAY = 5.7, 4.19
W_FRAC = 0.35             # logistic transition width as a fraction of D (assumption)

MACRO_BINS = [-90, 11.5, 16.5, 20.0, 90]
MACRO_LABELS = ["South", "Central", "North-Central", "North"]


# ----------------------------------------------------------------------------- IO
def find(data_dir, pattern):
    hits = sorted(glob.glob(os.path.join(data_dir, pattern)))
    return hits[0] if hits else None


def read_sensor(archive, nrt, use_nrt=True):
    """Read FIRMS archive (+ NRT after the archive's last date). Returns a DataFrame."""
    parts = []
    last_arch = None
    if archive:
        a = pd.read_csv(archive, dtype={"acq_time": str, "confidence": str, "version": str})
        a["nrt"] = False
        last_arch = a["acq_date"].max()
        parts.append(a)
    if use_nrt and nrt:
        n = pd.read_csv(nrt, dtype={"acq_time": str, "confidence": str, "version": str})
        if last_arch is not None:
            n = n[n["acq_date"] > last_arch]
        n["nrt"] = True
        if "type" not in n.columns:
            n["type"] = 0            # NRT files carry no 'type' column: assume vegetation fire
        parts.append(n)
    if not parts:
        return None
    return pd.concat(parts, ignore_index=True)


def prep(df, kind, args):
    """Filter + time + grid keys. kind = 'modis' or 'viirs'."""
    d = df.copy()
    if "type" in d.columns:
        d = d[d["type"].fillna(0).astype(int) == 0]            # presumed vegetation fire
    d = d[d["daynight"] == "D"]                                 # afternoon passes only
    if kind == "viirs":
        keep = [c.strip() for c in args.viirs_conf.split(",")]
        d = d[d["confidence"].isin(keep)]
    else:
        d = d[pd.to_numeric(d["confidence"], errors="coerce") >= args.modis_min_conf]
    # timestamps: UTC -> local date
    t = pd.to_datetime(d["acq_date"] + d["acq_time"].str.zfill(4), format="%Y-%m-%d%H%M")
    loc = t + pd.Timedelta(hours=TZ_HOURS)
    d["ldate"] = loc.dt.floor("D")
    d["dayidx"] = (d["ldate"] - EPOCH).dt.days.astype(np.int64)
    d["month"] = d["ldate"].dt.to_period("M")
    # drop exact duplicates (swath-overlap re-detections, ~100 m)
    d["_la"] = d["latitude"].round(3)
    d["_lo"] = d["longitude"].round(3)
    d = d.drop_duplicates(["satellite", "acq_date", "acq_time", "_la", "_lo"])
    # equal-area sinusoidal km coordinates
    x = KM_DEG * d["longitude"].values * np.cos(np.radians(d["latitude"].values))
    y = KM_DEG * d["latitude"].values
    d["ix1"] = np.floor(x).astype(np.int64)
    d["iy1"] = np.floor(y).astype(np.int64)
    d["cell10"] = (np.floor(y / 10).astype(np.int64)) * 2000 + np.floor(x / 10).astype(np.int64)
    d["area"] = d["scan"] * d["track"]
    return d.reset_index(drop=True)


# ----------------------------------------------------------------------------- regions
def cell_table(cells):
    """cell10 -> centroid lat/lon."""
    iy = cells // 2000
    ix = cells % 2000
    lat = (iy + 0.5) * 10 / KM_DEG
    lon = (ix + 0.5) * 10 / (KM_DEG * np.cos(np.radians(lat)))
    return pd.DataFrame({"cell10": cells, "lat": lat, "lon": lon})


def get_boundary(path, allow_download):
    """Return a GeoDataFrame of Vietnam provinces (or None)."""
    try:
        import geopandas as gpd
    except Exception:
        print("[warn] geopandas not installed -> no Vietnam mask (bbox of the CSVs is used).")
        return None
    if path and Path(path).exists():
        return gpd.read_file(path)
    if allow_download:
        try:
            url = "https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM1/"
            meta = json.load(urllib.request.urlopen(url, timeout=30))
            return gpd.read_file(meta["gjDownloadURL"])
        except Exception as e:
            print(f"[warn] could not download boundary ({e}). Pass --boundary file.geojson "
                  f"(geoBoundaries / GADM / Natural Earth, ADM1).")
    return None


def assign_regions(cells, boundary):
    ct = cell_table(np.unique(cells))
    ct["province"] = "NA"
    keep = pd.Series(True, index=ct.index)
    if boundary is not None:
        import geopandas as gpd
        pts = gpd.GeoDataFrame(ct, geometry=gpd.points_from_xy(ct["lon"], ct["lat"]), crs="EPSG:4326")
        bd = boundary.to_crs("EPSG:4326")
        name_col = next((c for c in ("shapeName", "NAME_1", "name", "NAME") if c in bd.columns), None)
        if name_col is None:
            bd["_n"] = "Vietnam"
            name_col = "_n"
        j = gpd.sjoin(pts, bd[[name_col, "geometry"]], how="left", predicate="within")
        j = j[~j.index.duplicated()]
        miss = j[name_col].isna()
        if miss.any():                                           # coastal cells: nearest within ~5 km
            nn = gpd.sjoin_nearest(pts[miss.values], bd[[name_col, "geometry"]],
                                   how="left", max_distance=0.05)
            nn = nn[~nn.index.duplicated()]
            j.loc[nn.index, name_col] = nn[name_col].values
        ct["province"] = j[name_col].values
        keep = ct["province"].notna()
    ct = ct[keep].copy()
    ct["region"] = pd.cut(ct["lat"], MACRO_BINS, labels=MACRO_LABELS).astype(str)
    return ct.reset_index(drop=True)


# ----------------------------------------------------------------------------- physics
def swath_nodes(n=14):
    """Pixel-area quadrature over the MODIS swath, weighted by ground coverage."""
    th = np.radians(np.linspace(0, THETA_MAX, 4001))
    Rs = R_E + H_MODIS
    v = np.arcsin(Rs * np.sin(th) / R_E)
    r = Rs * np.cos(th) - R_E * np.cos(v)
    area = (r / H_MODIS) ** 2 / np.cos(v)                       # km2 (matches 1 -> 9.7 km2)
    g = R_E * (v - th)
    w = np.gradient(g)
    w /= w.sum()
    edges = np.linspace(0, len(th), n + 1).astype(int)
    Ap = np.array([np.average(area[a:b], weights=w[a:b]) for a, b in zip(edges[:-1], edges[1:])])
    W = np.array([w[a:b].sum() for a, b in zip(edges[:-1], edges[1:])])
    return Ap, W / W.sum()


AP_NODES, AP_W = swath_nodes()


def viirs_cellday(v, scales):
    """VIIRS pixels -> 1 km sub-cells (summed FRP) -> expected P(MODIS sees a fire in 10 km cell-day)."""
    s = v.groupby(["cell10", "dayidx", "ix1", "iy1"], sort=False)["frp"].sum().reset_index()
    key = s["cell10"].values.astype(np.int64) * 100000 + s["dayidx"].values
    uniq, inv = np.unique(key, return_inverse=True)
    out = pd.DataFrame({"cell10": uniq // 100000, "dayidx": uniq % 100000})
    frp = s["frp"].values
    for k, sc in enumerate(scales):
        acc = np.zeros(len(uniq))
        for Ap, w in zip(AP_NODES, AP_W):
            D = sc * (D1_DAY + SLOPE_DAY * (Ap - 1))
            p = 1 / (1 + np.exp(-(frp - D) / (W_FRAC * D)))
            lg = np.log1p(-np.clip(p, 0, 1 - 1e-12))
            acc += w * (1 - np.exp(np.bincount(inv, weights=lg, minlength=len(uniq))))
        out[f"pred{k}"] = acc
    out["raw"] = 1.0
    out["month"] = (EPOCH + pd.to_timedelta(out["dayidx"], unit="D")).dt.to_period("M")
    return out


def aqua_cellday(a):
    u = a.drop_duplicates(["cell10", "dayidx"])[["cell10", "dayidx", "month"]].copy()
    u["aqua"] = 1.0
    return u


# ----------------------------------------------------------------------------- calibration
def monthly(cd, ct, cols):
    m = cd.merge(ct[["cell10", "region"]], on="cell10", how="inner")
    return m.groupby(["region", "month"])[cols].sum()


def tensor(M, regions, months, col):
    x = M[col].unstack("region").reindex(index=months, columns=regions).fillna(0.0)
    return np.array(x.values, dtype=float)                      # (months, regions)


def calib(A, P, cm, mask, shrink=20.0):
    """A,P: (months, regions); cm: calendar month idx (months,); mask: use these months.
    Returns R (regions, 12), with shrinkage to the all-region ratio of each calendar month."""
    R = np.ones((A.shape[1], 12))
    for m in range(12):
        sel = mask & (cm == m)
        a, p = A[sel].sum(0), P[sel].sum(0)
        nat = a.sum() / p.sum() if p.sum() > 0 else 1.0
        R[:, m] = (a + shrink * nat) / (p + shrink)
    return R


def boot_bands(A, Ps, cm, mask, years, B, rng, shrink=20.0):
    """Block bootstrap over years (+ random operator scenario). Returns (B, months, regions)."""
    uy = np.unique(years[mask])
    out = np.zeros((B,) + A.shape)
    for b in range(B):
        ys = rng.choice(uy, size=len(uy), replace=True)
        w = np.zeros(len(years))
        for y in ys:
            w[(years == y) & mask] += 1.0
        s = rng.integers(len(Ps))
        P = Ps[s]
        R = np.ones((A.shape[1], 12))
        for m in range(12):
            sel = cm == m
            a, p = (w[sel, None] * A[sel]).sum(0), (w[sel, None] * P[sel]).sum(0)
            nat = a.sum() / p.sum() if p.sum() > 0 else 1.0
            R[:, m] = (a + shrink * nat) / (p + shrink)
        out[b] = P * R[:, cm].T
    return out


def metrics(obs, est):
    obs, est = np.asarray(obs, float), np.asarray(est, float)
    ok = obs.sum() > 0
    return dict(
        bias_pct=100 * (est.sum() / obs.sum() - 1) if ok else np.nan,
        wMAPE_pct=100 * np.abs(est - obs).sum() / obs.sum() if ok else np.nan,
        r_log=float(np.corrcoef(np.log1p(obs), np.log1p(est))[0, 1]) if len(obs) > 2 else np.nan)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=".")
    ap.add_argument("--out", default="out")
    ap.add_argument("--boundary", default=None, help="Vietnam ADM1 geojson/shp (optional)")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--no-nrt", action="store_true")
    ap.add_argument("--viirs-conf", default="n,h")
    ap.add_argument("--modis-min-conf", type=int, default=30)
    ap.add_argument("--target", default="Aqua", help="MODIS satellite to emulate (Aqua = same afternoon pass)")
    ap.add_argument("--start", default="2003-01")
    ap.add_argument("--train-end", type=int, default=2018)
    ap.add_argument("--scenarios", type=float, nargs="+", default=[0.7, 1.0, 1.4])
    ap.add_argument("--boot", type=int, default=400)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from scipy import stats

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    ui = not args.no_nrt
    base = args.data_dir

    # ---- 1. load -------------------------------------------------------------------
    print("[1/8] loading CSVs ...")
    mod = read_sensor(find(base, "fire_archive_M-C61*.csv"), find(base, "fire_nrt_M-C61*.csv"), ui)
    snp = read_sensor(find(base, "fire_archive_SV-C2*.csv"), find(base, "fire_nrt_SV-C2*.csv"), ui)
    n20 = read_sensor(find(base, "fire_archive_J1V-C2*.csv"), find(base, "fire_nrt_J1V-C2*.csv"), ui)
    if mod is None or snp is None:
        sys.exit("Need MODIS (M-C61) and VIIRS SNPP (SV-C2) CSVs in --data-dir")
    mod = mod[mod["satellite"] == args.target]
    aq = prep(mod, "modis", args)
    sv = prep(snp, "viirs", args)
    nv = prep(n20, "viirs", args) if n20 is not None else None
    print(f"      {args.target}: {len(aq):,} px | SNPP: {len(sv):,} px | "
          f"N20: {0 if nv is None else len(nv):,} px (afternoon, filtered)")

    # last month that is complete for both sensors (1-day tolerance for NRT/archive seams)
    end = min(aq["ldate"].max(), sv["ldate"].max())
    last_m = end.to_period("M")
    if (last_m.end_time.normalize() - end).days > 1:
        last_m = last_m - 1
    first_v = pd.Period("2012-02", "M")            # SNPP incomplete before Feb 2012
    start = pd.Period(args.start, "M")
    print(f"      analysis window {start} .. {last_m}  (VIIRS overlap from {first_v})")

    # ---- 2. regions ----------------------------------------------------------------
    print("[2/8] regions ...")
    allcells = np.unique(np.concatenate([aq["cell10"].unique(), sv["cell10"].unique()]))
    bnd = get_boundary(args.boundary, not args.no_download)
    ct = assign_regions(allcells, bnd)
    masked = bnd is not None
    print("      Vietnam mask:", "ON (" + str(ct["province"].nunique()) + " provinces)" if masked
          else "OFF -> whole CSV bbox incl. Laos/Cambodia/S.China (results NOT Vietnam-only!)")
    regions = MACRO_LABELS
    ct = ct[ct["region"].isin(regions)]

    # ---- 3. cell-days ----------------------------------------------------------------
    print("[3/8] cell-day physics (detection probability over MODIS swath) ...")
    A_cd = aqua_cellday(aq)
    V_cd = viirs_cellday(sv, args.scenarios)
    N_cd = viirs_cellday(nv, args.scenarios) if nv is not None else None
    sc_cols = [f"pred{k}" for k in range(len(args.scenarios))]
    k1 = int(np.argmin(np.abs(np.array(args.scenarios) - 1.0)))
    main_col = f"pred{k1}"

    months = pd.period_range(start, last_m, freq="M")
    cm = np.array([p.month - 1 for p in months])
    yrs = np.array([p.year for p in months])
    have_v = np.array([p >= first_v for p in months])

    MA = monthly(A_cd, ct, ["aqua"])
    MV = monthly(V_cd, ct, ["raw"] + sc_cols)
    A = tensor(MA, regions, months, "aqua")
    Vraw = tensor(MV, regions, months, "raw")
    Ps = np.stack([tensor(MV, regions, months, c) for c in sc_cols])
    P = Ps[k1]
    Vraw[~have_v] = 0
    Ps[:, ~have_v, :] = 0

    # ---- 4. validation (train <= train_end, test after) --------------------------------
    print("[4/8] validation (train ..%d, test %d..) ..." % (args.train_end, args.train_end + 1))
    tr = have_v & (yrs <= args.train_end)
    te = have_v & (yrs > args.train_end) & (yrs <= last_m.year - (0 if last_m.month == 12 else 1))
    Rtr = calib(A, P, cm, tr)
    Hval = P * Rtr[:, cm].T
    const = A[tr].sum() / max(Vraw[tr].sum(), 1)
    rows = []
    for ri, reg in enumerate(regions + ["Vietnam"]):
        sl = slice(None) if reg == "Vietnam" else ri
        obs = A[te][:, sl] if reg != "Vietnam" else A[te].sum(1)
        for name, est in (("raw VIIRS", Vraw), ("constant ratio", Vraw * const), ("physics + calibration", Hval)):
            e = est[te][:, sl] if reg != "Vietnam" else est[te].sum(1)
            rows.append(dict(region=reg, method=name, **metrics(obs, e)))
    val = pd.DataFrame(rows)
    val.to_csv(out / "validation_metrics.csv", index=False)
    print(val[val.region == "Vietnam"].round(2).to_string(index=False))

    # ---- 5. final calibration + uncertainty bands ---------------------------------------
    print("[5/8] final calibration + bootstrap bands ...")
    ov = have_v
    Rall = calib(A, P, cm, ov)
    Hpt = P * Rall[:, cm].T
    BB = boot_bands(A, Ps, cm, ov, yrs, args.boot, rng)
    lo, hi = np.percentile(BB, 2.5, axis=0), np.percentile(BB, 97.5, axis=0)
    # final series: Aqua observed before Feb-2012, harmonized after
    H = np.where(have_v[:, None], Hpt, A)
    Hlo = np.where(have_v[:, None], lo, A)
    Hhi = np.where(have_v[:, None], hi, A)
    naive = np.where(have_v[:, None], Vraw, A)               # naive splice: Aqua then raw VIIRS

    def long(M, name):
        df = pd.DataFrame(M, index=months, columns=regions)
        df.loc[:, "Vietnam"] = df[regions].sum(1)
        return df.stack().rename(name)

    ser = pd.concat([long(A, "aqua_observed"), long(Vraw, "snpp_raw"), long(naive, "naive_splice"),
                     long(H, "harmonized"), long(Hlo, "harmonized_lo"), long(Hhi, "harmonized_hi")], axis=1)
    # national band from replicate sums (keeps year-block dependence)
    nat_lo = np.where(have_v, np.percentile(BB.sum(2), 2.5, axis=0), A.sum(1))
    nat_hi = np.where(have_v, np.percentile(BB.sum(2), 97.5, axis=0), A.sum(1))
    ser = ser.reset_index()
    ser.columns = ["month", "region"] + list(ser.columns[2:])
    mk = ser["region"] == "Vietnam"
    ser.loc[mk, "harmonized_lo"] = nat_lo
    ser.loc[mk, "harmonized_hi"] = nat_hi
    ser["source"] = np.where(ser["month"] >= first_v, "VIIRS->MODIS-equivalent", "Aqua observed")
    # climatology z-score + anomaly flag (on log scale, by calendar month)
    ser["cal_month"] = ser["month"].dt.month
    lg = np.log1p(ser["harmonized"])
    g = lg.groupby([ser["region"], ser["cal_month"]])
    ser["z"] = ((lg - g.transform("mean")) / g.transform("std").replace(0, np.nan)).round(2)
    ser["anomaly"] = np.where(ser["z"] >= 2, "high", np.where(ser["z"] <= -2, "low", ""))
    ser["month"] = ser["month"].astype(str)
    ser.round(2).to_csv(out / "monthly_series.csv", index=False)

    Rdf = pd.DataFrame(Rall, index=regions, columns=range(1, 13)).stack().rename("R_aqua_over_predicted")
    Rdf.reset_index().rename(columns={"level_0": "region", "level_1": "calendar_month"}) \
        .round(3).to_csv(out / "calibration_bias_table.csv", index=False)

    # ---- 6. seasonal calendar + trends -------------------------------------------------
    print("[6/8] seasonal calendar + trend check ...")
    s2 = ser.copy()
    s2["year"] = s2["month"].str[:4].astype(int)
    full_years = [y for y in sorted(s2["year"].unique()) if (s2.query("year==@y and region=='Vietnam'").shape[0] == 12)]
    cal = (s2[s2["year"].isin(full_years)].groupby(["region", "cal_month"])["harmonized"]
           .agg(mean="mean", median="median", sd="std", p10=lambda x: x.quantile(.1), p90=lambda x: x.quantile(.9))
           .reset_index())
    cal["share_of_year_pct"] = 100 * cal["mean"] / cal.groupby("region")["mean"].transform("sum")
    cal.round(2).to_csv(out / "seasonal_calendar.csv", index=False)

    tr_rows = []
    for reg in regions + ["Vietnam"]:
        d = s2[(s2["region"] == reg) & s2["year"].isin(full_years)].groupby("year")[
            ["aqua_observed", "naive_splice", "harmonized"]].sum()
        for col in d.columns:
            y, x = d[col].values, d.index.values.astype(float)
            sl = stats.theilslopes(y, x)[0]
            tau, pv = stats.kendalltau(x, y)
            tr_rows.append(dict(region=reg, series=col, years=f"{int(x.min())}-{int(x.max())}",
                                theil_sen_pct_per_year=round(100 * sl / y.mean(), 2),
                                kendall_tau=round(tau, 2), p_value=round(pv, 3)))
    pd.DataFrame(tr_rows).to_csv(out / "trend_check.csv", index=False)

    # ---- 7. gridded + province outputs (point estimates) ---------------------------------
    print("[7/8] gridded / province outputs ...")
    Vm = V_cd[V_cd["month"] >= first_v].merge(ct, on="cell10")
    Vm = Vm[Vm["month"] <= last_m]
    Vm["cm"] = Vm["month"].dt.month - 1
    ridx = {r: i for i, r in enumerate(regions)}
    Vm["R"] = Rall[Vm["region"].map(ridx).values, Vm["cm"].values]
    Vm["harm"] = Vm[main_col] * Vm["R"]
    gm = Vm.groupby(["cell10", "month"])["harm"].sum().reset_index()
    gm = gm.merge(ct[["cell10", "lat", "lon", "region", "province"]], on="cell10")
    gm["month"] = gm["month"].astype(str)
    gm.round(3).to_csv(out / "grid10km_monthly_harmonized.csv", index=False)
    if masked:
        pm = Vm.groupby(["province", "month"])["harm"].sum().reset_index()
        pm["month"] = pm["month"].astype(str)
        pm.round(2).to_csv(out / "province_monthly_harmonized.csv", index=False)

    # ---- 8. figures ---------------------------------------------------------------------
    print("[8/8] figures ...")
    nat = ser[ser["region"] == "Vietnam"].copy()
    nat["year"] = nat["month"].str[:4].astype(int)
    ann = nat[nat["year"].isin(full_years)].groupby("year")[["aqua_observed", "naive_splice", "harmonized",
                                                           "harmonized_lo", "harmonized_hi"]].sum()
    fig, ax = plt.subplots(1, 2, figsize=(14, 4.8))
    ax[0].plot(ann.index, ann["naive_splice"], "r-o", ms=3, label="naive splice (Aqua -> raw VIIRS)")
    ax[0].plot(ann.index, ann["harmonized"], "b-o", ms=3, label="harmonized (MODIS-equivalent)")
    ax[0].fill_between(ann.index, ann["harmonized_lo"], ann["harmonized_hi"], color="b", alpha=.2, label="95% band")
    ax[0].plot(ann.index, ann["aqua_observed"], "k--", lw=1, label="Aqua observed (reference)")
    ax[0].axvline(2012, color="gray", ls=":")
    ax[0].set_title("Annual fire-active 10 km cell-days"); ax[0].legend(fontsize=8); ax[0].set_ylabel("cell-days")
    r_raw = (nat["snpp_raw"] / nat["aqua_observed"].replace(0, np.nan))
    r_h = (nat["harmonized"] / nat["aqua_observed"].replace(0, np.nan))
    ok = nat["month"] >= str(first_v)
    ax[1].plot(pd.to_datetime(nat.loc[ok, "month"]), r_raw[ok], "r", lw=1, label="raw VIIRS / Aqua")
    ax[1].plot(pd.to_datetime(nat.loc[ok, "month"]), r_h[ok], "b", lw=1, label="harmonized / Aqua")
    ax[1].axhline(1, color="k", lw=.5); ax[1].set_title("Monthly ratio to observed Aqua"); ax[1].legend(fontsize=8)
    plt.tight_layout(); plt.savefig(out / "fig1_raw_vs_harmonized.png", dpi=150); plt.close()

    fig, ax = plt.subplots(1, 2, figsize=(14, 4.8))
    t_idx = np.where(te)[0]
    ax[0].scatter(A[te].sum(1), Hval[te].sum(1), s=14, c="b", label="physics + calibration")
    ax[0].scatter(A[te].sum(1), (Vraw * const)[te].sum(1), s=14, c="orange", marker="x", label="constant ratio")
    ax[0].scatter(A[te].sum(1), Vraw[te].sum(1), s=14, c="r", marker="^", label="raw VIIRS")
    mx = max(A[te].sum(1).max(), Vraw[te].sum(1).max())
    ax[0].plot([0, mx], [0, mx], "k--", lw=.7); ax[0].set_xlabel("Aqua observed"); ax[0].set_ylabel("estimate")
    ax[0].set_title(f"Held-out test months ({args.train_end + 1}+), Vietnam"); ax[0].legend(fontsize=8)
    mm = pd.to_datetime([str(m) for m in months])
    sel = have_v
    ax[1].plot(mm[sel], A.sum(1)[sel], "k", lw=1.2, label="Aqua observed")
    ax[1].plot(mm[sel], Vraw.sum(1)[sel], "r", lw=.8, label="raw VIIRS")
    ax[1].plot(mm[sel], Hpt.sum(1)[sel], "b", lw=1, label="harmonized")
    ax[1].fill_between(mm[sel], nat_lo[sel], nat_hi[sel], color="b", alpha=.2)
    ax[1].axvline(pd.Timestamp(f"{args.train_end + 1}-01-01"), color="gray", ls=":"); ax[1].legend(fontsize=8)
    ax[1].set_title("Monthly series in the overlap period")
    plt.tight_layout(); plt.savefig(out / "fig2_validation.png", dpi=150); plt.close()

    fig, axs = plt.subplots(len(regions) + 1, 1, figsize=(12, 2.6 * (len(regions) + 1)), sharex=True)
    for axx, reg in zip(axs, ["Vietnam"] + regions):
        d = s2[s2["region"] == reg].pivot(index="cal_month", columns="year", values="harmonized")
        im = axx.imshow(np.log1p(d.values), aspect="auto", cmap="YlOrRd", origin="upper")
        axx.set_yticks(range(12)); axx.set_yticklabels(range(1, 13), fontsize=6); axx.set_ylabel(reg, fontsize=8)
        z = s2[s2["region"] == reg].pivot(index="cal_month", columns="year", values="z")
        yy, xx = np.where(np.abs(z.values) >= 2)
        axx.scatter(xx, yy, marker=".", c="k", s=8)
        axx.set_xticks(range(len(d.columns))); axx.set_xticklabels(d.columns, rotation=90, fontsize=7)
    axs[0].set_title("Harmonized fire calendar (month x year, log colour; dots = |z|>=2 anomalies)")
    plt.tight_layout(); plt.savefig(out / "fig3_calendar_heatmap.png", dpi=150); plt.close()

    fig, ax = plt.subplots(figsize=(8, 4.2))
    for ri, reg in enumerate(regions):
        ax.plot(range(1, 13), Rall[ri], marker="o", ms=3, label=reg)
    ax.axhline(1, color="k", lw=.5); ax.set_xlabel("calendar month"); ax.set_ylabel("R = Aqua / predicted")
    ax.set_title("Residual bias after the physical operator (1 = operator is exact)"); ax.legend(fontsize=8)
    plt.tight_layout(); plt.savefig(out / "fig4_calibration_bias.png", dpi=150); plt.close()

    if N_cd is not None:
        Nm = monthly(N_cd[N_cd["month"] >= first_v], ct, ["raw", main_col])
        Nraw = tensor(Nm, regions, months, "raw").sum(1)
        Neq = (tensor(Nm, regions, months, main_col) * Rall[:, cm].T).sum(1)
        okm = (Nraw > 0) & have_v & (mm >= pd.Timestamp("2020-05-01"))
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(mm[okm], A.sum(1)[okm], "k", label="Aqua observed")
        ax.plot(mm[okm], Hpt.sum(1)[okm], "b", label="SNPP -> MODIS-equiv")
        ax.plot(mm[okm], Neq[okm], "g", label="NOAA-20 -> MODIS-equiv (SNPP calibration)")
        ax.plot(mm[okm], Nraw[okm], "r:", label="NOAA-20 raw")
        ax.legend(fontsize=8); ax.set_title("Cross-check: second VIIRS sensor (NOAA-20)")
        plt.tight_layout(); plt.savefig(out / "fig5_n20_crosscheck.png", dpi=150); plt.close()

    # ---- report -------------------------------------------------------------------------
    def mean_yrs(col, a, b):
        return ann.loc[a:b, col].mean()
    jump_n = mean_yrs("naive_splice", 2012, 2016) / mean_yrs("naive_splice", 2007, 2011)
    jump_h = mean_yrs("harmonized", 2012, 2016) / mean_yrs("harmonized", 2007, 2011)
    jump_a = mean_yrs("aqua_observed", 2012, 2016) / mean_yrs("aqua_observed", 2007, 2011)
    vn = val[val.region == "Vietnam"].set_index("method")
    rep = f"""# Harmonization report
Window: {start} .. {last_m} | Target sensor: {args.target} | Vietnam mask: {'yes' if masked else 'NO (CSV bbox)'}
VIIRS confidence kept: {args.viirs_conf} | MODIS min confidence: {args.modis_min_conf} | afternoon passes only

## The 2012 step (mean 2012-16 / mean 2007-11, national annual cell-days)
- naive splice (Aqua -> raw VIIRS): x{jump_n:.2f}
- harmonized: x{jump_h:.2f}
- Aqua observed throughout (reference for the real change): x{jump_a:.2f}

## Held-out validation ({args.train_end + 1}+), national monthly
{vn[['bias_pct', 'wMAPE_pct', 'r_log']].round(2).to_string()}

Files: monthly_series.csv, seasonal_calendar.csv, calibration_bias_table.csv, validation_metrics.csv,
trend_check.csv, grid10km_monthly_harmonized.csv{', province_monthly_harmonized.csv' if masked else ''}, fig1-5 PNG.

## Limits
Hotspot != burned area. No cloud mask in FIRMS: cloud omission is absorbed only on average by the ratio R.
Detection-limit anchors are approximations from Sofiev & Kouznetsov (2026) text; replace with Table 1 if available.
NRT data (no 'type' column) are assumed vegetation fires. MODIS orbits drift in recent years: check Aqua after 2022.
"""
    (out / "report.md").write_text(rep, encoding="utf-8")
    print("\n" + rep)
    print(f"Done. Outputs in {out.resolve()}")


if __name__ == "__main__":
    main()
