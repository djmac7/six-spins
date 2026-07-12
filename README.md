# Six Spins — Data & Scoring pipeline

Offline tooling that turns bulk NBA season stats into the six 0–100 ratings the game
runs on. It runs once, produces a static `data/goat-data.json`, and is never called at
runtime. Implements `build-the-goat-data-scoring-spec.md` (v1).

Two hard rules (§0): **deterministic** (a plain script computes every number — no LLM
produces a value) and **ranked against the whole universe, not the curated pool** (editing
the pool never re-rates anyone).

## Layout (§10)
```
data/
  raw/                 # pinned Kaggle CSVs (gitignored; don't redistribute — see LICENSE-NOTE.md)
  work/                # intermediate parquet artifacts (regenerated)
  goat-data.json       # OUTPUT: scored universe + curated pool + ceiling
pipeline/
  config.yml           # every tunable: weights, K, thresholds, era cutoff
  pool.yml             # franchises (team axis) + seasons (year axis) -> a roster grid
  common.py            # shared schema/percentile/shrinkage helpers
  01_ingest.py         # load four season tables + join + dedup traded players (§2,§3)
  02_filter.py         # league + era + min-sample -> universe.parquet (§4)
  03_normalize.py      # per-100 volume + empirical-Bayes shrinkage (§5,§6)
  04_score.py          # component ranks -> composites -> final 0-100 ratings (§7,§8)
  05_curate.py         # team-year pool + assets manifest + ceiling -> goat-data.json (§9)
  06_montecarlo.py     # ratings -> percentile-table.json  (§12; run last, after scoring)
  qa.py                # §11 sanity checks
  run.py               # orchestrate 01..06 + qa
assets/                # manifest.json of required player photos / team logos
```

## Setup
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```
Drop the Kaggle dataset CSVs (`Advanced.csv`, `Per 100 Poss.csv`, `Player Totals.csv`,
`Player Per Game.csv`, and `Player Shooting.csv` for the optional at-rim component) into
`data/raw/`. Source: `kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats`.

## Run
```bash
python pipeline/run.py                       # build data/goat-data.json + percentile-table.json + run QA
python pipeline/run.py --no-qa               # build only
python pipeline/run.py --verify-determinism  # build twice, assert byte-identical (§11)
python pipeline/qa.py                         # re-run QA on an existing build
```
Stages can also be run individually in order (`python pipeline/01_ingest.py`, …).

## Where each spec section lives
| Spec § | Code |
|---|---|
| §2 ingest & join | `01_ingest.py`, `common.read_table` (fails loudly on missing columns) |
| §3 rating unit | `rating_unit` in config. **team_split** (default): `common.keep_team_stints` — one rating per (player, season, **team**); a traded player gets one entry per team, scored on only that team's stats. **season**: `common.collapse_to_season` keeps the `2TM/.../TOT` combined row |
| §3/§5 pool | `pool.yml` franchises × seasons; `05_curate` builds a roster for every valid (season, franchise) **grid cell** so Team and Year reroll independently |
| §4 universe filter | `02_filter.py` |
| §5 per-100 normalization | `03_normalize.py` (uses `*_per_100_poss` columns) |
| §6 shrinkage | `common.shrink` + `03_normalize.py` (toward each **season's** league mean) |
| §7 weighted components | `04_score.py` + `config.weights`; NaN components (e.g. no-3PA shooters) are renormalized away in `common.weighted_composite`. The at-rim finishing term is **computed but not wired into scoring** — `at_rim.enabled: false` (see config.yml note) |
| §8 percentile method | `common.percentile_rank` (`100·(rank−0.5)/N`, averaged ties); ceiling from pool maxima |
| §9 output | `05_curate.py` -> `goat-data.json` |
| §10 reproducibility | this layout; all tunables in `config.yml`, echoed into `meta` |
| §11 QA | `qa.py`; determinism via `run.py --verify-determinism` |
| §12 handoff | `06_montecarlo.py` — simulates legal random playthroughs (real rules) -> `percentile-table.json` |

## Tuning
Everything tunable is in `config.yml` (weights, shrinkage `K`, era cutoff, sample floors)
and `pool.yml` (which team-years are curated). After **any** change, **regenerate
`goat-data.json` and re-run the Monte Carlo together** — a stale percentile table lies (§10).
The QA name-regression checks (§11) are the cheapest way to catch a broken weight; if a
low-volume bench sniper tops Shooting, raise shrinkage `K` or the volume weight.
