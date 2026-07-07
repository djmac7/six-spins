#!/usr/bin/env python
"""02 — Filter the universe (§4). Applied in order:
  1. League: NBA (+BAA, its direct predecessor) — ABA dropped.
  2. Era: season >= era_min_season.
  3. Minimum sample: G >= floor AND (MP >= floor OR MP untracked — pre-1952).
The surviving ~12-15k rows are THE UNIVERSE; all percentile ranking is against it.

Writes: data/work/universe.parquet
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from common import load_config, work_path


def main():
    cfg = load_config()
    df = pd.read_parquet(work_path(cfg, "ingested.parquet"))
    n0 = len(df)

    leagues = cfg["league"] if isinstance(cfg["league"], list) else [cfg["league"]]
    df = df[df["lg"].isin(leagues)]
    n_league = len(df)

    df = df[df["season"] >= int(cfg["era_min_season"])]
    n_era = len(df)

    mp_floor = cfg["min_sample"]["mp"]
    g_floor = cfg["min_sample"]["g"]
    mp = pd.to_numeric(df["mp"], errors="coerce")
    g = pd.to_numeric(df["g"], errors="coerce")
    # minutes weren't tracked before 1952 — a NaN-MP row qualifies on the games floor alone
    df = df[(g >= g_floor) & ((mp >= mp_floor) | mp.isna())]
    n_sample = len(df)

    df = df.reset_index(drop=True)
    df.to_parquet(work_path(cfg, "universe.parquet"), index=False)

    print(f"[02_filter] {n0:,} -> league({'/'.join(leagues)}) {n_league:,} "
          f"-> era(>={cfg['era_min_season']}) {n_era:,} "
          f"-> sample(MP>={mp_floor},G>={g_floor}) {n_sample:,} universe rows")


if __name__ == "__main__":
    main()
