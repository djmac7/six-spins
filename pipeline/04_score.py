#!/usr/bin/env python
"""04 — Score: for each of the six categories, percentile-rank each component across
the universe, weighted-average into a composite, then percentile-rank the composite
into the final 0-100 rating. Spec §7, §8.

Two rounds of ranking on purpose (§7): component ranks put inputs on one scale so they
can be averaged; the composite rank gives the clean, ordinal 0-100 game feel.

Writes: data/work/scored.parquet  (universe + six integer ratings + composites)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from common import (load_config, work_path, percentile_rank, percentile_rank_within,
                    weighted_composite, credibility_shrink, bell_curve, scoring_guardrail)

RATINGS = ["shooting", "scoring", "playmaking",
           "perimeter_d", "rim_protection", "rebounding"]


def _perimeter_dbpm_gate(blk_pct: pd.Series, cfg: dict, gmin=None) -> pd.Series:
    """Block-rate gate for perimeter_d credit (§7). Returns a multiplier in [gmin, 1]:
    1.0 for true perimeter players (blk% <= blk_lo) ramping to gmin for shot-blocking rim
    anchors (blk% >= blk_hi). Used to strip the rim portion of a big's whole-court dbpm
    from his PERIMETER rating, and (with gmin=0) to deny shot-blockers any perimeter credit
    from a position-blind All-Defense/DPOY honor — that honor routes to rim_protection."""
    pg = cfg.get("perimeter_gate")
    if not pg:
        return pd.Series(1.0, index=blk_pct.index)
    lo, hi = float(pg["blk_lo"]), float(pg["blk_hi"])
    gmin = float(pg["gmin"]) if gmin is None else gmin
    b = pd.to_numeric(blk_pct, errors="coerce").fillna(0.0)
    return pd.Series(np.clip((hi - b) / (hi - lo), gmin, 1.0), index=blk_pct.index)


def _rim_accolade_gate(drb_pct: pd.Series, cfg: dict) -> pd.Series:
    """Interior-routing gate for rim_protection's defensive-accolade credit (§7). Increases
    with defensive-rebound rate: ~gmin for perimeter players (low drb%, whose All-Defense honor
    belongs to perimeter_d) ramping to 1.0 for interior anchors (high drb%). Uses rebounding, NOT
    blocks, so a no-swat anchor like Bam Adebayo still receives full interior accolade credit."""
    rg = cfg.get("rim_accolade_gate")
    if not rg:
        return pd.Series(1.0, index=drb_pct.index)
    lo, hi, gmin = float(rg["drb_lo"]), float(rg["drb_hi"]), float(rg["gmin"])
    d = pd.to_numeric(drb_pct, errors="coerce").fillna(0.0)
    return pd.Series(np.clip((d - lo) / (hi - lo), gmin, 1.0), index=drb_pct.index)


def component_values(df: pd.DataFrame, cfg: dict) -> dict:
    """Map each component key -> its prepared (already normalized/shrunk) raw value.
    Per-100 and as-is inputs are taken straight; percentages use the §6 shrunk cols;
    AST/TO floors turnovers at 0.5 to avoid a 0-TO scrub spiking (§7).

    Scoring-VOLUME components (score2/score3) are season points gated by the TS%
    guardrail so volume only rewards efficient-enough scorers (lifts Kobe/MJ, not
    chuckers). Every category also carries an ABSOLUTE volume component so usage/
    minutes matter, not just rates: score3/score2 (offense), ast_total, stl_total,
    blk_total (defense), trb_total (boards)."""
    num = lambda c: pd.to_numeric(df[c], errors="coerce")
    season_mean = lambda s: s.groupby(df["season"]).transform("mean")
    # ABSOLUTE-volume components are summed to the player's SEASON total across team_split stints, so a
    # player traded mid-season is credited for his full-season volume (Drummond's 551 rebounds, not the
    # 214 from one stint) instead of looking like a part-timer on each team. Single-team rows unchanged.
    season_total = lambda s: s.groupby([df["player_id"], df["season"]]).transform("sum")

    # (a) TS%-based gate for shooting's 3pt scoring volume
    gs = cfg["shooting_guardrail"]
    ts = num("ts_percent")
    g_ts = scoring_guardrail(ts, season_mean(ts), float(gs["band"]), float(gs["gmin"]))

    # (c) shot-profile gate for SHOOTING (§7): a 3pt shooter (3PA-rate >= min_3par) is scored on
    # {fg3, ft, score3}; a NON-3pt shooter is scored on {ft, mid_range} — fg3 is DROPPED for them.
    # Why drop it: a 0-attempt shooter's EB-shrunk 3P% sits at the league MEAN, which ranks ~75th
    # percentile (the % distribution is left-skewed), so the neutral prior was crediting non-shooters
    # as above-average 3pt shooters (DeAndre Jordan -> 53). With fg3 gone, a non-shooter's rating is
    # driven by their real touch signal — FT% (+ a MEASURED mid-range jumper where the shot-location
    # data shows real mid-range volume). A sniper's rating is unchanged (mid_range absent for them).
    min_3par = float(cfg["shooting_2pt_gate"]["min_3par"])
    is_shooter = pd.to_numeric(df["x3p_ar"], errors="coerce").fillna(0.0) >= min_3par
    fg3 = pd.to_numeric(df["fg3_pct_shrunk"], errors="coerce").where(is_shooter, np.nan)
    score3 = ((3.0 * num("x3p")) * g_ts).where(is_shooter, np.nan)
    mid_range = pd.to_numeric(df["mid_range_shrunk"], errors="coerce").where(~is_shooter, np.nan)

    return {
        # SHOOTING — shooting SKILL: 3pt make-rate + FT touch, with a light volume floor.
        # Volume/impact lives in `scoring`, so efficiency leads here (great lower-volume shooters
        # like Bird aren't buried). EB-shrinkage on the %s guards tiny-sample flukes.
        "shooting": {
            "fg3_pct": fg3,          # SHOOTERS only: 3pt make-rate (dropped for non-shooters)
            "ft_pct": df["ft_pct_shrunk"],
            "score3": score3,        # SHOOTERS: light volume floor (TS%-gated 3pt scoring)
            "mid_range": mid_range,  # NON-shooters: measured 10-16ft/16ft-3pt make-rate (gated to real data)
        },
        # SCORING — VOLUME-led, ERA-RELATIVE (components ranked within season; see
        # era_relative_ratings). Per-game points lead so a season's scoring leader rates elite
        # in any era; efficiency is light and 3pt-NEUTRAL (adj_ts) so non-3pt shooters aren't
        # docked. Works in every era (pts/usg exist back to 1980).
        "scoring": {
            "pts_rate": num("pts") / num("g").clip(lower=1.0),  # PPG (era-relative volume — leads)
            "usg": num("usg_percent"),                          # shot-creation load
            "ts_eff": num("ts_percent"),                        # REAL TS% efficiency (3s at full value)
        },
        "playmaking": {
            "ast_total": season_total(num("ast")),   # §5 override: absolute SEASON assists (volume; traded-safe)
            "ast_pct": num("ast_percent"),           # creation rate
            # creation under scoring LOAD: ast% scaled by usage. Rewards a player who creates for
            # others WHILE shouldering a heavy scoring load (LeBron/Luka/Harden) over a pure-volume
            # floor general; a low-assist scorer stays low because ast% is the multiplicand.
            "creation_load": num("ast_percent") * num("usg_percent") / 100.0,
            # usage-fair ball security: creation rate vs turnover rate (per play used). Credits
            # protecting the ball relative to offensive load, so high-usage engines (LeBron)
            # aren't penalized; replaces raw ast/to, which double-counted low-TO pass specialists.
            "ast_security": num("ast_percent") / pd.to_numeric(df["tov_percent"], errors="coerce").clip(lower=1.0),
        },
        "perimeter_d": {
            "stl_pct": num("stl_percent"),
            # dbpm is WHOLE-court box +/-; gate its perimeter credit DOWN for shot-blocking rim
            # anchors (see perimeter_gate) so Robinson/Ewing/Hakeem don't leak in as elite PERIMETER
            # defenders. Steals are genuine perimeter events and stay ungated.
            "dbpm": num("dbpm") * _perimeter_dbpm_gate(num("blk_percent"), cfg),
            "stl_total": season_total(num("stl")),   # absolute SEASON steals (volume; traded-safe)
            # All-Defense/DPOY honor, block-rate-gated to GUARDS (gmin=0 so shot-blocking rim
            # anchors get ZERO perimeter credit from a position-blind honor — it routes to rim).
            "def_accolade": num("def_accolade") * _perimeter_dbpm_gate(num("blk_percent"), cfg, gmin=0.0),
        },
        "rim_protection": {
            "blk_pct": num("blk_percent"),
            "dbpm": num("dbpm"),
            "blk_total": season_total(num("blk")),   # absolute SEASON blocks (volume; traded-safe)
            "drb_pct": num("drb_percent"),           # interior possession-ending (lifts no-swat anchors like Bam)
            # All-Defense/DPOY honor, drb-rate-gated to INTERIOR anchors (so Bam's honor counts here)
            "def_accolade": num("def_accolade") * _rim_accolade_gate(num("drb_percent"), cfg),
        },
        "rebounding": {
            "trb_pct": num("trb_percent"),
            "trb_total": season_total(num("trb")),   # §5 override: absolute SEASON rebounds (volume; traded-safe)
            "oreb_pct": num("orb_percent"),
            "dreb_pct": num("drb_percent"),
        },
    }


def main():
    cfg = load_config()
    df = pd.read_parquet(work_path(cfg, "normalized.parquet"))
    weights = cfg["weights"]
    comps = component_values(df, cfg)

    # --- §7 volume credibility: shrink configured rate/ratio components toward the
    # universe mean by their backing volume BEFORE ranking (see config `credibility`) ---
    # The backing volume is summed to the player's SEASON total (across team_split stints), so a
    # player traded mid-season is credited at full-season reliability rather than treated as a small
    # sample on each stint — otherwise an elite rate on a 20-game stint (Drummond 2021, 23% TRB%)
    # gets wrongly shrunk toward the mean. A genuinely low-minute (injury) season is NOT a full
    # season, so it correctly stays shrunk. Single-team players are unaffected (sum == stint value).
    cred = cfg.get("credibility", {})
    num = lambda c: pd.to_numeric(df[c], errors="coerce")
    season_total = lambda s: s.groupby([df["player_id"], df["season"]]).transform("sum")
    volume_series = {                                   # derived volume keys (season-totaled)
        "fga": season_total(num("x2pa").fillna(0) + num("x3pa").fillna(0)),
        "ast_plus_tov": season_total(num("ast").fillna(0) + num("tov").fillna(0)),
    }
    mp_season = season_total(num("mp").fillna(0))
    resolve_vol = lambda key: (volume_series[key] if key in volume_series
                               else mp_season if key == "mp" else num(key))
    n_shrunk = 0
    for cat in RATINGS:
        for name, vals in comps[cat].items():
            spec = cred.get(name)
            if spec is None:
                continue
            comps[cat][name] = credibility_shrink(
                vals, resolve_vol(spec["volume"]), float(spec["K"]))
            n_shrunk += 1
    print(f"[04_score] applied volume-credibility shrinkage to {n_shrunk} components")

    era_rel = set(cfg.get("era_relative_ratings", []))
    crv = cfg.get("curve")
    for cat in RATINGS:
        # 1st round: percentile-rank each component. era-relative cats (scoring) rank
        # WITHIN season so the result normalizes eras; the rest rank across the universe.
        if cat in era_rel:
            ranks = {name: percentile_rank_within(vals, df["season"])
                     for name, vals in comps[cat].items()}
        else:
            ranks = {name: percentile_rank(vals) for name, vals in comps[cat].items()}
        rank_df = pd.DataFrame(ranks, index=df.index)
        for name in ranks:
            df[f"_rk_{cat}_{name}"] = rank_df[name]
        # weighted-average -> composite (weights renormalized over present components)
        composite = weighted_composite(rank_df, weights[cat])
        df[f"_comp_{cat}"] = composite
        # 2nd round: percentile-rank the composite -> flat 0-100 ...
        final = percentile_rank(composite)
        # ... then bell-curve it so elite ratings are scarce (config `curve`; monotonic).
        # sd may be overridden per rating (scoring uses a softer sd so era-relative
        # scoring leaders reliably clear 90 while keeping a real efficiency component).
        if crv:
            sd = crv.get("sd_by_rating", {}).get(cat, crv["sd"])
            final = bell_curve(final, float(crv["mean"]), float(sd),
                               float(crv.get("floor", 0.0)))
        df[cat] = pd.Series(np.round(final), index=df.index).astype("Int64")

    # SHOOTING cap for non-3pt shooters: their rating is INFERRED from FT%/mid-range (they take no
    # 3s), so it can't be confirmed elite — clip it below the proven-shooter tier so the top of the
    # shooting leaderboard stays actual 3pt shooters (a great-touch big like Sikma tops out at the cap).
    sg = cfg.get("shooting_2pt_gate", {})
    cap = sg.get("nonshooter_cap")
    if cap is not None:
        is_shooter = pd.to_numeric(df["x3p_ar"], errors="coerce").fillna(0.0) >= float(sg["min_3par"])
        capped = df["shooting"].where(is_shooter, df["shooting"].clip(upper=int(cap)))
        df["shooting"] = capped.astype("Int64")

    df.to_parquet(work_path(cfg, "scored.parquet"), index=False)

    summary = {c: (float(np.nanmean(df[c].astype(float))),
                   int(df[c].min()), int(df[c].max())) for c in RATINGS}
    print("[04_score] ratings written. mean / min / max per ability:")
    for c in RATINGS:
        m, lo, hi = summary[c]
        print(f"   {c:15s} mean={m:5.1f}  min={lo:3d}  max={hi:3d}")


if __name__ == "__main__":
    main()
