#!/usr/bin/env python
"""05 — Curate the pool + assemble goat-data.json. Spec §3, §8, §9.

Team and Year are INDEPENDENT axes (the game spins / rerolls them separately), so the
pool is a GRID, not a fixed list of team-years:

  players[]  = the FULL scored universe (Monte Carlo + rosters index into it by id). Under
               rating_unit=team_split each entry is one (player, season, team) stint and
               carries its own `team`, so a traded player appears once per team.
  pool       = { franchises[], seasons[], rosters{} }:
               - franchises[] : the team axis (brand: id, name, color, logo)
               - seasons[]    : the year axis
               - rosters{}    : "SEASON_FRANCHISE" -> [player ids] for every cell that has
                                >= min_roster qualifying players (top by minutes). Only legal
                                cells exist, so independent Reroll Team / Reroll Year always
                                land on a real roster.
  ceiling    = per-ability MAXIMA over every player reachable in the pool, summed (§8).

Writes: data/goat-data.json  (+ assets/manifest.json listing required art)
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import yaml
from common import load_config, work_path, repo_path

RATINGS = ["shooting", "scoring", "playmaking",
           "perimeter_d", "rim_protection", "rebounding"]


def pid(player_id, season, team=None):
    """Unique id for a rating unit. team_split -> slug_season_TEAM (a traded player
    has one id per team); season -> slug_season."""
    base = f"{player_id}_{int(season)}"
    return f"{base}_{team}" if team is not None else base


def main():
    cfg = load_config()
    unit = cfg.get("rating_unit", "team_split")
    team_split = unit == "team_split"
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pool.yml")) as f:
        pool = yaml.safe_load(f)

    scored = pd.read_parquet(work_path(cfg, "scored.parquet"))
    membership = pd.read_parquet(work_path(cfg, "team_membership.parquet"))

    scored = scored.copy()
    id_team = scored["team"] if team_split else [None] * len(scored)
    scored["id"] = [pid(p, s, t) for p, s, t in zip(scored["player_id"], scored["season"], id_team)]
    by_id = scored.set_index("id")
    franchises = pool.get("franchises", {})
    # relocated/renamed -> current franchise (team axis dedupes to the current abbreviation)
    lineage = pool.get("franchise_lineage", {})
    cur = lambda t: lineage.get(t, t)

    # per-game box-score stats shown to the player while picking (the surprise is the
    # hidden 0-100 ability ratings; the real per-game line is the clue). total / games.
    def pergame(r):
        g = max(float(r.get("g", 0) or 0), 1.0)
        rnd = lambda col: round(float(r.get(col, 0) or 0) / g, 1)
        return {"ppg": rnd("pts"), "rpg": rnd("trb"), "apg": rnd("ast"),
                "spg": rnd("stl"), "bpg": rnd("blk")}

    # --- players[]: the full scored universe ---
    players = []
    for _, r in scored.iterrows():
        team = r["team"] if team_split else None
        entry = {
            "id": r["id"],
            "player_id": r["player_id"],
            "name": r["player"],
            "season": int(r["season"]),
            "ratings": {c: int(r[c]) for c in RATINGS},
            "stats": pergame(r),
            "photo": f"players/{r['player_id']}.png",
        }
        if team is not None:
            entry["team"] = team
            entry["team_label"] = f"{int(r['season'])} {franchises.get(team, {}).get('name', team)}"
        players.append(entry)

    # --- pool grid: cross every franchise (team axis) with every season (year axis) ---
    roster_size = int(pool.get("roster_size", 10))
    min_roster = int(pool.get("min_roster", 8))
    # `seasons: all` (or omitted) -> every season present in the filtered universe; an explicit
    # list narrows it back down. The team axis is every CURRENT franchise present in the data.
    seasons_cfg = pool.get("seasons", "all")
    seasons_axis = (sorted(int(s) for s in scored["season"].unique())
                    if seasons_cfg in ("all", None) else [int(s) for s in seasons_cfg])
    qualifying_ids = set(scored["id"])

    # membership tells us who actually suited up for (season, team); rate from the stint id.
    # `franchise` folds relocated/renamed abbreviations into the current franchise (lineage).
    mem = membership.copy()
    mem["id"] = [pid(p, s, t) for p, s, t in zip(mem["player_id"], mem["season"], mem["team"])] \
        if team_split else [pid(p, s) for p, s in zip(mem["player_id"], mem["season"])]
    mem = mem[mem["id"].isin(qualifying_ids)]
    mem["franchise"] = mem["team"].map(cur)

    rosters, pool_player_ids, used_franchises, used_seasons = {}, set(), set(), set()
    thin = []
    # iterate every (season, current-franchise) cell actually present in the data — full coverage
    for (season, franchise), rows in mem.groupby(["season", "franchise"], sort=True):
        if int(season) not in set(seasons_axis):
            continue
        if len(rows) < min_roster:
            if 0 < len(rows) < min_roster:
                thin.append(f"{int(season)} {franchise} ({len(rows)})")
            continue
        roster = rows.sort_values("mp", ascending=False, kind="stable")["id"].head(roster_size).tolist()
        rosters[f"{int(season)}_{franchise}"] = roster
        pool_player_ids.update(roster)
        used_franchises.add(franchise)
        used_seasons.add(int(season))

    # Ship only the players the pool can actually draft (the grid rosters) — the full
    # universe was needed for ranking (done in parquet), but the app/Monte Carlo only
    # index pool players. This shrinks goat-data.json ~7x (8MB -> ~1.2MB) for a fast load.
    players = [p for p in players if p["id"] in pool_player_ids]

    franchises_out = [
        {"id": t, "name": franchises[t].get("name", t),
         "color": franchises[t].get("color", "#444444"),
         "logo": f"teams/{t}.svg"}
        for t in franchises if t in used_franchises
    ]
    seasons_out = sorted(used_seasons)

    # --- ceiling: per-ability max over every reachable pool player, summed (§8) ---
    pool_rows = by_id.loc[sorted(pool_player_ids & set(by_id.index))]
    ceiling = {c: int(pool_rows[c].max()) for c in RATINGS}
    ceiling["total"] = int(sum(ceiling[c] for c in RATINGS))

    out = {
        "meta": {
            "source": cfg["source"],
            "snapshot": cfg["snapshot"],
            "rating_unit": unit,
            "era_min_season": int(cfg["era_min_season"]),
            "min_sample": {"mp": cfg["min_sample"]["mp"], "g": cfg["min_sample"]["g"]},
            "weights": cfg["weights"],
            "shrink_K": {"fg3": cfg["shrink_K"]["fg3"],
                          "ft": cfg["shrink_K"]["ft"],
                          "fg2": cfg["shrink_K"]["fg2"]},
        },
        "players": players,
        "pool": {
            "franchises": franchises_out,
            "seasons": seasons_out,
            "rosters": rosters,
        },
        "ceiling": ceiling,
    }

    out_path = repo_path(cfg["paths"]["out"])
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    manifest = {
        "players": sorted({p["photo"] for p in players if p["id"] in pool_player_ids}),
        "logos": sorted({t["logo"] for t in franchises_out}),
    }
    with open(repo_path(cfg["paths"]["assets"], "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[05_curate] rating_unit={unit} | players: {len(players):,}")
    print(f"            pool grid: {len(franchises_out)} franchises x {len(seasons_out)} seasons "
          f"-> {len(rosters)} playable cells | pool players: {len(pool_player_ids)}")
    print(f"            ceiling: {ceiling}")
    if thin:
        print(f"            (skipped {len(thin)} thin cells < {min_roster} players, e.g. {thin[:5]})")


if __name__ == "__main__":
    main()
