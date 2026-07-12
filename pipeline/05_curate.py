#!/usr/bin/env python
"""05 — Curate the pool + assemble goat-data.json. Spec §3, §8, §9.

Team and the time axis are INDEPENDENT axes (the game spins / rerolls them separately),
so the pool is a GRID, not a fixed list of team-times:

  players[]  = every entry reachable in the pool (Monte Carlo + rosters index into it
               by id).
  pool       = { franchises[], seasons[], rosters{} }:
               - franchises[] : the team axis (brand: id, name, color, logo)
               - seasons[]    : the TIME axis — decade labels ("1990s") under
                                pool_grain=decade, integer seasons under season grain.
                                (JSON key kept as `seasons` so the app stays schema-driven.)
               - rosters{}    : "AXIS_FRANCHISE" -> [player ids] for every cell that has
                                >= min_roster qualifying players (top by minutes). Only legal
                                cells exist, so independent Reroll Team / Reroll Year always
                                land on a real roster.
  ceiling    = per-ability MAXIMA over every player reachable in the pool, summed (§8).

pool_grain=decade (casual mode): one entry per (player, franchise, decade) with PEAK
ratings — per-ability max of his season COMPOSITES within the cell (composite space, so
the season bell curve can't compound), re-ranked across the decade-grain universe and
mapped through the 2K-style `decade_curve` (median ~75, 99 cap). Rosters are the top
players by TOTAL minutes on that franchise in that decade ("who is a 90s Bull"), while
the ratings stay peak-based ("how good was he at his best there").

Writes: data/goat-data.json  (+ assets/manifest.json, data/work/decade_scored.parquet)
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
import yaml
from common import load_config, work_path, repo_path, percentile_rank, game_curve, read_table


def recognized_star_seasons(cfg):
    """Set of (player_id, season) that earned a RECOGNIZED accolade that year:
    an All-Star selection, an All-NBA team, or an All-Defensive team. This is the
    "was a famous star this season" signal that drives roster force-includes — a
    short-tenure legend (Kobe's rookie Lakers, KG's late Celtics, Mutombo's 76ers)
    defined a team in far fewer minutes than the career role players who out-rank him
    on pure minutes, so the minutes cut alone drops names casuals expect to see.

    Deterministic (recorded selections only), and joined to the franchise/decade via
    each player's actual STINT that season (see curate_decade), so a player is only
    force-added to the team he actually starred for."""
    pairs = set()
    # All-Star selections (drop ABA — the pool is NBA/BAA)
    a = read_table(cfg, "All-Star Selections.csv", ["season", "lg", "player_id"])
    a = a[a["lg"].str.upper().isin(["NBA", "BAA"])]
    pairs |= set(zip(a["player_id"], pd.to_numeric(a["season"], errors="coerce")))
    # All-NBA + All-Defensive teams (End of Season Teams voting file)
    v = read_table(cfg, "End of Season Teams (Voting).csv", ["season", "type", "player_id"])
    v = v[v["type"].isin(["all_nba", "all_defense"])]
    pairs |= set(zip(v["player_id"], pd.to_numeric(v["season"], errors="coerce")))
    return {(p, int(s)) for p, s in pairs if pd.notna(s)}

RATINGS = ["shooting", "scoring", "playmaking",
           "defense", "clutch", "rebounding"]

# box-score totals aggregated across a player's stints within a decade cell
STAT_TOTALS = ["g", "mp", "pts", "trb", "ast", "stl", "blk"]


def pid(player_id, season, team=None):
    """Unique id for a season-grain rating unit. team_split -> slug_season_TEAM."""
    base = f"{player_id}_{int(season)}"
    return f"{base}_{team}" if team is not None else base


def decade_of(season):
    """Decade label for a season END year. 1947-49 (BAA/early NBA) fold into '1950s'
    so the earliest era is one playable bucket."""
    d = (int(season) // 10) * 10
    return f"{max(d, 1950)}s"


def decade_short(label):
    """'1990s' -> '90s', '2000s' -> '00s' (display prefix for team_label)."""
    return label[2:]


def decade_pid(player_id, decade, franchise):
    return f"{player_id}_{decade}_{franchise}"


def _pergame_from_totals(row):
    g = max(float(row.get("g", 0) or 0), 1.0)
    rnd = lambda col: round(float(row.get(col, 0) or 0) / g, 1)
    return {"ppg": rnd("pts"), "rpg": rnd("trb"), "apg": rnd("ast"),
            "spg": rnd("stl"), "bpg": rnd("blk")}


def build_decade_grain(scored, cur, cfg):
    """Aggregate the season-grain scored universe to one row per
    (player_id, franchise, decade): peak composites -> re-ranked, 2K-curved ratings,
    plus games-weighted per-game stats and the peak season (for display).

    Peaks are taken in COMPOSITE space (`_comp_{cat}`, written by 04_score) — maxing the
    curved 0-100 season ratings instead would skew the whole pool high (everyone is a
    peak) and destroy the scale; ranking the peak composites across the decade-grain
    universe restores a clean distribution at the grain the game actually plays."""
    df = scored.copy()
    df["franchise"] = df["team"].map(cur)
    df["decade"] = [decade_of(s) for s in df["season"]]

    # earliest playable decade: drop earlier entries BEFORE the peak re-rank so the 2K
    # curve is calibrated over shipped decades only (decade labels sort chronologically).
    min_decade = cfg.get("pool_min_decade")
    if min_decade:
        df = df[df["decade"] >= str(min_decade)]

    for col in STAT_TOTALS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # overall composite per season row -> which season was "the peak" (display only)
    comp_cols = [f"_comp_{c}" for c in RATINGS]
    df["_overall"] = df[comp_cols].mean(axis=1)

    keys = ["player_id", "franchise", "decade"]
    agg = {f"_comp_{c}": "max" for c in RATINGS}          # per-ability PEAK
    agg.update({col: "sum" for col in STAT_TOTALS})       # decade totals (stats + roster MP)
    g = df.groupby(keys, sort=True)
    out = g.agg(agg).reset_index()

    # display name + peak season from the row with the best overall composite
    best = df.sort_values("_overall", ascending=False, kind="stable") \
             .drop_duplicates(subset=keys, keep="first")
    out = out.merge(best[keys + ["player", "season", "team"]]
                        .rename(columns={"season": "peak_season", "team": "peak_team"}),
                    on=keys, how="left")

    # rank each ability's peak across the WHOLE decade-grain universe, then map onto the
    # 2K-style scale (median ~75, floor 55, cap 99) — see config `decade_curve`.
    dcrv = cfg.get("decade_curve") or {}
    for c in RATINGS:
        flat = percentile_rank(out[f"_comp_{c}"])
        if dcrv:
            flat = game_curve(flat, float(dcrv["mean"]), float(dcrv["sd"]),
                              float(dcrv.get("floor", 0.0)), float(dcrv.get("cap", 100.0)))
        out[c] = pd.Series(np.round(flat), index=out.index).astype("Int64")

    out["id"] = [decade_pid(p, d, f)
                 for p, d, f in zip(out["player_id"], out["decade"], out["franchise"])]
    return out


def main():
    cfg = load_config()
    unit = cfg.get("rating_unit", "team_split")
    team_split = unit == "team_split"
    grain = cfg.get("pool_grain", "season")
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pool.yml")) as f:
        pool = yaml.safe_load(f)

    scored = pd.read_parquet(work_path(cfg, "scored.parquet"))
    membership = pd.read_parquet(work_path(cfg, "team_membership.parquet"))

    franchises = pool.get("franchises", {})
    # relocated/renamed -> current franchise (team axis dedupes to the current abbreviation)
    lineage = pool.get("franchise_lineage", {})
    cur = lambda t: lineage.get(t, t)

    roster_size = int(pool.get("roster_size", 10))
    min_roster = int(pool.get("min_roster", 8))

    if grain == "decade":
        players_out, rosters, franchises_out, axis_out, ceiling, n_pool = \
            curate_decade(cfg, scored, membership, franchises, cur, roster_size, min_roster,
                          pool.get("roster_includes") or {})
    else:
        players_out, rosters, franchises_out, axis_out, ceiling, n_pool = \
            curate_season(cfg, pool, scored, membership, franchises, cur,
                          roster_size, min_roster, team_split)

    out = {
        "meta": {
            "source": cfg["source"],
            "snapshot": cfg["snapshot"],
            "rating_unit": unit,
            "pool_grain": grain,
            "era_min_season": int(cfg["era_min_season"]),
            "min_sample": {"mp": cfg["min_sample"]["mp"], "g": cfg["min_sample"]["g"]},
            "weights": cfg["weights"],
            "shrink_K": {"fg3": cfg["shrink_K"]["fg3"],
                          "ft": cfg["shrink_K"]["ft"],
                          "fg2": cfg["shrink_K"]["fg2"]},
        },
        "players": players_out,
        "pool": {
            "franchises": franchises_out,
            "seasons": axis_out,   # decade labels under decade grain (key kept for the app)
            "rosters": rosters,
        },
        "ceiling": ceiling,
    }
    if grain == "decade" and cfg.get("decade_curve"):
        out["meta"]["decade_curve"] = cfg["decade_curve"]

    out_path = repo_path(cfg["paths"]["out"])
    with open(out_path, "w") as f:
        # Minified (no indent): the prior indent=2 added ~2.7 MB of pure whitespace.
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

    manifest = {
        "players": sorted({f"players/{p['player_id']}.png" for p in players_out}),
        "logos": sorted({t["logo"] for t in franchises_out}),
    }
    with open(repo_path(cfg["paths"]["assets"], "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[05_curate] grain={grain} rating_unit={unit} | players: {len(players_out):,}")
    print(f"            pool grid: {len(franchises_out)} franchises x {len(axis_out)} "
          f"{'decades' if grain == 'decade' else 'seasons'} "
          f"-> {len(rosters)} playable cells | pool players: {n_pool}")
    print(f"            ceiling: {ceiling}")


def curate_decade(cfg, scored, membership, franchises, cur, roster_size, min_roster,
                  roster_includes=None):
    """(decade, franchise) grid with peak ratings. Returns the goat-data pieces."""
    roster_includes = roster_includes or {}
    entries = build_decade_grain(scored, cur, cfg)
    entries.to_parquet(work_path(cfg, "decade_scored.parquet"), index=False)

    # only rating-COMPLETE entries are playable: a 1947-50-only stint has no rebounding
    # data at all (untracked), and shipping a null rating would break the game. Players
    # with any 1951+ season in the cell keep their peak; pure-BAA-era stints drop out.
    complete = entries[RATINGS].notna().all(axis=1)
    if (~complete).any():
        print(f"            (dropped {int((~complete).sum())} rating-incomplete decade entries "
              f"— pre-1951 stat gaps)")
    entries = entries[complete]

    # who qualifies (was in the scored universe) per cell — membership carries every stint,
    # but only stints that survived the universe filter may seed a decade entry / roster MP.
    qual_stints = set(pid(p, s, t) for p, s, t in
                      zip(scored["player_id"], scored["season"], scored["team"]))
    mem = membership.copy()
    mem["stint_id"] = [pid(p, s, t) for p, s, t in
                       zip(mem["player_id"], mem["season"], mem["team"])]
    mem = mem[mem["stint_id"].isin(qual_stints)]
    mem["franchise"] = mem["team"].map(cur)
    mem["decade"] = [decade_of(s) for s in mem["season"]]

    # roster metric: TOTAL minutes on the franchise across the decade ("who is a 90s Bull")
    cell_mp = (mem.groupby(["decade", "franchise", "player_id"], sort=True)["mp"]
                  .sum().reset_index())
    cell_mp["id"] = [decade_pid(p, d, f) for p, d, f in
                     zip(cell_mp["player_id"], cell_mp["decade"], cell_mp["franchise"])]

    # ACCOLADE AUTO-INCLUDES: any player who earned an All-Star / All-NBA / All-Defensive
    # selection in a season he played (a qualifying stint) for this franchise is force-added
    # to that decade cell even if his minutes rank below the cut — so the recognizable names
    # a casual expects on a roster aren't dropped for higher-minute career role players.
    stars = recognized_star_seasons(cfg)
    star_mem = mem[[(p, int(s)) in stars for p, s in zip(mem["player_id"], mem["season"])]]
    star_by_cell = (star_mem.groupby(["decade", "franchise"])["player_id"]
                    .apply(lambda s: sorted(set(s))).to_dict())

    by_id = entries.set_index("id")
    rosters, pool_ids, used_franchises, used_decades = {}, set(), set(), set()
    thin = []
    for (decade, franchise), rows in cell_mp.groupby(["decade", "franchise"], sort=True):
        if franchise not in franchises:
            continue   # defunct franchise with no branding/lineage (one-off BAA teams)
        rows = rows[rows["id"].isin(by_id.index)]
        if len(rows) < min_roster:
            if len(rows) > 0:
                thin.append(f"{decade} {franchise} ({len(rows)})")
            continue
        ranked = rows.sort_values(["mp", "id"], ascending=[False, True],
                                  kind="stable")["id"].tolist()
        roster = ranked[:roster_size]
        # force-includes: automatic accolade stars (All-Star / All-NBA / All-Defensive that
        # season on this franchise) plus any manual pool.yml `roster_includes`. Each must have
        # a rating-complete entry. Prepend the ones the minutes cut missed (highest-minutes
        # first) and drop the lowest-minutes non-forced qualifier to hold roster_size; a cell
        # with more stars than roster_size keeps them all rather than cut a recognizable name.
        auto = star_by_cell.get((decade, franchise), [])
        manual = roster_includes.get(f"{decade}_{franchise}", [])
        rank_pos = {rid: i for i, rid in enumerate(ranked)}   # ranked is minutes-sorted desc
        forced = [decade_pid(p, decade, franchise) for p in dict.fromkeys(list(manual) + list(auto))]
        forced = {f for f in forced if f in by_id.index and f in rank_pos}
        missing = [f for f in forced if f not in roster]
        if missing:
            roster = roster + missing
            # trim back toward roster_size by dropping the lowest-minutes NON-forced
            # qualifiers (never a forced star); a star-dense cell keeps all its stars.
            i = len(roster) - 1
            while len(roster) > roster_size and i >= 0:
                if roster[i] not in forced:
                    roster.pop(i)
                i -= 1
            roster.sort(key=lambda f: rank_pos[f])   # restore minutes order for display
        rosters[f"{decade}_{franchise}"] = roster
        pool_ids.update(roster)
        used_franchises.add(franchise)
        used_decades.add(decade)

    ship = entries[entries["id"].isin(pool_ids)]
    players_out = []
    for _, r in ship.iterrows():
        players_out.append({
            "id": r["id"],
            "player_id": r["player_id"],
            "name": r["player"],
            "ratings": {c: int(r[c]) for c in RATINGS},
            "stats": _pergame_from_totals(r),
            "peak_season": int(r["peak_season"]),
            # era-accurate identity: label from the ORIGINAL abbreviation of the player's
            # peak stint ("90s SuperSonics", not "90s Thunder") — pool.yml carries branding
            # for historical abbrevs; fall back to the current franchise name.
            "team_label": f"{decade_short(r['decade'])} "
                          f"{franchises.get(r['peak_team'], franchises.get(r['franchise'], {})).get('name', r['franchise'])}",
        })

    franchises_out = [
        {"id": t, "name": franchises[t].get("name", t),
         "color": franchises[t].get("color", "#444444"),
         "logo": f"teams/{t}.svg"}
        for t in franchises if t in used_franchises
    ]
    axis_out = sorted(used_decades)   # "1950s" < "1990s" < "2000s" lexicographically OK

    pool_rows = by_id.loc[sorted(pool_ids & set(by_id.index))]
    ceiling = {c: int(pool_rows[c].max()) for c in RATINGS}
    ceiling["total"] = int(sum(ceiling[c] for c in RATINGS))
    if thin:
        print(f"            (skipped {len(thin)} thin cells < {min_roster} players, e.g. {thin[:5]})")
    return players_out, rosters, franchises_out, axis_out, ceiling, len(pool_ids)


def curate_season(cfg, pool, scored, membership, franchises, cur,
                  roster_size, min_roster, team_split):
    """Original (season, franchise) grid — kept as the pool_grain=season fallback."""
    scored = scored.copy()
    id_team = scored["team"] if team_split else [None] * len(scored)
    scored["id"] = [pid(p, s, t) for p, s, t in zip(scored["player_id"], scored["season"], id_team)]
    by_id = scored.set_index("id")

    def pergame(r):
        g = max(float(r.get("g", 0) or 0), 1.0)
        rnd = lambda col: round(float(r.get(col, 0) or 0) / g, 1)
        return {"ppg": rnd("pts"), "rpg": rnd("trb"), "apg": rnd("ast"),
                "spg": rnd("stl"), "bpg": rnd("blk")}

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
        }
        if team is not None:
            entry["team"] = team
            entry["team_label"] = f"{int(r['season'])} {franchises.get(team, {}).get('name', team)}"
        players.append(entry)

    seasons_cfg = pool.get("seasons", "all")
    seasons_axis = (sorted(int(s) for s in scored["season"].unique())
                    if seasons_cfg in ("all", None) else [int(s) for s in seasons_cfg])
    qualifying_ids = set(scored["id"])

    mem = membership.copy()
    mem["id"] = [pid(p, s, t) for p, s, t in zip(mem["player_id"], mem["season"], mem["team"])] \
        if team_split else [pid(p, s) for p, s in zip(mem["player_id"], mem["season"])]
    mem = mem[mem["id"].isin(qualifying_ids)]
    mem["franchise"] = mem["team"].map(cur)

    rosters, pool_player_ids, used_franchises, used_seasons = {}, set(), set(), set()
    thin = []
    for (season, franchise), rows in mem.groupby(["season", "franchise"], sort=True):
        if int(season) not in set(seasons_axis):
            continue
        if len(rows) < min_roster:
            if 0 < len(rows) < min_roster:
                thin.append(f"{int(season)} {franchise} ({len(rows)})")
            continue
        roster = rows.sort_values(["mp", "id"], ascending=[False, True],
                                  kind="stable")["id"].head(roster_size).tolist()
        rosters[f"{int(season)}_{franchise}"] = roster
        pool_player_ids.update(roster)
        used_franchises.add(franchise)
        used_seasons.add(int(season))

    players = [p for p in players if p["id"] in pool_player_ids]

    franchises_out = [
        {"id": t, "name": franchises[t].get("name", t),
         "color": franchises[t].get("color", "#444444"),
         "logo": f"teams/{t}.svg"}
        for t in franchises if t in used_franchises
    ]
    seasons_out = sorted(used_seasons)

    pool_rows = by_id.loc[sorted(pool_player_ids & set(by_id.index))]
    ceiling = {c: int(pool_rows[c].max()) for c in RATINGS}
    ceiling["total"] = int(sum(ceiling[c] for c in RATINGS))

    SHIP_FIELDS = ("id", "player_id", "name", "ratings", "stats", "team_label")
    players_out = [{k: p[k] for k in SHIP_FIELDS if k in p} for p in players]
    if thin:
        print(f"            (skipped {len(thin)} thin cells < {min_roster} players, e.g. {thin[:5]})")
    return players_out, rosters, franchises_out, seasons_out, ceiling, len(pool_player_ids)


if __name__ == "__main__":
    main()
