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
from scipy.stats import norm
from common import (load_config, work_path, percentile_rank, percentile_rank_within,
                    weighted_composite, credibility_shrink, bell_curve, scoring_guardrail,
                    desaturated_rank)

RATINGS = ["shooting", "scoring", "playmaking",
           "defense", "clutch", "rebounding"]

# components ranked WITHIN season regardless of their rating's era mode: playoff PPG is a
# volume stat in a pace-inflated context, so a season's playoff scoring leader rates elite
# in any era (mirrors why the whole `scoring` rating is era-relative).
ERA_REL_COMPONENTS = {("clutch", "po_pts")}


def _accolade_ds(cfg: dict) -> dict:
    """Map accolade component name -> its desaturate config (see common.desaturated_rank).
    Accolade components are sparse recorded-vote signals; they are ALWAYS ranked
    de-saturated and cross-era (vote shares are already season-scoped), even inside an
    era-relative rating like scoring."""
    return {
        "def_accolade": (cfg.get("defensive_accolade") or {}).get("desaturate") or {},
        "scoring_accolade": (cfg.get("offensive_accolade") or {}).get("desaturate") or {},
        "star_accolade": (cfg.get("offensive_accolade") or {}).get("desaturate") or {},
        "clutch_accolade": (cfg.get("clutch") or {}).get("desaturate") or {},
    }


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
    # The "volume" components are PER-GAME, not season totals: per-game production reflects a player's
    # ROLE (minutes x rate) without penalizing AVAILABILITY (games played). A star limited by injury to a
    # short season (Barkley's 20-game 2000, AD's 20-game 2026) keeps his elite per-game volume instead of
    # being dragged by a low season total; a traded player's per-stint per-game is already correct. A
    # low-MINUTE bench specialist still ranks low (little per-game) — the separation the term was for.
    g = num("g").clip(lower=1.0)

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
    score3 = ((3.0 * num("x3p") / g) * g_ts).where(is_shooter, np.nan)
    mid_range = pd.to_numeric(df["mid_range_shrunk"], errors="coerce").where(~is_shooter, np.nan)

    return {
        # SHOOTING — shooting SKILL: 3pt make-rate + FT touch, with a light volume floor.
        # Volume/impact lives in `scoring`, so efficiency leads here (great lower-volume shooters
        # like Bird aren't buried). EB-shrinkage on the %s guards tiny-sample flukes.
        "shooting": {
            "fg3_pct": fg3,          # SHOOTERS only: 3pt make-rate (dropped for non-shooters)
            "ft_pct": df["ft_pct_shrunk"],
            "score3": score3,        # SHOOTERS: per-game 3pt volume floor (TS%-gated)
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
            "scoring_accolade": num("scoring_accolade"),        # SENTIMENT: MVP/All-NBA share + scoring title
        },
        "playmaking": {
            "ast_total": num("ast") / g,             # per-game assists (volume — availability-neutral)
            "ast_pct": num("ast_percent"),           # creation rate
            # creation under scoring LOAD: ast% scaled by usage. Rewards a player who creates for
            # others WHILE shouldering a heavy scoring load (LeBron/Luka/Harden) over a pure-volume
            # floor general; a low-assist scorer stays low because ast% is the multiplicand.
            "creation_load": num("ast_percent") * num("usg_percent") / 100.0,
            # usage-fair ball security: creation rate vs turnover rate (per play used). Credits
            # protecting the ball relative to offensive load, so high-usage engines (LeBron)
            # aren't penalized; replaces raw ast/to, which double-counted low-TO pass specialists.
            "ast_security": num("ast_percent") / pd.to_numeric(df["tov_percent"], errors="coerce").clip(lower=1.0),
            "star_accolade": num("star_accolade"),   # SENTIMENT: small lift for recognized engines
        },
        # DEFENSE — one merged rating (perimeter + interior). The accolade leads (the only
        # signal that sees both point-of-attack containment and no-swat anchoring); steals
        # and blocks each keep a rate + volume term so both defender archetypes can score
        # the box share. No routing gates — they only existed to split credit across the
        # two old defensive axes.
        # The box sub-components below feed the perimeter/interior ARCHETYPE sub-composites
        # (config `defense_box`); a player's box credit is the max of the two, re-ranked —
        # so pure perimeter stoppers aren't dragged by real-but-low block stats and vice
        # versa. Assembled in main() (see the defense special case).
        "defense": {
            "def_accolade": num("def_accolade"),
            "dbpm": num("dbpm"),
            "stl_pct": num("stl_percent"),
            "stl_total": num("stl") / g,             # per-game steals (volume — availability-neutral)
            "blk_pct": num("blk_percent"),
            "blk_total": num("blk") / g,             # per-game blocks (volume — availability-neutral)
            "drb_pct": num("drb_percent"),           # interior possession-ending (lifts no-swat anchors)
        },
        # CLUTCH — playoff production + recorded clutch recognition (see config `clutch`).
        # Playoff columns are merged from 01b_playoffs (NaN for no-playoff seasons — the
        # composite renormalizes onto clutch_accolade's neutral zero_rank: honest unknown).
        "clutch": {
            "po_pts": num("po_ppg"),                 # playoff PPG (era-relative — see ERA_REL_COMPONENTS)
            "po_depth": num("po_g"),                 # playoff games (deep runs vs better opposition)
            "po_retention": num("po_ts") - num("ts_percent"),  # rise vs shrink in the playoffs
            "clutch_accolade": num("clutch_accolade"),
        },
        "rebounding": {
            "trb_pct": num("trb_percent"),
            "trb_total": num("trb") / g,             # per-game rebounds (volume — availability-neutral)
            "oreb_pct": num("orb_percent"),
            "dreb_pct": num("drb_percent"),
        },
    }


def _nonshooter_ceiling(composite: np.ndarray, cap: float, crv: dict, cat: str) -> float:
    """Composite value whose final rating equals the non-shooter `cap`.

    The pipeline maps composite -> flat percentile -> bell-curve -> rating, all monotonic,
    so "rating <= cap" is exactly "composite <= this ceiling". Returns the composite quantile
    at the flat percentile that bell-curves to `cap` (or `cap` itself when no curve is set)."""
    comp = np.asarray(composite, dtype=float)
    if crv:
        sd = crv.get("sd_by_rating", {}).get(cat, crv["sd"])
        p_cap = 100.0 * float(norm.cdf((cap - float(crv["mean"])) / float(sd)))
    else:
        p_cap = float(cap)
    return float(np.nanpercentile(comp, np.clip(p_cap, 0.0, 100.0)))


def main():
    cfg = load_config()
    df = pd.read_parquet(work_path(cfg, "normalized.parquet"))
    weights = cfg["weights"]

    # playoff aggregates for CLUTCH (01b_playoffs): season-level, so they broadcast across
    # a traded player's team stints. No-playoff seasons stay NaN (composite renormalizes).
    po_cols = ["po_g", "po_ppg", "po_ts", "po_fga"]
    po_path = work_path(cfg, "playoffs.parquet")
    if cfg.get("clutch", {}).get("enabled") and os.path.exists(po_path):
        po = pd.read_parquet(po_path)[["player_id", "season"] + po_cols]
        df = df.merge(po, on=["player_id", "season"], how="left")
    else:
        for c in po_cols:
            df[c] = np.nan

    # No-playoff (or playoff-join-miss) seasons must rank LOW on clutch, not be lifted by a
    # lone accolade. If the playoff box components stay NaN, weighted_composite renormalizes
    # onto clutch_accolade alone — so a Finals-MVP name whose box failed to join (e.g. "JoJo"
    # vs "Jo Jo White") inflates to ~100, ABOVE players whose playoffs joined. Fix: fill
    # missing playoff VOLUME with 0 (ranks at the bottom) and missing playoff TS with the
    # regular-season TS (retention 0, neutral). Now the accolade is a lift on real playoff
    # production, never the whole rating. (A player's decade CLUTCH is still their best
    # playoff season — no-playoff journeymen correctly read low.)
    reg_ts = pd.to_numeric(df["ts_percent"], errors="coerce")
    df["po_g"] = pd.to_numeric(df["po_g"], errors="coerce").fillna(0.0)
    df["po_ppg"] = pd.to_numeric(df["po_ppg"], errors="coerce").fillna(0.0)
    df["po_fga"] = pd.to_numeric(df["po_fga"], errors="coerce").fillna(0.0)
    df["po_ts"] = pd.to_numeric(df["po_ts"], errors="coerce").fillna(reg_ts)

    comps = component_values(df, cfg)

    # shooting shot-profile gate (reused for the composite ceiling below and the final cap):
    # a 3pt shooter (3PA-rate >= min_3par) is scored on real 3pt data; a non-shooter's shooting
    # is INFERRED from FT%/mid-range, so it can't be confirmed elite and is capped.
    sg = cfg.get("shooting_2pt_gate", {})
    cap = sg.get("nonshooter_cap")
    is_shooter = (pd.to_numeric(df["x3p_ar"], errors="coerce").fillna(0.0)
                  >= float(sg["min_3par"])).to_numpy() if sg else np.ones(len(df), bool)

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
        # accolade components (recorded vote shares) always rank de-saturated + cross-era,
        # even inside an era-relative rating — a vote share is already season-scoped.
        # ERA_REL_COMPONENTS forces a single component within-season (playoff PPG).
        acc_ds = _accolade_ds(cfg)

        def _rank_one(name, vals):
            if name in acc_ds:
                return desaturated_rank(vals, acc_ds[name])
            if cat in era_rel or (cat, name) in ERA_REL_COMPONENTS:
                return percentile_rank_within(vals, df["season"])
            return percentile_rank(vals)

        ranks = {name: _rank_one(name, vals) for name, vals in comps[cat].items()}
        rank_df = pd.DataFrame(ranks, index=df.index)
        # DEFENSE: box credit = the player's BEST defensive ARCHETYPE. Build the perimeter
        # and interior sub-composites (config `defense_box`), take the max, re-rank it, and
        # blend with the accolade — a pure perimeter stopper isn't dragged by real-but-low
        # block stats (a zero, unlike a missing component, never renormalizes away).
        if cat == "defense":
            box = cfg["defense_box"]
            perim = weighted_composite(rank_df, box["perimeter"])
            inter = weighted_composite(rank_df, box["interior"])
            box_best = np.fmax(perim, inter)          # NaN-tolerant max (either archetype)
            rank_df["box_best"] = percentile_rank(box_best)
            df["_rk_defense_perimeter"] = perim
            df["_rk_defense_interior"] = inter
            ranks = {"def_accolade": ranks["def_accolade"], "box_best": rank_df["box_best"]}
            rank_df = rank_df[["def_accolade", "box_best"]]
        for name in ranks:
            df[f"_rk_{cat}_{name}"] = rank_df[name]
        # weighted-average -> composite (weights renormalized over present components)
        composite = weighted_composite(rank_df, weights[cat])
        # SHOOTING: confine non-3pt shooters in COMPOSITE space, BEFORE the percentile+curve.
        # A non-shooter's composite collapses to FT% (+ measured mid-range where it exists), which
        # can rank a 95%-FT non-shooter (Calvin Murphy) #1 all-time. Capping only the final rating
        # left those rows above real snipers in `_comp_shooting` — which tripped the QA name-regression
        # and deflated real shooters' universe percentile. Clipping the composite to the cap-equivalent
        # ceiling keeps the leaderboard (and `_comp_shooting`) honest and un-deflates the snipers above it.
        if cat == "shooting" and cap is not None:
            ceil = _nonshooter_ceiling(composite, float(cap), crv, cat)
            confine = (~is_shooter) & ~np.isnan(composite)
            composite = np.where(confine, np.minimum(composite, ceil), composite)
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

    # SHOOTING final hard cap: the composite ceiling above lands non-shooters near `cap`; this
    # guarantees they never round above it (a great-touch big like Sikma tops out exactly at the cap).
    if cap is not None:
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
