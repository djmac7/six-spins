#!/usr/bin/env python
"""01c — Game-winner signal for the CLUTCH rating.

The playoff-box clutch signal (01b) is a VOLUME stat: it rewards career-long closers
and deep runs, but misses the archetype fans actually mean by "clutch" — the player who
hits the go-ahead bucket at the buzzer. That reputation is a recorded, checkable fact in
the play-by-play: a made field goal in the final seconds that turns a tie/deficit into a
lead. This stage mines data/raw2/PlayByPlay.parquet (every play, ~1997+) for those shots
and aggregates them to one row per (player_id, season):

  gw     — go-ahead field goals in the final 24s of Q4/OT (team tied or trailing before,
           leading after). "Game-winners" in the colloquial sense.
  gw_po  — the playoff subset (the moment weighs more; validated against public leaders:
           LeBron 7, Dirk 5, Kobe/Durant 4 — and Haliburton 3 in one 2025 run, 6th since '97).

Playoff games are flagged by joining Games.csv on gameId; the shooter's running score is
resolved via Games.csv home/away team ids (PlayByPlay's `side` is left/right, not usable).

player_id is the Basketball-Reference slug. The box dataset keys players by NBA personId,
so rows are JOINED BY NORMALIZED NAME + SEASON against Advanced.csv, identical to 01b, with
pipeline/id_overrides.csv as the escape hatch. Coverage before ~1997 is absent (no PBP) —
those seasons simply carry no game-winner signal, which 04_score treats as neutral (the
component renormalizes away, exactly like a no-playoff season).

Deterministic: pinned parquet/CSVs + pure pandas; no network, no clock.

Writes: data/work/clutch_shots.parquet
"""
import sys, os, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from common import load_config, work_path, repo_path

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def norm_name(s):
    """lowercase, strip diacritics/punctuation/generational suffixes (mirror of 01b)."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    return " ".join(p for p in s.split() if p not in SUFFIXES)


def _clock_secs(c):
    m = re.match(r"PT(\d+)M([\d.]+)S", str(c))
    return int(m.group(1)) * 60 + float(m.group(2)) if m else np.nan


def extract_game_winners(pbp_path, games):
    """Scan the play-by-play row-group by row-group, returning per (norm_name, season)
    game-winner counts. A game-winner = made FG, period >= 4, <= 24s left, shooter's team
    tied/behind before the shot and ahead after."""
    gt = games.set_index("gameId")
    f = pq.ParquetFile(pbp_path)
    cols = ["gameId", "period", "clock", "scoreHome", "scoreAway", "isFieldGoal",
            "shotResult", "shotValue", "playerFullName", "playerteamId", "gameDateTimeEst"]
    parts = []
    for rg in range(f.num_row_groups):
        t = f.read_row_group(rg, columns=cols).to_pandas()
        t = t[(t["isFieldGoal"] == 1) & t["playerFullName"].notna()]
        if t.empty:
            continue
        t["sec"] = t["clock"].map(_clock_secs)
        t = t[(t["period"] >= 4) & (t["sec"] <= 24) & (t["shotResult"] == "Made")]
        if t.empty:
            continue
        t["gameId"] = t["gameId"].astype(str)
        t = t.join(gt, on="gameId")
        sH = pd.to_numeric(t["scoreHome"], errors="coerce")
        sA = pd.to_numeric(t["scoreAway"], errors="coerce")
        home = t["playerteamId"] == t["hometeamId"]
        me = np.where(home, sH, sA)
        opp = np.where(home, sA, sH)
        sv = pd.to_numeric(t["shotValue"], errors="coerce").fillna(2)
        # go-ahead: leading after, tied-or-behind before (subtract the shot's own value)
        go_ahead = (me > opp) & ((me - sv) <= opp)
        t = t[go_ahead].copy()
        if t.empty:
            continue
        # season END year (Sep-Dec -> next year); playoffs (Apr-Jun) map to their year
        d = pd.to_datetime(t["gameDateTimeEst"], errors="coerce")
        t["season"] = (d.dt.year + (d.dt.month >= 9).astype(int)).astype("Int64")
        t["n"] = t["playerFullName"].map(norm_name)
        t["po"] = t["gameType"] == "Playoffs"
        parts.append(t[["n", "season", "po"]])
    gw = pd.concat(parts, ignore_index=True)
    out = (gw.groupby(["n", "season"])
             .agg(gw=("po", "size"), gw_po=("po", "sum"))
             .reset_index())
    out["gw_po"] = out["gw_po"].astype(int)
    return out


def join_player_id(agg, cfg):
    """Attach the Basketball-Reference player_id by (normalized name, season). Same tiered
    match as 01b: exact (season, name) -> single-token -> id_overrides.csv."""
    adv = pd.read_csv(os.path.join(repo_path(cfg["paths"]["raw"]), "Advanced.csv"),
                      usecols=["season", "player", "player_id", "lg"])
    adv = adv[adv["lg"].astype("string").str.upper().isin(["NBA", "BAA"])]
    adv["n"] = adv["player"].map(norm_name)
    names = adv[["season", "n", "player_id"]].drop_duplicates()
    ambiguous = names.groupby(["season", "n"])["player_id"].nunique()
    ambiguous = set(ambiguous[ambiguous > 1].index)
    lut = names[~names.set_index(["season", "n"]).index.isin(ambiguous)] \
        .set_index(["season", "n"])["player_id"]
    agg["player_id"] = [lut.get((s, n)) for s, n in zip(agg["season"], agg["n"])]

    for token_of in (lambda n: n.split()[-1] if n else "",
                     lambda n: n.split()[0] if n else ""):
        unmatched = agg["player_id"].isna()
        if not unmatched.any():
            break
        names_t = names.copy()
        names_t["t"] = names_t["n"].map(token_of)
        uniq = names_t.groupby(["season", "t"])["player_id"].nunique()
        uniq_keys = set(uniq[uniq == 1].index)
        tlut = names_t[names_t.set_index(["season", "t"]).index.isin(uniq_keys)] \
            .drop_duplicates(["season", "t"]).set_index(["season", "t"])["player_id"]
        box_t = agg.loc[unmatched, "n"].map(token_of)
        box_uniq = box_t.groupby([agg.loc[unmatched, "season"], box_t]).transform("size") == 1
        agg.loc[unmatched, "player_id"] = [tlut.get((s, t)) if u else None
            for s, t, u in zip(agg.loc[unmatched, "season"], box_t, box_uniq)]

    ov_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "id_overrides.csv")
    if os.path.exists(ov_path):
        ov_lut = pd.read_csv(ov_path).set_index(["season", "norm_name"])["player_id"]
        agg["player_id"] = [ov_lut.get((s, n)) if pd.isna(p) else p
                            for s, n, p in zip(agg["season"], agg["n"], agg["player_id"])]
    return agg


def main():
    cfg = load_config()
    if not cfg.get("clutch", {}).get("enabled"):
        print("[01c_clutch] clutch disabled — skipping"); return
    raw2 = repo_path(cfg["paths"]["raw2"])
    pbp = os.path.join(raw2, "PlayByPlay.parquet")
    if not os.path.exists(pbp):
        raise SystemExit(f"[FATAL] missing {pbp} — download the box-score dataset into {raw2}/")

    games = pd.read_csv(os.path.join(raw2, "Games.csv"),
                        usecols=["gameId", "gameType", "hometeamId", "awayteamId"])
    games["gameId"] = games["gameId"].astype(str)

    print("[01c_clutch] scanning play-by-play for go-ahead game-winners (final 24s)…")
    agg = extract_game_winners(pbp, games)
    agg = join_player_id(agg, cfg)

    matched = agg["player_id"].notna()
    rate = float((agg.loc[matched, "gw"].sum()) / agg["gw"].sum())
    print(f"[01c_clutch] player-seasons with a game-winner: {len(agg):,} | "
          f"game-winners id-matched: {rate:.2%}")
    # soft: game-winners are a bonus signal, and pre-1997 has none — don't hard-fail the
    # build on the join rate the way 01b does for its primary playoff volume.
    min_rate = float(cfg.get("clutch", {}).get("gw_min_match_rate", 0.90))
    if rate < min_rate:
        miss = agg[~matched].groupby("n")["gw"].sum().sort_values(ascending=False)
        print(miss.head(20).to_string())
        raise SystemExit(f"[FATAL] game-winner id match {rate:.2%} < {min_rate:.0%} — "
                         f"extend pipeline/id_overrides.csv with the names above.")

    out = (agg[matched].groupby(["player_id", "season"], as_index=False)[["gw", "gw_po"]]
           .sum())
    out["season"] = out["season"].astype(int)
    out = out.sort_values(["player_id", "season"]).reset_index(drop=True)
    os.makedirs(os.path.dirname(work_path(cfg, "x")), exist_ok=True)
    out.to_parquet(work_path(cfg, "clutch_shots.parquet"), index=False)
    print(f"[01c_clutch] wrote {len(out):,} rows -> clutch_shots.parquet "
          f"(total GW {int(out['gw'].sum())}, playoff {int(out['gw_po'].sum())})")


if __name__ == "__main__":
    main()
