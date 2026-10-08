"""Run the supplied finance calculation without accepting executable remote files."""
import datetime as dt
import json
import os
import re
import runpy
import sys
import math
import pandas as pd

base = os.path.dirname(os.path.abspath(__file__))
extracts = os.path.join(base, "extracts")
files = sorted(f for f in os.listdir(extracts) if re.fullmatch(r"(RA|PCS)_\d{2}-\d{2}-\d{4}\.csv", f))
if not files:
    raise SystemExit("No RA/PCS extract files found.")
dates = {f[3:] if f.startswith("RA_") else f[4:] for f in files}
complete = []
warnings = []
for date in dates:
    if "RA_" + date not in files or "PCS_" + date not in files:
        warnings.append("Skipped incomplete RA/PCS pair for " + date[:-4])
        continue
    complete.append(dt.datetime.strptime(date[:-4], "%d-%m-%Y").date())
if len(complete) < 2:
    raise SystemExit("At least two complete weekly snapshot pairs are required.")
cw = max(complete)
quarter = "Q%d-%02d" % ((cw.month - 1) // 3 + 1, cw.year % 100)
config_path = os.path.join(base, "reporting_config.json")
if os.path.exists(config_path):
    with open(config_path) as f:
        quarter = json.load(f).get("quarter") or quarter
if not re.fullmatch(r"Q[1-4]-\d{2}", quarter):
    raise SystemExit("Invalid reporting quarter in reporting_config.json")
with open(os.path.join(base, "refs_edwh.json")) as f:
    refs = json.load(f)
reference_available = quarter in refs
if not reference_available:
    warnings.append("Missing " + quarter + " EDWH targets and prior-year references. These comparisons are N/A; current and prior snapshot analysis uses the latest extracts.")
expected = {s + "|" + r for s in ("Real Assets", "Private Capital Solutions") for r in ("EMEA", "Americas", "APAC")}
if reference_available and not expected.issubset(refs[quarter]):
    raise SystemExit("Incomplete EDWH segment/region references for " + quarter)
required_refs = {"q4New", "q4Can", "q4OT", "tNew", "tCan", "tOT", "tNN", "tTNN", "gT"}
for key in expected if reference_available else []:
    block = refs[quarter][key]
    if not isinstance(block, dict) or not required_refs.issubset(block):
        raise SystemExit("Incomplete EDWH reference measures for " + quarter)
    if any(isinstance(block[k], bool) or not isinstance(block[k], (int, float)) or not math.isfinite(block[k]) for k in required_refs):
        raise SystemExit("Invalid numeric values in EDWH reference measures for " + quarter)
numeric = ["New Actual", "New Open Opportunities", "Cancel Actual", "Cancels Open Opportunities", "One Time Actual", "One Time Open Opportunities"]
for name in files:
    date = name.split("_", 1)[1][:-4]
    if dt.datetime.strptime(date, "%d-%m-%Y").date() not in complete:
        continue
    data = pd.read_csv(os.path.join(extracts, name), dtype=str, keep_default_na=False)
    if data.empty:
        raise SystemExit("Empty extract: " + name)
    for col in numeric:
        if col not in data.columns:
            raise SystemExit("Missing numeric column in " + name + ": " + col)
        values = data[col].replace("", "0")
        parsed = pd.to_numeric(values, errors="coerce")
        if parsed.isna().any() or not parsed.map(math.isfinite).all():
            raise SystemExit("Invalid numeric values in " + name + ": " + col)
state = runpy.run_path(os.path.join(base, "build_wow.py"))
if state["ALLFAILS"]:
    raise SystemExit("Source reconciliation failed; last valid dashboard retained.")
state["WD"]["referencesAvailable"] = reference_available
with open(os.path.join(base, "result.json"), "w", encoding="utf-8") as f:
    json.dump({
        "data": state["WD"],
        "validation": "\n".join(state["REP"]),
        "warnings": warnings,
        "files": [{"name": n, "size": os.path.getsize(os.path.join(extracts, n))} for n in files]
    }, f, allow_nan=False)
