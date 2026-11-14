#!/usr/bin/env python3
"""
export_data.py - turn the harmonization outputs into static JSON for the FireForest web app.

READ-ONLY with respect to out/, geometry/ and harmonize/: this script never writes there.
Everything it produces goes to --web (default web/public/data).

    python web/scripts/export_data.py --out out --web web/public/data

Standard library only.  check_outputs.py (which needs pandas + numpy) is run as a child
process with the first interpreter that can import pandas (see --check-python).

Unit everywhere: fire-active 10 km cell-days (>=1 afternoon detection in a 10x10 km cell
on a local date), as defined in harmonize/harmonize_fire_v2.py.
"""
import argparse
import ast
import csv
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

UNIT = "fire-active 10 km cell-days"
GENERATOR = "web/scripts/export_data.py"
PIPELINE = "harmonize/harmonize_fire_v2.py"
REGIONS = ["Vietnam", "South", "Central", "North-Central", "North"]
MAX_BYTES = 2 * 1024 * 1024


# ----------------------------------------------------------------------------- helpers
def die(msg):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(s):
    """CSV cell -> float or None (empty / NaN)."""
    if s is None:
        return None
    s = s.strip()
    if s == "" or s.lower() == "nan":
        return None
    v = float(s)
    return None if math.isnan(v) else v


def rnd(v, nd):
    return None if v is None else round(v, nd)


def boolean(s):
    return str(s).strip().lower() == "true"


def meta(source, **extra):
    m = {"generator": GENERATOR, "pipeline": PIPELINE, "source": source, "unit": UNIT}
    m.update(extra)
    return m


def write_json(path, obj, written):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(txt, encoding="utf-8")
    written.append(path)


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def month_list(first, last):
    y, m = map(int, first.split("-"))
    ly, lm = map(int, last.split("-"))
    out = []
    while (y, m) <= (ly, lm):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


# ----------------------------------------------------------------------------- trend statistics
# Same definitions as harmonize_fire_v2.py step 6 (scipy.stats.theilslopes / kendalltau),
# re-implemented in the standard library so province trends use the identical recipe.
def theil_sen(x, y):
    slopes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x)) for j in range(i + 1, len(x)) if x[j] != x[i]]
    return median(slopes)


def kendall(x, y):
    """Kendall tau-b and two-sided p (exact when there are no ties, as scipy's 'auto' does for n<=33)."""
    n = len(x)
    conc = disc = tx = ty = 0
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = x[j] - x[i], y[j] - y[i]
            if dx == 0 and dy == 0:
                continue
            if dx == 0:
                tx += 1
            elif dy == 0:
                ty += 1
            elif dx * dy > 0:
                conc += 1
            else:
                disc += 1
    tot = n * (n - 1) // 2
    denom = math.sqrt((conc + disc + tx) * (conc + disc + ty))
    tau = (conc - disc) / denom if denom else float("nan")
    if tx == 0 and ty == 0 and n <= 33:
        # Mahonian numbers: number of permutations of n items with k inversions
        dist = [1]
        for m in range(2, n + 1):
            new = [0] * (len(dist) + m - 1)
            for k, c in enumerate(dist):
                for s in range(m):
                    new[k + s] += c
            dist = new
        total = math.factorial(n)
        k = min(disc, tot - disc)
        p = min(1.0, 2.0 * sum(dist[: k + 1]) / total)
    else:
        var = n * (n - 1) * (2 * n + 5) / 18.0
        z = (conc - disc) / math.sqrt(var)
        p = math.erfc(abs(z) / math.sqrt(2))
    return tau, p


def trend_row(years, values):
    x = [float(v) for v in years]
    y = list(values)
    sl = theil_sen(x, y)
    tau, p = kendall(x, y)
    mean = sum(y) / len(y)
    return {
        "years": f"{int(min(x))}-{int(max(x))}",
        "theil_sen_pct_per_year": round(100 * sl / mean, 2) if mean else None,
        "kendall_tau": round(tau, 2),
        "p_value": round(p, 3),
    }


# ----------------------------------------------------------------------------- geometry
def _perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts[:]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = _perp(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, tol, nd):
    s = douglas_peucker(ring, tol)
    if len(s) < 4:                    # tiny islands (e.g. Hoang Sa / Truong Sa): never drop, keep a coarser ring
        s = douglas_peucker(ring, tol / 20) if len(ring) >= 4 else ring
    out = []
    for x, y in s:
        q = [round(x, nd), round(y, nd)]
        if not out or q != out[-1]:
            out.append(q)
    if out[0] != out[-1]:
        out.append(out[0])
    if len(out) < 4:                  # degenerate after rounding: fall back to the unsimplified rounded ring
        out = [[round(x, nd), round(y, nd)] for x, y in ring]
    return out


def simplify_geometry(g, tol, nd):
    if g["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [simplify_ring(r, tol, nd) for r in g["coordinates"]]}
    if g["type"] == "MultiPolygon":
        return {"type": "MultiPolygon",
                "coordinates": [[simplify_ring(r, tol, nd) for r in poly] for poly in g["coordinates"]]}
    die(f"unsupported geometry type {g['type']}")


def geom_points(g):
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        for ring in poly:
            for p in ring:
                yield p


def bbox(g):
    xs, ys = zip(*geom_points(g))
    return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]


# ----------------------------------------------------------------------------- source parsing
def parse_report(path):
    txt = path.read_text(encoding="utf-8")
    def grab(pat):
        m = re.search(pat, txt)
        if not m:
            die(f"could not find /{pat}/ in {path}")
        return float(m.group(1))
    out = {
        "step_naive_splice": grab(r"naive splice \(Aqua -> raw VIIRS\): x([\d.]+)"),
        "step_harmonized": grab(r"- harmonized: x([\d.]+)"),
        "step_aqua_observed": grab(r"Aqua observed throughout[^:]*: x([\d.]+)"),
    }
    for name in ("raw VIIRS", "constant ratio", "physics \\+ calibration"):
        m = re.search(rf"^{name}\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$", txt, re.M)
        if not m:
            die(f"could not find validation row '{name}' in {path}")
        key = name.replace("\\", "")
        out[f"bias_pct::{key}"] = float(m.group(1))
        out[f"wMAPE_pct::{key}"] = float(m.group(2))
        out[f"r_log::{key}"] = float(m.group(3))
    return out


def parse_pipeline(path):
    """Read harmonize_fire_v2.py as text (ast, never imported)."""
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    doc = ast.get_docstring(tree, clean=True)
    # the module docstring line by line, with its line numbers in the source (for verbatim quotes)
    dnode = tree.body[0]
    doc_lines = []
    if isinstance(dnode, ast.Expr) and isinstance(getattr(dnode, "value", None), ast.Constant):
        for ln in range(dnode.lineno, dnode.end_lineno + 1):
            txt = src.splitlines()[ln - 1].replace('"""', "").rstrip()
            doc_lines.append({"line": ln, "text": txt})

    def literal(node):
        try:
            return ast.literal_eval(node)
        except Exception:
            return None

    constants = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                names = [t] if isinstance(t, ast.Name) else (t.elts if isinstance(t, ast.Tuple) else [])
                vals = [node.value] if isinstance(t, ast.Name) else (
                    node.value.elts if isinstance(node.value, ast.Tuple) else [])
                for n_, v_ in zip(names, vals):
                    if isinstance(n_, ast.Name) and n_.id.isupper():
                        constants[n_.id] = {"value": literal(v_), "source": ast.get_source_segment(src, v_),
                                            "line": node.lineno}
    # inline comments on the constant lines (they carry the citations)
    lines = src.splitlines()
    for k, c in constants.items():
        ln = lines[c["line"] - 1]
        if "#" in ln:
            c["comment"] = ln.split("#", 1)[1].strip()

    functions = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            a = node.args
            defaults = [None] * (len(a.args) - len(a.defaults)) + list(a.defaults)
            params = []
            for arg, d in zip(a.args, defaults):
                params.append({"name": arg.arg, "default": None if d is None else literal(d),
                               "default_source": None if d is None else ast.get_source_segment(src, d)})
            functions.append({"name": node.name, "line": node.lineno, "params": params,
                              "signature": f"{node.name}({', '.join(p['name'] + ('=' + p['default_source'] if p['default_source'] else '') for p in params)})",
                              "docstring": ast.get_docstring(node, clean=True)})

    arguments = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "add_argument":
            flag = literal(node.args[0]) if node.args else None
            kw = {k.arg: k.value for k in node.keywords}
            arguments.append({
                "flag": flag,
                "default": literal(kw["default"]) if "default" in kw else None,
                "default_source": ast.get_source_segment(src, kw["default"]) if "default" in kw else None,
                "type": ast.get_source_segment(src, kw["type"]) if "type" in kw else None,
                "action": literal(kw["action"]) if "action" in kw else None,
                "help": literal(kw["help"]) if "help" in kw else None,
                "line": node.lineno,
            })

    m = re.search(r'first_v\s*=\s*pd\.Period\("(\d{4}-\d{2})", "M"\)\s*(#.*)?', src)
    viirs_start = {"value": m.group(1), "comment": (m.group(2) or "").lstrip("# ").strip(),
                   "line": src[: m.start()].count("\n") + 1} if m else None
    m = re.search(r"Rs = R_E \+ H_MODIS[\s\S]*?area = (.*?)\s*#\s*(.*)", src)
    return {
        "path": PIPELINE,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "lines": len(lines),
        "docstring": doc,
        "docstring_lines": doc_lines,
        "constants": constants,
        "functions": functions,
        "arguments": arguments,
        "viirs_start": viirs_start,
        "pixel_area_formula": {"source": m.group(1), "comment": m.group(2)} if m else None,
    }


# ----------------------------------------------------------------------------- check_outputs.py
def find_python(preferred):
    cands = [preferred] if preferred else []
    cands += [[sys.executable]]
    if shutil.which("py"):
        cands += [["py", "-3"]]
    for c in ("python3", "python"):
        if shutil.which(c):
            cands.append([c])
    tried = []
    for c in cands:
        if c in tried:
            continue
        tried.append(c)
        try:
            r = subprocess.run(c + ["-c", "import pandas, numpy"], capture_output=True, timeout=60)
            if r.returncode == 0:
                return c
        except Exception:
            pass
    die("check_outputs.py needs pandas + numpy, and no interpreter tried could import them: "
        + ", ".join(" ".join(c) for c in tried) + ".  Pass --check-python <path>.")


LINE_RE = re.compile(r"^(PASS|FAIL)  (.*?)(?:  \[(.*)\])?$")


def run_checks(root, out_dir, py):
    cmd = py + [str(root / "harmonize" / "check_outputs.py"), "--out", str(out_dir)]
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    r = subprocess.run(cmd, capture_output=True, cwd=root, env=env, timeout=600)
    raw = r.stdout.decode("utf-8", errors="replace").replace("\r\n", "\n")
    err = r.stderr.decode("utf-8", errors="replace").replace("\r\n", "\n")
    items, summary = [], None
    for ln in raw.split("\n"):
        if not ln.strip():
            continue
        m = LINE_RE.match(ln)
        if m:
            items.append({"status": m.group(1), "name": m.group(2).strip(), "detail": m.group(3), "extra": []})
        elif ln.startswith("INFO  "):
            items.append({"status": "INFO", "name": ln[6:].strip(), "detail": None, "extra": []})
        elif ln.startswith("ALL CHECKS PASSED") or re.match(r"^\d+ CHECK\(S\) FAILED", ln):
            summary = ln.strip()
        elif items:
            items[-1]["extra"].append(ln)
        else:
            items.append({"status": "OTHER", "name": ln, "detail": None, "extra": []})
    n_pass = sum(i["status"] == "PASS" for i in items)
    n_fail = sum(i["status"] == "FAIL" for i in items)
    shown = ["python" if Path(c).name.lower().startswith("python") else c for c in py[:1]] + py[1:]
    return {
        "meta": {"generator": GENERATOR, "script": "harmonize/check_outputs.py",
                 "command": " ".join(shown + ["harmonize/check_outputs.py", "--out", "out"])},
        "exit_code": r.returncode,
        "n_checks": n_pass + n_fail,
        "n_pass": n_pass,
        "n_fail": n_fail,
        "summary": summary,
        "all_passed": summary == "ALL CHECKS PASSED" and n_fail == 0 and r.returncode == 0,
        "items": items,
        "stdout": raw,
        "stderr": err,
    }


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="out", help="pipeline output folder (read only)")
    ap.add_argument("--web", default="web/public/data", help="destination for the JSON files")
    ap.add_argument("--geometry", default="geometry/vietnam_adm1.geojson", help="ADM1 boundaries (read only)")
    ap.add_argument("--pipeline", default=PIPELINE, help="pipeline source, parsed as text")
    ap.add_argument("--check-python", default=None,
                    help="interpreter with pandas+numpy for check_outputs.py (default: auto-detect)")
    ap.add_argument("--simplify", type=float, default=0.004, help="Douglas-Peucker tolerance in degrees")
    ap.add_argument("--skip-checks", action="store_true", help="do not run check_outputs.py")
    a = ap.parse_args()
    for s in (sys.stdout, sys.stderr):              # Windows consoles default to cp1252; names have diacritics
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    root = Path.cwd()
    out = Path(a.out)
    web = Path(a.web)
    if not (out / "monthly_series.csv").exists():
        die(f"{out}/monthly_series.csv not found - run from the repo root.")
    if web.resolve() == out.resolve() or out.resolve() in web.resolve().parents:
        die("--web must not be inside --out (this script never writes to out/).")
    written = []

    # ---------------------------------------------------------------- national.json
    print("[1/9] national.json")
    ms = read_csv(out / "monthly_series.csv")
    months = sorted({r["month"] for r in ms})
    if months != month_list(months[0], months[-1]):
        die("monthly_series.csv months are not contiguous")
    midx = {m: i for i, m in enumerate(months)}
    viirs_start = "2012-02"
    src_regions = sorted({r["region"] for r in ms})
    if set(src_regions) != set(REGIONS):
        die(f"unexpected regions {src_regions}")
    cols = {"aqua_observed": "aqua_observed", "snpp_raw": "snpp_raw", "naive_splice": "naive_splice",
            "harmonized": "harmonized", "lo": "harmonized_lo", "hi": "harmonized_hi"}
    nat = {}
    for reg in REGIONS:
        d = {k: [None] * len(months) for k in list(cols) + ["z", "anomaly", "aqua_gap"]}
        nat[reg] = d
    seen = set()
    for r in ms:
        reg, i = r["region"], midx[r["month"]]
        if (reg, i) in seen:
            die(f"duplicate row {reg} {r['month']}")
        seen.add((reg, i))
        d = nat[reg]
        for k, c in cols.items():
            d[k][i] = rnd(num(r[c]), 1)
        if r["month"] < viirs_start:
            d["snpp_raw"][i] = None              # pipeline stores 0 before VIIRS; null = "no VIIRS yet"
        d["z"][i] = rnd(num(r["z"]), 2)
        d["anomaly"][i] = r["anomaly"].strip() or None
        d["aqua_gap"][i] = boolean(r["aqua_gap"])
    if len(seen) != len(REGIONS) * len(months):
        die("monthly_series.csv is missing region-months")
    write_json(web / "national.json", {
        "meta": meta("out/monthly_series.csv", first_month=months[0], last_month=months[-1],
                     viirs_start=viirs_start, regions=REGIONS,
                     notes=["Cell-day values rounded to 1 decimal; z keeps the 2 decimals of the CSV.",
                            "snpp_raw is null before 2012-02 (the CSV stores 0 there: no VIIRS data yet).",
                            "lo/hi = harmonized_lo/harmonized_hi, the 95% bootstrap band; before 2012-02 they "
                            "equal Aqua observed.",
                            "aqua_observed is null in Aqua gap months; harmonized is VIIRS-filled there."]),
        "months": months,
        "regions": nat,
    }, written)

    # ---------------------------------------------------------------- grid (read once)
    print("[2/9] grid10km")
    grid = read_csv(out / "grid10km_monthly_harmonized.csv")
    cells = {}
    by_year = defaultdict(list)
    for r in grid:
        cid = int(r["cell10"])
        lat, lon = float(r["lat"]), float(r["lon"])
        c = cells.get(cid)
        if c is None:
            c = cells[cid] = {"cell10": cid, "lat": round(lat, 3), "lon": round(lon, 3),
                              "province": r["province"], "region": r["region"], "sum": 0.0, "n": 0}
        elif c["province"] != r["province"] or c["region"] != r["region"]:
            die(f"cell {cid} has inconsistent province/region")
        h = float(r["harm"])
        c["sum"] += h
        c["n"] += 1
        c["max"] = max(c.get("max", 0.0), h)
        y, m = int(r["month"][:4]), int(r["month"][5:7])
        by_year[y].append((m - 1, c["lat"], c["lon"], round(h, 3)))
    grid_months = sorted({r["month"] for r in grid})
    g_first, g_last = grid_months[0], grid_months[-1]
    n_grid_months = len(month_list(g_first, g_last))
    order = sorted(cells.values(), key=lambda c: (c["lat"], c["lon"]))     # south -> north
    cell_index = {c["cell10"]: i for i, c in enumerate(order)}

    # province -> region shares (by cell-days), from the grid
    prov_reg = defaultdict(lambda: defaultdict(float))
    prov_cells = defaultdict(int)
    for c in order:
        prov_reg[c["province"]][c["region"]] += c["sum"]
        prov_cells[c["province"]] += 1

    # ---------------------------------------------------------------- provinces.json
    print("[3/9] provinces.json")
    pm = read_csv(out / "province_monthly_harmonized.csv")
    p_months = sorted({r["month"] for r in pm})
    if p_months != month_list(p_months[0], p_months[-1]):
        die("province months are not contiguous")
    pidx = {m: i for i, m in enumerate(p_months)}
    provs = defaultdict(lambda: {"harmonized": [None] * len(p_months), "lo": [None] * len(p_months),
                                 "hi": [None] * len(p_months)})
    for r in pm:
        p = provs[r["province"]]
        i = pidx[r["month"]]
        p["harmonized"][i] = num(r["harmonized"])
        p["lo"][i] = num(r["harmonized_lo"])
        p["hi"][i] = num(r["harmonized_hi"])
    full_years = [y for y in sorted({int(m[:4]) for m in p_months})
                  if all(f"{y}-{mm:02d}" in pidx for mm in range(1, 13))]
    plist = []
    for name in sorted(provs):
        p = provs[name]
        if any(v is None for k in ("harmonized", "lo", "hi") for v in p[k]):
            die(f"province {name} has missing months")
        total = sum(p["harmonized"])
        # mean by calendar month over all available months (same recipe as check_outputs.py)
        cm = defaultdict(list)
        for m, v in zip(p_months, p["harmonized"]):
            cm[int(m[5:7])].append(v)
        cm_mean = {k: sum(v) / len(v) for k, v in cm.items()}
        peak = max(cm_mean, key=cm_mean.get)
        ann = [sum(p["harmonized"][pidx[f"{y}-{mm:02d}"]] for mm in range(1, 13)) for y in full_years]
        shares = prov_reg.get(name, {})
        tot_s = sum(shares.values())
        reg_share = {k: round(v / tot_s, 3) for k, v in sorted(shares.items(), key=lambda kv: -kv[1])} if tot_s else {}
        widths = [(h - l) / h for h, l in zip(p["hi"], p["lo"]) if h >= 1]
        plist.append({
            "name": name,
            "region": next(iter(reg_share), None),
            "region_share": reg_share,
            "n_cells": prov_cells.get(name, 0),
            "total": round(total, 1),
            "total_lo": round(sum(p["lo"]), 1),
            "total_hi": round(sum(p["hi"]), 1),
            "peak_month": peak,
            "peak_month_mean": round(cm_mean[peak], 2),
            "calendar_mean": [round(cm_mean[k], 2) for k in range(1, 13)],
            "annual": {"years": full_years, "values": [round(v, 1) for v in ann]},
            "trend": trend_row(full_years, ann) if len(full_years) >= 5 and sum(ann) > 0 else None,
            "band_rel_width_median": round(median(widths), 3) if widths else None,
            "harmonized": [round(v, 2) for v in p["harmonized"]],
            "lo": [round(v, 2) for v in p["lo"]],
            "hi": [round(v, 2) for v in p["hi"]],
        })
    for rank, p in enumerate(sorted(plist, key=lambda p: -p["total"]), 1):
        p["rank_total"] = rank
    write_json(web / "provinces.json", {
        "meta": meta("out/province_monthly_harmonized.csv", first_month=p_months[0], last_month=p_months[-1],
                     n_provinces=len(plist), full_years=full_years,
                     notes=["Monthly values rounded to 2 decimals (CSV precision).",
                            "region = macro region holding the largest share of the province's cell-days "
                            "(regions are latitude bands; region_share lists every band the province touches, "
                            "from grid10km_monthly_harmonized.csv).",
                            "peak_month: calendar month (1-12) with the highest mean monthly value over "
                            f"{p_months[0]}..{p_months[-1]}, same recipe as check_outputs.py.",
                            "trend: Theil-Sen % per year and Kendall tau on annual sums of full years, same "
                            "definition as trend_check.csv (computed here, not by the pipeline).",
                            "band_rel_width_median: median (hi-lo)/harmonized over months with harmonized >= 1.",
                            "Bands reflect calibration + operator uncertainty (shared across provinces), not "
                            "local sampling noise (report.md)."]),
        "months": p_months,
        "provinces": plist,
    }, written)

    # ---------------------------------------------------------------- grid files
    print("[4/9] grid/<YYYY>.json, grid_cells.json, grid_march.json")
    for y in sorted(by_year):
        rows = sorted(by_year[y])
        write_json(web / "grid" / f"{y}.json", {
            "meta": meta("out/grid10km_monthly_harmonized.csv", year=y,
                         columns=["lat", "lon", "month_index", "harm"],
                         month_index="calendar month 0-11 (0 = January)",
                         notes=["Point estimate only (no band at cell level).",
                                "Only cell-months with harm > 0 are listed; absent = 0.",
                                f"Grid exists from {g_first} (VIIRS era) to {g_last}."]),
            "rows": [[la, lo, m, h] for m, la, lo, h in rows],
        }, written)
    write_json(web / "grid_cells.json", {
        "meta": meta("out/grid10km_monthly_harmonized.csv",
                     columns=["cell10", "lat", "lon", "province", "region", "mean_monthly", "total"],
                     first_month=g_first, last_month=g_last, n_months=n_grid_months, n_cells=len(order),
                     max_monthly=round(max(c["max"] for c in order), 3),
                     cell_km=10, km_per_degree=parse_pipeline(Path(a.pipeline))["constants"]["KM_DEG"]["value"],
                     notes=["Cells ordered south -> north, then west -> east; grid_march.json uses this order.",
                            f"mean_monthly = total / {n_grid_months} months ({g_first}..{g_last}), months "
                            "without detections count as 0.", "Point estimates."]),
        "cells": [[c["cell10"], c["lat"], c["lon"], c["province"], c["region"],
                   round(c["sum"] / n_grid_months, 3), round(c["sum"], 2)] for c in order],
    }, written)
    march_years = sorted(y for y in by_year if f"{y}-03" >= g_first and f"{y}-03" <= g_last)
    mv = {y: [0.0] * len(order) for y in march_years}
    for r in grid:
        if r["month"][5:7] == "03":
            mv[int(r["month"][:4])][cell_index[int(r["cell10"])]] = round(float(r["harm"]), 3)
    write_json(web / "grid_march.json", {
        "meta": meta("out/grid10km_monthly_harmonized.csv", month="March", years=march_years,
                     notes=["values[k][i] = harm of cell grid_cells.cells[i] in March of years[k]; 0 = no "
                            "detection.", "Point estimate (no band at cell level)."]),
        "years": march_years,
        "values": [mv[y] for y in march_years],
    }, written)

    # ---------------------------------------------------------------- seasonal.json
    print("[5/9] seasonal.json")
    sc = read_csv(out / "seasonal_calendar.csv")
    seas = defaultdict(list)
    for r in sorted(sc, key=lambda r: (r["region"], int(r["cal_month"]))):
        seas[r["region"]].append({"cal_month": int(r["cal_month"]), "mean": rnd(num(r["mean"]), 1),
                                  "median": rnd(num(r["median"]), 1), "sd": rnd(num(r["sd"]), 1),
                                  "p10": rnd(num(r["p10"]), 1), "p90": rnd(num(r["p90"]), 1),
                                  "share_of_year_pct": rnd(num(r["share_of_year_pct"]), 2)})
    write_json(web / "seasonal.json", {
        "meta": meta("out/seasonal_calendar.csv",
                     notes=["Statistics of monthly harmonized cell-days by calendar month, full calendar years "
                            "only (pipeline step 6)."]),
        "regions": {reg: seas[reg] for reg in REGIONS if reg in seas},
    }, written)

    # ---------------------------------------------------------------- trust.json
    print("[6/9] trust.json")
    val = read_csv(out / "validation_metrics.csv")
    trend = read_csv(out / "trend_check.csv")
    cal = read_csv(out / "calibration_bias_table.csv")
    ov = read_csv(out / "aqua_overpass_by_year.csv")
    gap = read_csv(out / "aqua_gap_report.csv")
    cal_regions = [r for r in REGIONS if r != "Vietnam"]
    R = {reg: [None] * 12 for reg in cal_regions}
    for r in cal:
        R[r["region"]][int(r["calendar_month"]) - 1] = num(r["R_aqua_over_predicted"])
    gap_rows = [{"month": r["month"], "aqua_days": int(float(r["aqua_days"])),
                 "snpp_days": int(float(r["snpp_days"])), "coverage": num(r["coverage"]),
                 "gap": boolean(r["gap"])} for r in gap]
    pipe = parse_pipeline(Path(a.pipeline))
    argd = {x["flag"]: x["default"] for x in pipe["arguments"]}
    write_json(web / "trust.json", {
        "meta": {"generator": GENERATOR, "pipeline": PIPELINE, "unit": UNIT,
                 "sources": {"validation": "out/validation_metrics.csv", "trend": "out/trend_check.csv",
                             "calibration_R": "out/calibration_bias_table.csv",
                             "overpass": "out/aqua_overpass_by_year.csv", "aqua_gap": "out/aqua_gap_report.csv"}},
        "validation": {
            "train_end": argd.get("--train-end"),
            "note": "Fit on months <= train_end, test on later complete years against Aqua observed "
                    "(gap months excluded); national = sum of regions.",
            "rows": [{"region": r["region"], "method": r["method"], "bias_pct": rnd(num(r["bias_pct"]), 2),
                      "wMAPE_pct": rnd(num(r["wMAPE_pct"]), 2), "r_log": rnd(num(r["r_log"]), 3)} for r in val],
        },
        "trend": [{"region": r["region"], "series": r["series"], "years": r["years"],
                   "theil_sen_pct_per_year": num(r["theil_sen_pct_per_year"]),
                   "kendall_tau": num(r["kendall_tau"]), "p_value": num(r["p_value"])} for r in trend],
        "calibration_R": {"regions": cal_regions, "calendar_months": list(range(1, 13)), "R": R,
                          "calib_end": argd.get("--calib-end"),
                          "note": "R = Aqua observed / predicted; 1 means the physical operator was exact."},
        "overpass": {"note": "Median local (UTC+7) acquisition time of Aqua afternoon detections, decimal hours "
                             "(13.5 = 13:30). Scene-mix dependent.",
                     "rows": [{"year": int(r["ldate"]), "median_local_hour": num(r["median_local_hour_aqua"])}
                              for r in ov]},
        "aqua_gap": {"months": [g["month"] for g in gap_rows if g["gap"]],
                     "flagged": [g for g in gap_rows if g["gap"]],
                     "columns": ["month", "aqua_days", "snpp_days", "coverage", "gap"],
                     "report": [[g["month"], g["aqua_days"], g["snpp_days"], g["coverage"], g["gap"]]
                                for g in gap_rows]},
    }, written)

    # ---------------------------------------------------------------- kpi.json (+ assert vs report.md)
    print("[7/9] kpi.json")
    vn = nat["Vietnam"]
    ann = defaultdict(dict)
    for col in ("naive_splice", "harmonized", "aqua_observed"):
        raw = defaultdict(list)
        for r in ms:
            if r["region"] == "Vietnam":
                raw[int(r["month"][:4])].append(num(r[col]))
        for y, vals in raw.items():
            # pandas .sum(min_count=12) on full calendar years, as in the pipeline
            ann[col][y] = sum(vals) if len(vals) == 12 and all(v is not None for v in vals) else None

    def mean_years(col, y0, y1):
        v = [ann[col][y] for y in range(y0, y1 + 1) if ann[col].get(y) is not None]
        return sum(v) / len(v), len(v)

    step = {}
    for col in ("naive_splice", "harmonized", "aqua_observed"):
        after, na = mean_years(col, 2012, 2016)
        before, nb = mean_years(col, 2007, 2011)
        step[col] = {"ratio": round(after / before, 4), "mean_2012_2016": round(after, 1),
                     "mean_2007_2011": round(before, 1), "years_used": [nb, na]}
    tv = {(r["series"]): r for r in trend if r["region"] == "Vietnam"}
    vv = {r["method"]: r for r in val if r["region"] == "Vietnam"}

    # recompute the national trend with this script's Theil-Sen/Kendall to prove the recipe matches
    recheck = {}
    for col in ("aqua_observed", "naive_splice", "harmonized"):
        yrs = [y for y in sorted(ann[col]) if ann[col][y] is not None and int(tv[col]["years"][:4]) <= y
               <= int(tv[col]["years"][5:])]
        recheck[col] = trend_row(yrs, [ann[col][y] for y in yrs])

    rep = parse_report(out / "report.md")
    checks = [
        ("2012 step, naive splice", step["naive_splice"]["ratio"], rep["step_naive_splice"], 0.006),
        ("2012 step, harmonized", step["harmonized"]["ratio"], rep["step_harmonized"], 0.006),
        ("2012 step, Aqua observed", step["aqua_observed"]["ratio"], rep["step_aqua_observed"], 0.006),
    ]
    for mth in ("raw VIIRS", "constant ratio", "physics + calibration"):
        checks.append((f"held-out bias, {mth}", num(vv[mth]["bias_pct"]), rep[f"bias_pct::{mth}"], 0.006))
        checks.append((f"held-out wMAPE, {mth}", num(vv[mth]["wMAPE_pct"]), rep[f"wMAPE_pct::{mth}"], 0.006))
    for col in ("aqua_observed", "naive_splice", "harmonized"):
        for k, tol in (("theil_sen_pct_per_year", 0.006), ("kendall_tau", 0.006), ("p_value", 0.0011)):
            checks.append((f"trend {col} {k} (recomputed vs trend_check.csv)", recheck[col][k],
                           num(tv[col][k]), tol))
    bad = [(n, got, exp) for n, got, exp, tol in checks if abs(got - exp) > tol]
    for n, got, exp, tol in checks:
        print(f"      {'ok ' if abs(got - exp) <= tol else 'BAD'} {n}: computed {got} vs source {exp}")
    if bad:
        die("kpi.json does not match report.md / trend_check.csv:\n" +
            "\n".join(f"  {n}: computed {g} vs {e}" for n, g, e in bad) + "\nNothing was written for kpi.json.")

    def trend_obj(col):
        r = tv[col]
        return {"theil_sen_pct_per_year": num(r["theil_sen_pct_per_year"]), "kendall_tau": num(r["kendall_tau"]),
                "p_value": num(r["p_value"]), "years": r["years"]}

    def val_obj(mth):
        r = vv[mth]
        return {"bias_pct": round(num(r["bias_pct"]), 2), "wMAPE_pct": round(num(r["wMAPE_pct"]), 2),
                "r_log": round(num(r["r_log"]), 3)}

    write_json(web / "kpi.json", {
        "meta": {"generator": GENERATOR, "pipeline": PIPELINE, "unit": UNIT,
                 "sources": {"step_2012": "out/monthly_series.csv (region = Vietnam)",
                             "trend": "out/trend_check.csv (region = Vietnam)",
                             "held_out": "out/validation_metrics.csv (region = Vietnam)"},
                 "verified_against": "out/report.md",
                 "notes": ["step_2012 = mean annual national cell-days 2012-2016 / mean 2007-2011, full calendar "
                           "years (computed here, asserted equal to report.md).",
                           f"held_out: fit <= {argd.get('--train-end')}, test {argd.get('--train-end') + 1}+; "
                           "the 'naive' comparison is raw VIIRS, not constant ratio.",
                           "constant_ratio is reported for honesty: it has the smaller national bias, the "
                           "physics + calibration method has the smaller wMAPE and smaller regional biases."]},
        "step_2012": step,
        "windows": {
            "step_before": [2007, 2011], "step_after": [2012, 2016],
            "calibration": [int(viirs_start[:4]), argd.get("--calib-end")],
            "train": [int(viirs_start[:4]), argd.get("--train-end")],
            # same rule as the pipeline: test = complete years after train_end
            "test": [argd.get("--train-end") + 1,
                     int(months[-1][:4]) - (0 if months[-1][5:] == "12" else 1)],
        },
        "annual_national": {col: {str(y): (None if v is None else round(v, 1)) for y, v in sorted(ann[col].items())}
                            for col in ann},
        "trend": {col: trend_obj(col) for col in ("naive_splice", "harmonized", "aqua_observed")},
        "held_out": {"raw_viirs": val_obj("raw VIIRS"), "constant_ratio": val_obj("constant ratio"),
                     "physics_calibration": val_obj("physics + calibration")},
        "headline": {
            "step": {"naive": step["naive_splice"]["ratio"], "harmonized": step["harmonized"]["ratio"],
                     "aqua_observed": step["aqua_observed"]["ratio"]},
            "trend_pct_per_year": {"naive": num(tv["naive_splice"]["theil_sen_pct_per_year"]),
                                   "harmonized": num(tv["harmonized"]["theil_sen_pct_per_year"])},
            "held_out_bias_pct": {"naive": round(num(vv["raw VIIRS"]["bias_pct"]), 2),
                                  "naive_label": "raw VIIRS",
                                  "harmonized": round(num(vv["physics + calibration"]["bias_pct"]), 2)},
        },
    }, written)

    # ---------------------------------------------------------------- provinces.geojson
    print("[8/9] provinces.geojson")
    gj = json.loads(Path(a.geometry).read_text(encoding="utf-8"))
    pnames = {p["name"] for p in plist}
    pinfo = {p["name"]: p for p in plist}
    feats, geo_names = [], []
    offshore = []
    for f in gj["features"]:
        pr = f["properties"]
        name = str(pr.get("shapeName", "")).strip()
        geo_names.append(name)
        g = simplify_geometry(f["geometry"], a.simplify, 3)
        parts = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        far = [poly for poly in parts if min(p[0] for p in poly[0]) > 110.5]      # east of 110.5E: archipelagos
        if far:
            offshore.append((name, len(far), bbox({"type": "MultiPolygon", "coordinates": far})))
        feats.append({"type": "Feature",
                      "properties": {"name": name, "iso": pr.get("shapeISO"),
                                     "region": pinfo[name]["region"] if name in pinfo else None,
                                     "has_data": name in pnames,
                                     "offshore_parts": len(far)},
                      "bbox": bbox(g), "geometry": g})
    unmatched_geo = sorted(set(geo_names) - pnames)
    unmatched_csv = sorted(pnames - set(geo_names))
    write_json(web / "provinces.geojson", {
        "type": "FeatureCollection",
        "meta": {"generator": GENERATOR, "source": a.geometry.replace("\\", "/"),
                 "origin": "geoBoundaries gbOpen VNM ADM1",
                 "simplify": f"Douglas-Peucker per ring, tolerance {a.simplify} deg, coordinates rounded to 3 "
                             "decimals; rings are never dropped (small islands kept).",
                 "offshore": [{"province": n, "parts": k, "bbox": b} for n, k, b in offshore],
                 "unmatched_geojson_names": unmatched_geo, "unmatched_csv_names": unmatched_csv},
        "features": feats,
    }, written)

    # ---------------------------------------------------------------- method.json + checks.json
    print("[9/9] method.json, checks.json")
    write_json(web / "method.json", {"meta": {"generator": GENERATOR,
                                              "note": "Parsed from the pipeline source with ast; never imported."},
                                     **pipe}, written)
    chk = None
    if not a.skip_checks:
        py = find_python([a.check_python] if a.check_python else None)
        print("      running check_outputs.py with:", " ".join(py))
        chk = run_checks(root, out, py)
        write_json(web / "checks.json", chk, written)

    # ---------------------------------------------------------------- report
    print("\nFiles written:")
    total, too_big = 0, []
    for p in sorted(written, key=lambda p: str(p)):
        s = p.stat().st_size
        total += s
        flag = "  > 2 MB!" if s > MAX_BYTES else ""
        if flag:
            too_big.append(p)
        print(f"  {s / 1024:9.1f} KB  {p.as_posix()}{flag}")
    print(f"  {total / 1024:9.1f} KB  total ({len(written)} files)")

    print("\nGeometry:")
    print("  geojson names without province data:", unmatched_geo or "none")
    print("  CSV provinces without geometry      :", unmatched_csv or "none")
    for n, k, b in offshore:
        print(f"  offshore parts in {n}: {k} polygons, bbox {b}")
    print(f"\nProvinces: {len(plist)} | grid cells: {len(order)} | grid years: {min(by_year)}-{max(by_year)}")
    if chk:
        print(f"check_outputs.py: {chk['n_pass']} PASS / {chk['n_fail']} FAIL, exit {chk['exit_code']}, "
              f"last line: {chk['summary']!r}")
    if too_big:
        die("some files exceed 2 MB: " + ", ".join(p.name for p in too_big))
    if chk and (not chk["all_passed"] or chk["n_checks"] != 10):
        die(f"check_outputs.py did not report 10/10 PASS (got {chk['n_pass']}/{chk['n_checks']}); "
            "checks.json was written with the verbatim output.")


if __name__ == "__main__":
    main()
