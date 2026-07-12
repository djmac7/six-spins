#!/usr/bin/env python
"""06 — Monte Carlo percentile generator (§12).

Consumes data/goat-data.json (the `players` ratings + `pool` grid) and simulates many
LEGAL random playthroughs of the real game, recording each final score. Writes the
score->percentile CDF to data/percentile-table.json — the file the app reads to headline
"you scored X / Y — Nth percentile".

Two inherited correctness constraints (§12):
  1. Obey the REAL rules, not a simplified version, or every in-game percentile is wrong.
  2. Read the SAME ratings the game ships — run AFTER scoring, re-run whenever scoring changes.

The real rules modelled here (mirror of the app reducer):
  - Six slots in the fixed ability order; one rating harvested per spin, ×6.
  - Team and Year are INDEPENDENT axes. Each spin lands on a uniformly random legal
    (franchise, season) CELL of the pool grid (redraws allowed).
  - A spin's pick is a FORCED ASSIGNMENT: a player from the cell's roster is locked into
    an open slot at that ability's rating. No passing.
  - There is NO one-player-once rule: the same player id may be drafted into more than one
    slot (mirrors the app reducer, which tracks usedPlayerIds but never restricts on it).
  - One Team-reroll (new franchise, SAME season) and one Year-reroll (new season, SAME
    franchise) per game — each only offered when such a cell exists.

Playthrough model — a SKILL MIXTURE so the percentile reflects the real spread of human
play (not just coin-flipping). Each playthrough draws a skill s ~ Uniform(0,1):
  - with probability s the player makes the GREEDY-OPTIMAL move this spin — the unused
    roster player + open slot with the highest rating in the pool's actual ratings,
  - otherwise a uniformly random unused player into a random open slot.
Rerolls are used randomly (prob `p_reroll`) as before. Averaged over s, totals span from
careless (~random) up to near the perfect-card ceiling, so a great run lands in the high
90s and a near-perfect run approaches 100 — i.e. the percentile actually tracks how good
the picked total is relative to what THIS pool's data makes achievable. Deterministic
given `seed`.
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402


def _build_pool(data: dict, abilities: list[str], seasons=None):
    """Flatten goat-data into fast lookup structures for the grid.

    Returns (cells, by_season, by_franchise) where:
      cells[key] = list of (player_id, (r0..r5)) for that (season, franchise) roster,
      by_season[season]   = [franchise, ...] with a legal cell that season,
      by_franchise[fr]     = [season, ...]    with a legal cell for that franchise.
    Cell key is "SEASON_FRANCHISE" exactly as the app uses it.

    `seasons` (a set of time-axis tokens, e.g. {"2000s","2010s","2020s"}) restricts the
    grid to an ERA — the exact filter the app's filterGameByEra applies, so the simulated
    distribution matches what that era's players can actually draw.
    """
    ratings_by_id = {p["id"]: tuple(int(p["ratings"][a]) for a in abilities) for p in data["players"]}
    pool = data["pool"]
    cells, by_season, by_franchise = {}, {}, {}
    for key, roster in pool["rosters"].items():
        # the time-axis token is OPAQUE: an int season ("1996") or a decade label
        # ("1990s") depending on pool_grain — never parsed, only used as a grouping key.
        season, fr = key.split("_", 1)
        if seasons is not None and season not in seasons:
            continue
        cells[key] = [(pid, ratings_by_id[pid]) for pid in roster]
        by_season.setdefault(season, []).append(fr)
        by_franchise.setdefault(fr, []).append(season)
    return cells, by_season, by_franchise


def _play_once(rng, cells, keys, by_season, by_franchise, p_reroll):
    """Simulate one playthrough at a random skill level; return the final 6-slot total.

    A player may be drafted into more than one slot — there is no one-player-once rule."""
    skill = rng.random()
    open_slots = [0, 1, 2, 3, 4, 5]
    reroll_team = True
    reroll_year = True
    total = 0

    for _ in range(6):
        key = keys[rng.randrange(len(keys))]
        season, fr = key.split("_", 1)   # opaque axis token (int season OR decade label)

        if (reroll_team or reroll_year) and rng.random() < p_reroll:
            options = []
            if reroll_team and len(by_season[season]) >= 2:
                options.append("team")
            if reroll_year and len(by_franchise[fr]) >= 2:
                options.append("year")
            if options:
                choice = rng.choice(options)
                if choice == "team":
                    reroll_team = False
                    fr = rng.choice([f for f in by_season[season] if f != fr])
                else:
                    reroll_year = False
                    season = rng.choice([s for s in by_franchise[fr] if s != season])
                key = f"{season}_{fr}"

        roster = cells[key]
        if rng.random() < skill:
            # greedy-optimal: best (player, open slot) rating on this roster (reuse allowed)
            best_val, best_slot = -1, open_slots[0]
            for _pid, ratings in roster:
                for slot in open_slots:
                    if ratings[slot] > best_val:
                        best_val, best_slot = ratings[slot], slot
            slot, val = best_slot, best_val
        else:
            # careless: random player into a random open slot
            _pid, ratings = roster[rng.randrange(len(roster))]
            slot = open_slots[rng.randrange(len(open_slots))]
            val = ratings[slot]

        open_slots.remove(slot)
        total += val

    return total


def build_table(data: dict, mc: dict, seasons=None) -> dict:
    abilities = mc["abilities"]
    cells, by_season, by_franchise = _build_pool(data, abilities, seasons)
    keys = list(cells.keys())
    rng = random.Random(mc["seed"])
    n = int(mc["n_sims"])
    p_reroll = float(mc["p_reroll"])

    counts = {}
    lo, hi = 10**9, -1
    for _ in range(n):
        s = _play_once(rng, cells, keys, by_season, by_franchise, p_reroll)
        counts[s] = counts.get(s, 0) + 1
        lo, hi = min(lo, s), max(hi, s)

    ceiling_total = int(data["ceiling"]["total"])
    anchor_pct = float(mc.get("ovr_anchor_pct", 98.2))
    table, cum, anchor = [], 0, None
    for s in range(lo, ceiling_total + 1):
        cum += counts.get(s, 0)
        pct = 100.0 * cum / n
        table.append([s, round(pct, 2)])
        # era-fair 99-anchor: the smallest total that anchor_pct% of this pool's runs stay
        # under — the same rarity of a 99 OVR whatever pool the game is being played on.
        if anchor is None and pct >= anchor_pct:
            anchor = s

    return {
        "min": lo,
        "max": ceiling_total,
        "n_sims": n,
        "seed": mc["seed"],
        "p_reroll": p_reroll,
        "ovr_anchor": anchor if anchor is not None else ceiling_total,
        "table": table,
    }


def main():
    cfg = common.load_config()
    out_path = common.repo_path(cfg["paths"]["out"])
    with open(out_path) as f:
        data = json.load(f)

    mc = cfg["montecarlo"]
    n_cells = len(data["pool"]["rosters"])
    print(f"[06] simulating {int(mc['n_sims']):,} legal random playthroughs "
          f"(seed={mc['seed']}, p_reroll={mc['p_reroll']}) over {n_cells} grid cells…")
    out = build_table(data, mc)

    # per-era tables: the same simulation restricted to each era's cells, so the app can
    # anchor a 99 OVR at the same rarity whatever pool the run was played on.
    out["eras"] = {}
    for era_id, seasons in (mc.get("eras") or {}).items():
        print(f"[06] simulating era '{era_id}' ({', '.join(seasons)})…")
        out["eras"][era_id] = build_table(data, mc, seasons=set(seasons))

    dest = common.repo_path(cfg["paths"]["percentile_out"])
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")

    tbl = out["table"]
    median = next((s for s, p in tbl if p >= 50), out["min"])
    print(f"[06] scores ranged {out['min']}..{out['max']} (ceiling {out['max']}); "
          f"median random total ≈ {median}")
    anchors = {"all": out["ovr_anchor"], **{k: v["ovr_anchor"] for k, v in out["eras"].items()}}
    print(f"[06] 99-OVR anchors (@{mc.get('ovr_anchor_pct', 98.2)}th pct): {anchors}")
    print(f"[06] wrote {dest}  ({len(tbl)} rows)")


if __name__ == "__main__":
    main()
