#!/usr/bin/env python
"""01 — Ingest: load the season tables, join them, and reduce to the configured rating
unit. Spec §2, §3.

`rating_unit` (config.yml) selects the grain:
  team_split -> one row per (player_id, season, team) STINT; a traded player becomes
                multiple rows, each carrying only that team's stats. (current default)
  season     -> one row per (player_id, season), traded players collapsed to the
                combined season-total row.

Either way we also capture per-team membership for roster building.

Writes:
  data/work/ingested.parquet        one row per rating unit
  data/work/team_membership.parquet per-team rows (player_id, season, team, mp)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from common import (
    load_config, read_table, work_path, collapse_to_season, keep_team_stints,
    is_agg_team, smooth_reputation, repo_path,
)


def main():
    cfg = load_config()
    unit = cfg.get("rating_unit", "team_split")
    if unit == "team_split":
        reduce_rows, KEY = keep_team_stints, ["player_id", "season", "team"]
    elif unit == "season":
        reduce_rows, KEY = collapse_to_season, ["player_id", "season"]
    else:
        raise SystemExit(f"[01_ingest] unknown rating_unit {unit!r} (use team_split|season)")

    # --- load the four season tables (the Advanced table is the spine, §2) ---
    advanced = read_table(cfg, "Advanced.csv", [
        "season", "lg", "player", "player_id", "age", "team", "pos", "g", "mp",
        "x3p_ar", "f_tr", "orb_percent", "drb_percent", "trb_percent",
        "ast_percent", "stl_percent", "blk_percent", "tov_percent", "ts_percent",
        "usg_percent", "dbpm", "dws",
    ])
    per100 = read_table(cfg, "Per 100 Poss.csv", [
        "season", "player_id", "team", "x3p_per_100_poss", "x2p_per_100_poss",
    ])
    totals = read_table(cfg, "Player Totals.csv", [
        "season", "player_id", "team",
        "x3p", "x3pa", "x3p_percent", "x2p", "x2pa", "x2p_percent",
        "ft", "fta", "ft_percent", "ast", "tov", "trb", "stl", "blk", "pts",
    ])
    pergame = read_table(cfg, "Player Per Game.csv", [
        "season", "player_id", "team", "pts_per_game",
    ])  # loaded per §2; pts_per_game is used only as a roster tie-break in §5

    # --- reduce each table to the rating unit (§3). `team` is kept and is part of the
    # join key under team_split; under season it is collapsed away by the reducer. ---
    adv1 = reduce_rows(advanced[[
        "season", "lg", "player", "player_id", "age", "team", "pos", "g", "mp",
        "x3p_ar", "f_tr", "orb_percent", "drb_percent", "trb_percent",
        "ast_percent", "stl_percent", "blk_percent", "tov_percent", "ts_percent",
        "usg_percent", "dbpm", "dws",
    ]])
    # other tables: keep only the join key + their stat columns (drop their own mp/team
    # when not in KEY to avoid colliding with the advanced spine).
    drop_extra = [c for c in ("team", "mp") if c not in KEY]
    per100_1 = reduce_rows(
        per100[["season", "player_id", "team", "mp",
                "x3p_per_100_poss", "x2p_per_100_poss"]]
    ).drop(columns=drop_extra)
    totals_1 = reduce_rows(
        totals[["season", "player_id", "team", "mp",
                "x3p", "x3pa", "x3p_percent", "x2p", "x2pa", "x2p_percent",
                "ft", "fta", "ft_percent", "ast", "tov", "trb", "stl", "blk", "pts"]]
    ).drop(columns=drop_extra)

    # --- join on the rating-unit key; advanced is the spine ---
    df = adv1.merge(totals_1, on=KEY, how="left").merge(per100_1, on=KEY, how="left")

    # optional shot-location source (Player Shooting, 1997+) — merged if present (§7).
    # Carries both the at-rim (0-3ft) band and the two mid-range bands (10-16ft, 16ft-3pt)
    # used by the non-shooter mid_range component; all gated on having the data downstream.
    if cfg.get("at_rim", {}).get("enabled") or cfg.get("mid_range", {}).get("enabled"):
        shoot_cols = [
            "fg_percent_from_x0_3_range", "percent_fga_from_x0_3_range",
            "fg_percent_from_x10_16_range", "percent_fga_from_x10_16_range",
            "fg_percent_from_x16_3p_range", "percent_fga_from_x16_3p_range",
        ]
        shooting = read_table(cfg, "Player Shooting.csv",
                              ["season", "player_id", "team"] + shoot_cols)
        sh1 = reduce_rows(
            shooting[["season", "player_id", "team"] + shoot_cols]
        ).drop(columns=[c for c in ("team",) if c not in KEY])
        df = df.merge(sh1, on=KEY, how="left")

    # --- optional defensive-accolade signal (§7): All-Defensive Team selections + DPOY vote
    # share. These season-level HONORS encode the on-ball/point-of-attack containment the box
    # score is blind to (steals/dbpm reward ball-hawking, not staying in front of your man), so
    # they correct the systematic under-rating of low-event stoppers (Bowen/Klay/Smart) and the
    # over-rating of high-steal gamblers (who never make these teams). Joined on (season,
    # player_id) — a season-level honor broadcasts across a traded player's team stints. ---
    acc_cfg = cfg.get("defensive_accolade", {})
    if acc_cfg.get("enabled"):
        # All-Defense recognition via the continuous VOTE SHARE (not just made/missed the team), so a
        # snubbed-but-voted-for defender (OG Anunoby's 2025, Klay's non-selection years) gets partial
        # credit instead of falling off the binary cliff. The share already encodes the tier — a
        # 1st-teamer ~0.85-1.0, a 2nd-teamer ~0.5-0.7, a real snub ~0.1-0.4. Voting covers the whole
        # 1980+ universe (every selectee has a share; the only gaps are pre-1980).
        votes = read_table(cfg, "End of Season Teams (Voting).csv",
                           ["season", "lg", "type", "player_id", "share"])
        # NB: the voting file uses lowercase 'nba' for lg (the selections file used 'NBA') — match case-insensitively
        alld = votes[(votes["type"] == "all_defense")
                     & (votes["lg"].astype("string").str.lower() == "nba")].copy()
        share = pd.to_numeric(alld["share"], errors="coerce").fillna(0.0)
        min_share = float(acc_cfg.get("all_def_min_share", 0.0))
        alld["_acc"] = share.where(share >= min_share, 0.0) * float(acc_cfg.get("all_def_weight", 1.0))
        alld_acc = alld.groupby(["season", "player_id"])["_acc"].max()

        shares = read_table(cfg, "Player Award Shares.csv",
                            ["season", "award", "player_id", "share"])
        dpoy = shares[shares["award"] == "nba dpoy"].copy()
        dpoy["_dpoy"] = (pd.to_numeric(dpoy["share"], errors="coerce").fillna(0.0)
                         * float(acc_cfg.get("dpoy_share", 1.0)))
        dpoy_acc = dpoy.groupby(["season", "player_id"])["_dpoy"].max()

        acc = (pd.DataFrame({"_alldef": alld_acc})
               .join(pd.DataFrame({"_dpoy": dpoy_acc}), how="outer").fillna(0.0))
        acc["def_accolade"] = acc["_alldef"] + acc["_dpoy"]
        acc = acc.reset_index()[["season", "player_id", "def_accolade"]]
        df = df.merge(acc, on=["season", "player_id"], how="left")
    df["def_accolade"] = pd.to_numeric(df.get("def_accolade"), errors="coerce").fillna(0.0)

    # Smooth into a defensive-REPUTATION signal: recognition persists a few years, so a season inherits
    # a decayed share of its recent peak (TRAILING window — no future leakage). Runs AFTER the merge so
    # a player's vote-LESS seasons (Kidd 2011-13) are present to receive the decayed recognition — else
    # a consistently-elite defender's rating bounces on single-season voting noise (Kidd 80<->93 across
    # stable prime years). decay^gap weights the inherited value by how many seasons back it was.
    # Pre-1969 defense (before All-Defense voting existed) has NO recorded honor signal, so
    # famous defensive anchors would sit at the same neutral baseline as everyone else.
    # `data/curated/retro_defense.csv` lifts a short, recorded-basis list (Russell, Thurmond,
    # Wilt, ...) — each row cites the recorded fact it encodes (Anniversary Teams, All-D
    # selections once voting began). Deterministic (checked-in data), explicitly editorial;
    # switch off via defensive_accolade.retro_curated.
    if acc_cfg.get("retro_curated", True):
        retro = pd.read_csv(repo_path("data", "curated", "retro_defense.csv"))
        r_share = {}
        for _, rr in retro.iterrows():
            for s in range(int(rr["from_season"]), int(rr["to_season"]) + 1):
                r_share[(rr["player_id"], s)] = max(r_share.get((rr["player_id"], s), 0.0),
                                                    float(rr["share"]))
        if r_share:
            retro_vals = pd.Series([r_share.get((p, s), 0.0)
                                    for p, s in zip(df["player_id"], df["season"])],
                                   index=df.index)
            df["def_accolade"] = df["def_accolade"].where(df["def_accolade"] >= retro_vals,
                                                          retro_vals)

    sm = cfg.get("defensive_accolade", {}).get("smooth", {})
    df["def_accolade"] = smooth_reputation(df, "def_accolade",
                                           int(sm.get("window", 0)), float(sm.get("decay", 0.6)))

    # --- offensive-accolade "sentiment" signals (§7 extension): recorded vote shares that
    # encode how the league/media actually PERCEIVED a season — the casual-sentiment signal
    # box scores miss (a signature-skill legend should never read jarringly low). Fully
    # deterministic (recorded voting data), same pattern as def_accolade. ---
    oa = cfg.get("offensive_accolade", {})
    if oa.get("enabled"):
        shares = read_table(cfg, "Player Award Shares.csv",
                            ["season", "award", "player_id", "share"])
        mvp = shares[shares["award"] == "nba mvp"].copy()
        mvp["_mvp"] = pd.to_numeric(mvp["share"], errors="coerce").fillna(0.0)
        mvp_acc = mvp.groupby(["season", "player_id"])["_mvp"].max()

        votes = read_table(cfg, "End of Season Teams (Voting).csv",
                           ["season", "lg", "type", "player_id", "share"])
        allnba = votes[(votes["type"] == "all_nba")
                       & (votes["lg"].astype("string").str.lower() == "nba")].copy()
        allnba["_an"] = pd.to_numeric(allnba["share"], errors="coerce").fillna(0.0)
        min_share = float(oa.get("all_nba_min_share", 0.0))
        allnba["_an"] = allnba["_an"].where(allnba["_an"] >= min_share, 0.0)
        allnba_acc = allnba.groupby(["season", "player_id"])["_an"].max()

        allstar = read_table(cfg, "All-Star Selections.csv", ["season", "lg", "player_id"])
        allstar = allstar[allstar["lg"].astype("string").str.lower() == "nba"]
        as_acc = allstar.groupby(["season", "player_id"]).size().clip(upper=1).astype(float)

        # scoring-title bonus: that season's PPG leader within the ingested rows (deterministic;
        # computed on qualifying-scale rows so a 3-game hot streak can't take the "title")
        ppg = df.groupby(["season", "player_id"]).agg(pts=("pts", "sum"), g=("g", "sum"))
        ppg = ppg[ppg["g"] >= 40]
        ppg["_ppg"] = ppg["pts"] / ppg["g"]
        leaders = ppg.groupby("season")["_ppg"].transform("max") == ppg["_ppg"]
        title_acc = leaders[leaders].astype(float)  # (season, player_id) -> 1.0

        acc = (pd.DataFrame({"_mvp": mvp_acc})
               .join(pd.DataFrame({"_an": allnba_acc}), how="outer")
               .join(pd.DataFrame({"_as": as_acc}), how="outer")
               .join(pd.DataFrame({"_title": title_acc}), how="outer").fillna(0.0))
        # scoring perception: MVP share + All-NBA share + the scoring title
        acc["scoring_accolade"] = (acc["_mvp"] * float(oa.get("mvp_weight", 1.0))
                                   + acc["_an"] * float(oa.get("all_nba_weight", 0.5))
                                   + acc["_title"] * float(oa.get("scoring_title_weight", 0.5)))
        # star perception (playmaking lift): MVP share + a small All-Star selection term
        acc["star_accolade"] = (acc["_mvp"] * float(oa.get("mvp_weight", 1.0))
                                + acc["_as"] * float(oa.get("all_star_weight", 0.25)))
        acc = acc.reset_index()[["season", "player_id", "scoring_accolade", "star_accolade"]]
        df = df.merge(acc, on=["season", "player_id"], how="left")
    for col in ("scoring_accolade", "star_accolade"):
        df[col] = pd.to_numeric(df.get(col), errors="coerce").fillna(0.0)
        osm = oa.get("smooth", {}) if oa else {}
        df[col] = smooth_reputation(df, col, int(osm.get("window", 0)),
                                    float(osm.get("decay", 0.6)))

    # --- clutch-accolade signal (§7): Finals MVP (curated recorded fact) + a small MVP
    # echo + Clutch POY vote share (2023+). The playoff BOX-SCORE side of clutch is built
    # by 01b_playoffs.py and merged in 04_score; this is the recognition side. ---
    cl = cfg.get("clutch", {})
    if cl.get("enabled"):
        fmvp = pd.read_csv(repo_path("data", "curated", "finals_mvp.csv"))
        fmvp["_f"] = pd.to_numeric(fmvp["share"], errors="coerce").fillna(0.0) \
            * float(cl.get("finals_mvp_weight", 1.0))
        f_acc = fmvp.groupby(["season", "player_id"])["_f"].max()

        shares2 = read_table(cfg, "Player Award Shares.csv",
                             ["season", "award", "player_id", "share"])
        mvp2 = shares2[shares2["award"] == "nba mvp"].copy()
        mvp2["_m"] = (pd.to_numeric(mvp2["share"], errors="coerce").fillna(0.0)
                      * float(cl.get("mvp_weight", 0.25)))
        m_acc = mvp2.groupby(["season", "player_id"])["_m"].max()
        cpoy = shares2[shares2["award"] == "nba clutch_poy"].copy()
        cpoy["_c"] = (pd.to_numeric(cpoy["share"], errors="coerce").fillna(0.0)
                      * float(cl.get("clutch_poy_weight", 0.75)))
        c_acc = cpoy.groupby(["season", "player_id"])["_c"].max()

        cacc = (pd.DataFrame({"_f": f_acc})
                .join(pd.DataFrame({"_m": m_acc}), how="outer")
                .join(pd.DataFrame({"_c": c_acc}), how="outer").fillna(0.0))
        cacc["clutch_accolade"] = cacc["_f"] + cacc["_m"] + cacc["_c"]
        cacc = cacc.reset_index()[["season", "player_id", "clutch_accolade"]]
        df = df.merge(cacc, on=["season", "player_id"], how="left")
    df["clutch_accolade"] = pd.to_numeric(df.get("clutch_accolade"), errors="coerce").fillna(0.0)
    csm = cl.get("smooth", {}) if cl else {}
    df["clutch_accolade"] = smooth_reputation(df, "clutch_accolade",
                                              int(csm.get("window", 0)), float(csm.get("decay", 0.7)))

    # --- team membership for rosters: the per-team (non-aggregate) rows (§3) ---
    tm = totals[["season", "player_id", "team", "mp", "lg"]].copy()
    tm = tm[~is_agg_team(tm["team"])]
    tm = tm.merge(pergame[["season", "player_id", "team", "pts_per_game"]],
                  on=["season", "player_id", "team"], how="left")

    os.makedirs(os.path.dirname(work_path(cfg, "x")), exist_ok=True)
    df.to_parquet(work_path(cfg, "ingested.parquet"), index=False)
    tm.to_parquet(work_path(cfg, "team_membership.parquet"), index=False)

    print(f"[01_ingest] rating_unit={unit} | rows: {len(df):,} | "
          f"team-membership rows: {len(tm):,} | columns: {len(df.columns)}")


if __name__ == "__main__":
    main()
