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
    is_agg_team,
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
    sm = cfg.get("defensive_accolade", {}).get("smooth", {})
    window, decay = int(sm.get("window", 0)), float(sm.get("decay", 0.6))
    if window > 0 and (df["def_accolade"] > 0).any():
        sa = (df.groupby(["player_id", "season"], as_index=False)["def_accolade"].max()
                .sort_values(["player_id", "season"]))

        def _smooth(g):
            yrs, vals = g["season"].to_numpy(), g["def_accolade"].to_numpy()
            g["_rep"] = [max([vals[j] * decay ** (yrs[i] - yrs[j])
                              for j in range(len(yrs)) if 0 <= yrs[i] - yrs[j] <= window] or [0.0])
                         for i in range(len(yrs))]
            return g
        sa = sa.groupby("player_id", group_keys=False).apply(_smooth)
        rep = sa.set_index(["player_id", "season"])["_rep"]
        df["def_accolade"] = [float(rep.get((p, s), 0.0))
                              for p, s in zip(df["player_id"], df["season"])]

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
