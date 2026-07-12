#!/usr/bin/env python
"""01b — Playoff aggregates for the CLUTCH rating.

Reads the second pinned dataset (data/raw2 — kaggle:eoinamoore/historical-nba-data-and-
player-box-scores, game-level box scores for every NBA game incl. playoffs, 1947+),
filters to playoff games, and aggregates to one row per (player_id, season):

  po_g, po_mp, po_pts, po_fga, po_fta, po_ppg, po_ts

player_id is the Basketball-Reference slug used by the main dataset. The box-score
dataset keys players by NBA personId, so rows are JOINED BY NORMALIZED NAME + SEASON
against Advanced.csv (a playoff player always has a regular-season row). Ambiguities
(two active same-name players) and misses resolve via the checked-in
pipeline/id_overrides.csv; the stage FAILS LOUDLY if the match rate drops below
clutch.min_match_rate, printing the miss list so the override file can be extended.

Deterministic: pinned CSVs + pure pandas; no network, no clock.

Writes: data/work/playoffs.parquet
"""
import sys, os, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from common import load_config, work_path, repo_path

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def norm_name(s):
    """lowercase, strip diacritics/punctuation/generational suffixes, collapse spaces."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    parts = [p for p in s.split() if p not in SUFFIXES]
    return " ".join(parts)


def season_end_year(dates):
    """Season END year from a game date: Sep-Dec belong to the season ending next year
    (playoffs are Apr-Jun, so they map straight to their calendar year)."""
    d = pd.to_datetime(dates, errors="coerce")
    return (d.dt.year + (d.dt.month >= 9).astype(int)).astype("Int64")


def main():
    cfg = load_config()
    cl = cfg.get("clutch", {})
    raw2 = repo_path(cfg["paths"]["raw2"])
    fpath = os.path.join(raw2, "PlayerStatistics.csv")
    if not os.path.exists(fpath):
        raise SystemExit(f"[FATAL] missing {fpath} — download the box-score dataset "
                         f"(eoinamoore/historical-nba-data-and-player-box-scores) into {raw2}/")

    usecols = ["firstName", "lastName", "gameDate", "gameType", "numMinutes", "points",
               "fieldGoalsAttempted", "freeThrowsAttempted"]
    df = pd.read_csv(fpath, usecols=usecols)
    df = df[df["gameType"] == "Playoffs"].copy()
    df["season"] = season_end_year(df["gameDate"])
    df["n"] = (df["firstName"].fillna("") + " " + df["lastName"].fillna("")).map(norm_name)

    num = lambda c: pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    df["_pts"], df["_fga"], df["_fta"], df["_mp"] = (num("points"), num("fieldGoalsAttempted"),
                                                     num("freeThrowsAttempted"), num("numMinutes"))
    agg = (df.groupby(["n", "season"])
             .agg(po_g=("_pts", "size"), po_pts=("_pts", "sum"), po_fga=("_fga", "sum"),
                  po_fta=("_fta", "sum"), po_mp=("_mp", "sum"))
             .reset_index())
    agg["po_ppg"] = agg["po_pts"] / agg["po_g"].clip(lower=1)
    tsa = agg["po_fga"] + 0.44 * agg["po_fta"]
    agg["po_ts"] = (agg["po_pts"] / (2.0 * tsa)).where(tsa > 0)

    # --- join to Basketball-Reference player_id by (normalized name, season) ---
    adv = pd.read_csv(os.path.join(repo_path(cfg["paths"]["raw"]), "Advanced.csv"),
                      usecols=["season", "player", "player_id", "lg"])
    adv = adv[adv["lg"].astype("string").str.upper().isin(["NBA", "BAA"])]
    adv["n"] = adv["player"].map(norm_name)
    names = adv[["season", "n", "player_id"]].drop_duplicates()
    # ambiguous (same name active twice in a season) -> unresolvable by name; route to overrides
    ambiguous = names.groupby(["season", "n"])["player_id"].nunique()
    ambiguous = set(ambiguous[ambiguous > 1].index)
    lut = names[~names.set_index(["season", "n"]).index.isin(ambiguous)] \
        .set_index(["season", "n"])["player_id"]

    agg["player_id"] = [lut.get((s, n)) for s, n in zip(agg["season"], agg["n"])]

    # Fallback tiers for name-FORM mismatches (the box-score dataset uses formal names,
    # bbref uses common ones: "Thomas Sanders"/Satch Sanders, "Nene Hilario"/Nene,
    # "Lafayette Lever"/Fat Lever). Match on a single name token within the season,
    # requiring UNIQUENESS on both sides — anything still ambiguous goes to overrides.
    for token_of in (lambda n: n.split()[-1] if n else "",     # last name
                     lambda n: n.split()[0] if n else ""):     # first name (mononyms: Nene)
        unmatched = agg["player_id"].isna()
        if not unmatched.any():
            break
        names_t = names.copy()
        names_t["t"] = names_t["n"].map(token_of)
        uniq = names_t.groupby(["season", "t"])["player_id"].nunique()
        uniq_keys = set(uniq[uniq == 1].index)
        tlut = names_t[names_t.set_index(["season", "t"]).index.isin(uniq_keys)] \
            .drop_duplicates(["season", "t"]).set_index(["season", "t"])["player_id"]
        # box side must be unique on the token too (two unmatched Johnsons -> skip)
        box_t = agg.loc[unmatched, "n"].map(token_of)
        box_uniq = box_t.groupby([agg.loc[unmatched, "season"], box_t]).transform("size") == 1
        fill = [tlut.get((s, t)) if u else None
                for s, t, u in zip(agg.loc[unmatched, "season"], box_t, box_uniq)]
        agg.loc[unmatched, "player_id"] = fill

    # checked-in escape hatch for the residue: norm_name,season -> player_id
    ov_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "id_overrides.csv")
    if os.path.exists(ov_path):
        ov = pd.read_csv(ov_path)
        ov_lut = ov.set_index(["season", "norm_name"])["player_id"]
        fix = [ov_lut.get((s, n)) if pd.isna(p) else p
               for s, n, p in zip(agg["season"], agg["n"], agg["player_id"])]
        agg["player_id"] = fix

    matched = agg["player_id"].notna()
    rate = float(matched.mean())
    min_rate = float(cl.get("min_match_rate", 0.98))
    misses = (agg[~matched].groupby("n")["po_g"].sum().sort_values(ascending=False))
    print(f"[01b_playoffs] playoff player-seasons: {len(agg):,} | matched: {rate:.2%} "
          f"| unmatched names: {misses.shape[0]}")
    if rate < min_rate:
        print(misses.head(40).to_string())
        raise SystemExit(f"[FATAL] playoff id match rate {rate:.2%} < {min_rate:.0%} — "
                         f"extend pipeline/id_overrides.csv with the names above.")

    # Collapse to one row per (player_id, season): two normalized name-FORMS in the same
    # season can resolve to the same bbref id (single-token fallback or id_overrides), which
    # otherwise fans out that player's stint rows in 04_score's left merge (mirrors 01c).
    # Sum the TOTALS and RE-DERIVE the rate columns — never sum a rate.
    out = (agg[matched].groupby(["player_id", "season"], as_index=False)
           .agg(po_g=("po_g", "sum"), po_mp=("po_mp", "sum"), po_pts=("po_pts", "sum"),
                po_fga=("po_fga", "sum"), po_fta=("po_fta", "sum")))
    out["po_ppg"] = out["po_pts"] / out["po_g"].clip(lower=1)
    _tsa = out["po_fga"] + 0.44 * out["po_fta"]
    out["po_ts"] = (out["po_pts"] / (2.0 * _tsa)).where(_tsa > 0)
    out = out[["player_id", "season", "po_g", "po_mp", "po_pts",
               "po_fga", "po_fta", "po_ppg", "po_ts"]]
    out["season"] = out["season"].astype(int)
    out = out.sort_values(["player_id", "season"]).reset_index(drop=True)
    os.makedirs(os.path.dirname(work_path(cfg, "x")), exist_ok=True)
    out.to_parquet(work_path(cfg, "playoffs.parquet"), index=False)
    print(f"[01b_playoffs] wrote {len(out):,} rows -> playoffs.parquet")


if __name__ == "__main__":
    main()
