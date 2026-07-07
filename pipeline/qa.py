#!/usr/bin/env python
"""QA / sanity checks (§11). Run after scoring, before shipping.

HARD failures (exit 1): NaN/null ratings, a spike at 100 (tie/scaling bug).
SOFT diagnostics (warn): expected names not near the top, high D-slot correlation,
starved pool slots, skewed distribution. These are tuning signals, not build-breakers.

Determinism (§11) is checked by `run.py --verify-determinism`, which builds twice and
diffs the bytes; here we just print the output hash.
"""
import sys, os, json, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from common import load_config, work_path, repo_path

RATINGS = ["shooting", "scoring", "playmaking",
           "defense", "clutch", "rebounding"]

GREEN, RED, YEL, RST = "\033[32m", "\033[31m", "\033[33m", "\033[0m"


def _norm(s: str) -> str:
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


def main():
    cfg = load_config()
    scored = pd.read_parquet(work_path(cfg, "scored.parquet"))
    with open(repo_path(cfg["paths"]["out"])) as f:
        gd = json.load(f)

    # the SHIPPED grain: under pool_grain=decade the pool ships decade-peak ratings, so the
    # name-regression / scale checks must run against decade_scored.parquet, not the season grain.
    decade_grain = gd["meta"].get("pool_grain") == "decade"
    dsc = pd.read_parquet(work_path(cfg, "decade_scored.parquet")) if decade_grain else None

    hard_fail, soft_warn = [], []
    N = len(scored)
    print(f"== QA on {N:,} universe rows ==\n")

    # 1. No NaNs / nulls in any of the six ratings for any shipped player. Universe rows
    # from 1952+ must be complete too; 1947-51 rows may legitimately lack a rating
    # (rebounds untracked pre-1951, minutes pre-1952) — those entries are dropped from the
    # shipped pool by 05_curate, so they're reported but not build-breaking.
    null_players = [p["id"] for p in gd["players"]
                    if any(p["ratings"].get(c) is None for c in RATINGS)]
    modern = scored[scored["season"] >= 1952]
    nan_universe = int(sum(modern[c].isna().sum() for c in RATINGS))
    nan_early = int(sum(scored.loc[scored["season"] < 1952, c].isna().sum() for c in RATINGS))
    if null_players or nan_universe:
        hard_fail.append(f"null/NaN ratings: {len(null_players)} players, "
                         f"{nan_universe} universe cells (1952+)")
    print(f"{'PASS' if not (null_players or nan_universe) else 'FAIL'}  no NaNs/nulls "
          f"(1952+ NaN cells={nan_universe}, shipped null players={len(null_players)}; "
          f"pre-1952 untracked-stat gaps={nan_early} — expected, unshipped)")

    # 2. Distribution ~uniform 0-100 (mean ~50, no spike at 100)
    for c in RATINGS:
        vals = scored[c].astype(float)
        mean = float(vals.mean())
        spike = float((vals == 100).mean())
        flag = ""
        if not (45 <= mean <= 55):
            soft_warn.append(f"{c}: mean {mean:.1f} off-center"); flag = YEL + " (mean off)" + RST
        if spike > 0.02:
            hard_fail.append(f"{c}: spike at 100 = {spike:.1%} (tie/scaling bug)")
            flag = RED + " (SPIKE@100)" + RST
        print(f"      {c:15s} mean={mean:5.1f}  frac@100={spike:5.2%}{flag}")

    # 3. Defense archetype balance: the merged rating must reward BOTH perimeter and
    # interior defenders — check that the top of the defense leaderboard draws on both
    # archetype sub-composites rather than collapsing to one.
    if "_rk_defense_perimeter" in scored.columns:
        top = scored.nlargest(200, "_comp_defense")
        n_per = int((top["_rk_defense_perimeter"] >= top["_rk_defense_interior"]).sum())
        n_int = len(top) - n_per
        bal_ok = min(n_per, n_int) >= 30   # each archetype holds a real share of the top 200
        if not bal_ok:
            soft_warn.append(f"defense top-200 archetype split {n_per} perimeter / {n_int} "
                             f"interior — one archetype is being starved")
        print(f"\n{'PASS' if bal_ok else 'WARN'}  defense archetypes in top 200: "
              f"{n_per} perimeter / {n_int} interior")

    # 4. Pool fillability: a handful of pool players >= 90 in each ability.
    # Read the SHIPPED ratings (works for both pool grains — decade-grain ratings
    # live in goat-data.json / decade_scored.parquet, not scored.parquet).
    print(f"\n      pool fillability (players >= 90), {len(gd['players'])} pool players:")
    for c in RATINGS:
        n90 = sum(1 for p in gd["players"] if p["ratings"].get(c, 0) >= 90)
        if n90 < 3:
            soft_warn.append(f"{c}: only {n90} pool players >= 90 (slot starved, fix via pool)")
        print(f"      {c:15s} {n90} >= 90  {'' if n90>=3 else YEL+'(starved)'+RST}")

    # 4b. Decade-grain scale check: the shipped decade pool should sit on the 2K-style
    # scale (mean ≈ decade_curve.mean over the FULL decade-grain universe; a shipped-pool
    # mean above it is expected — rosters select good players — but a mean far off or a
    # pile-up at the cap flags a peak-inflation / re-rank bug.
    if decade_grain:
        dcrv = gd["meta"].get("decade_curve") or {}
        tgt = float(dcrv.get("mean", 75)); cap = float(dcrv.get("cap", 99))
        print(f"\n      decade-grain universe ({len(dsc):,} entries; target mean≈{tgt:.0f}):")
        for c in RATINGS:
            vals = dsc[c].astype(float)
            mean = float(vals.mean()); at_cap = float((vals >= cap).mean())
            flag = ""
            if abs(mean - tgt) > 3:
                hard_fail.append(f"decade {c}: mean {mean:.1f} vs target {tgt:.0f} (re-rank bug)")
                flag = RED + " (MEAN OFF)" + RST
            if at_cap > 0.02:
                hard_fail.append(f"decade {c}: {at_cap:.1%} at cap {cap:.0f} (peak inflation)")
                flag = RED + " (CAP PILE-UP)" + RST
            print(f"      {c:15s} mean={mean:5.1f}  frac@cap={at_cap:5.2%}{flag}")

    # 5. Name regression: expected legends surface near the top of what SHIPS. On the decade
    # grain we rank each ability by the player's best decade-peak rating (the shipped number),
    # not the season composite — otherwise a modern 6-game PPG spike outranks the legend and
    # the check doesn't reflect the actual pool. Threshold is ~2/3 (min 2), so a real miss
    # (the old 4/8-still-passes bug) now surfaces as a warning.
    k = int(cfg["qa"]["top_k"])
    grain_lbl = "decade-peak" if decade_grain else "season"
    print(f"\n      expected names within top {k} ({grain_lbl}, soft):")
    for c, names in cfg["qa"]["expect_top"].items():
        if decade_grain:
            best_per_player = dsc.groupby("player")[c].max()
            present = {_norm(x) for x in best_per_player.nlargest(k).index}
        else:
            rank_col = f"_comp_{c}" if f"_comp_{c}" in scored.columns else c
            present = {_norm(x) for x in scored.nlargest(k, rank_col)["player"]}
        found = [nm for nm in names if _norm(nm) in present]
        miss = [nm for nm in names if _norm(nm) not in present]
        need = max(2, (2 * len(names) + 2) // 3)
        ok = len(found) >= need
        color = GREEN if ok else YEL
        if not ok:
            soft_warn.append(f"{c}: only {len(found)}/{len(names)} expected names in top {k} "
                             f"(need {need}) — missing {miss}")
        print(f"      {color}{c:15s} {len(found)}/{len(names)} (need {need}){RST}"
              + (f"  missing: {miss}" if miss else ""))

    # 6. Signature-skill floors (sentiment regression): each legend's best decade-grain
    # entry must clear the configured minimum in his signature ability — the encoding of
    # "a casual never sees a jarringly low number on the skill the player is famous for".
    floors = cfg["qa"].get("signature_floor") or []
    if floors and gd["meta"].get("pool_grain") == "decade":
        dsc = pd.read_parquet(work_path(cfg, "decade_scored.parquet"))
        print(f"\n      signature-skill floors (best decade-grain entry, soft):")
        for name, ability, lo in floors:
            rows = dsc[dsc["player"].map(_norm) == _norm(name)]
            if rows.empty:
                soft_warn.append(f"signature floor: {name} not in decade universe"); continue
            best = int(rows[ability].max())
            ok = best >= int(lo)
            if not ok:
                soft_warn.append(f"signature floor: {name} {ability} best={best} < {lo}")
            print(f"      {GREEN if ok else YEL}{name:22s} {ability:12s} {best:3d} >= {lo}{RST}")

    # output hash (determinism handled by run.py --verify-determinism)
    h = hashlib.sha256(open(repo_path(cfg["paths"]["out"]), "rb").read()).hexdigest()
    print(f"\n      goat-data.json sha256 = {h[:16]}…")

    print("\n== summary ==")
    for w in soft_warn:
        print(f"  {YEL}WARN{RST} {w}")
    for fmsg in hard_fail:
        print(f"  {RED}FAIL{RST} {fmsg}")
    if hard_fail:
        print(f"\n{RED}QA FAILED{RST} ({len(hard_fail)} hard, {len(soft_warn)} warnings)")
        sys.exit(1)
    print(f"\n{GREEN}QA PASSED{RST} ({len(soft_warn)} soft warnings to consider while tuning)")


if __name__ == "__main__":
    main()
