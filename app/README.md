# Six Spins — web app

The playable front-end (App spec v1). A single-session, mobile-first React game: spin six
random team-years, steal one ability rating from one player each spin, fill six slots, and
get a shareable percentile. ~60–90s per run, built to be screen-recorded on a phone.
Visual inspiration: [82-0.com](https://www.82-0.com/).

The app does **no** stat math. It reads pre-computed 0–100 ratings from `goat-data.json`,
sums the six locked ratings, and looks the total up in `percentile-table.json`. All rating
logic lives in the data workstream (`../pipeline`).

## Game modes (virality layer)

Every board is driven by a **seed**, so any run is reproducible and shareable as a link.
Six Spins ships as an **Unlimited** game — there is no one-a-day cadence. You keep spinning
fresh random boards and chase a **99 OVR** player.

- **Unlimited** (shipping) — play as many as you like; each gets a fresh random seed.
- **Daily** — one puzzle a day, the *same six spins for everyone* (`seed = "daily-<date>"`),
  saved to `localStorage`, un-re-rollable, powering a 🔥 **streak**. **PARKED** behind
  `DAILY_ENABLED` in [`config.js`](src/config.js) (currently `false`) — built and tested but
  not shipped. Every daily/archive/streak code path is gated on that flag.
- **Archive** — HoopGrids-style grid of past days. Part of the parked Daily feature; also
  gated on `DAILY_ENABLED`.

> Because Daily is parked, all user-facing copy (`index.html`, `public/how-to-play.html`,
> in-app text) describes Six Spins as an NBA **puzzle game** you keep playing — **not** a
> one-a-day daily puzzle. Keep new copy consistent with that until `DAILY_ENABLED` flips.

Determinism is **path-independent**: draws are keyed by `(seed, spinNumber, purpose, cell)`
rather than a sequential stream, so a player's optional rerolls never shift the cells anyone
else is dealt, and a reroll from a given cell always yields the same alternate. See
[`game/rng.js`](src/game/rng.js), [`game/daily.js`](src/game/daily.js),
[`game/storage.js`](src/game/storage.js).

**Share** is a Wordle-style text payload (`ui/share.js`): six tier-colored squares (the
*shape* of your GOAT, players hidden) + percentile + tier + comp + a deep link
(`?d=<date>` for daily, `?seed=<seed>` to reproduce an unlimited board). Primary CTA uses
the Web Share API (native sheet on mobile, image attached), falling back to clipboard copy.

## Run

```bash
cd app
npm install
npm run dev        # predev syncs ../data/*.json into public/data + builds placeholder files
# open http://localhost:5180
```

`npm run build` → static bundle in `dist/`. `npm test` → Vitest (logic + integration + DOM).

## Data source switch (App spec §1–2)

The app codes against the **schema**, not a dataset. One env var flips the source:

```bash
npm run dev                                  # real data (default): ../data/goat-data.json
VITE_DATA_SOURCE=placeholder npm run dev     # schema-exact fake data, no images
```

`scripts/sync-data.mjs` mirrors the real shipped files into `public/data/` (single source of
truth — the app never forks the dataset). `scripts/make-placeholder.mjs` generates
`*.placeholder.json` so the whole app is testable before/without the real file.

> Notes on the shipped `goat-data.json`:
> - Ability key is **`scoring`** (not the spec draft's `finishing`) — the app follows the real file (`src/constants.js`).
> - **Team and Year are independent axes.** The pool is a GRID: `pool.franchises` (team axis) ×
>   `pool.seasons` (year axis) with a `pool.rosters` map of the legal `"SEASON_FRANCHISE"` cells.
>   A spin lands on a cell; **Reroll Team** swaps only the franchise (same year), **Reroll Year**
>   only the season (same franchise).
> - Rating unit is **team_split**: each player entry is one (player, season, team) stint, so a
>   traded player appears once per team with that team's stats.

## Layout

```
src/
  constants.js          # the six fixed/ordered ABILITIES (keys + labels + icons)
  game/
    reducer.js          # PURE headless game logic (§3) — no data, no RNG, no clock
    reducer.test.js     # §3 invariants (6 picks end it, one-player-once, rerolls once, ...)
    useGame.js          # controller hook: RNG team draws + ratings lookups -> dispatch
    integration.test.js # drives a full game against the REAL data + percentile table
  data/
    loader.js           # fetch + DATA_SOURCE switch + getPercentile(total)
    validate.js         # startup schema validation (loud in dev, graceful in prod) + ceiling
  ui/                   # GoatCard, SpinReel, RosterBoard, Avatar, helpers
  screens/              # TitleScreen, GameScreen, RevealScreen, ResultScreen
  app.render.test.jsx   # jsdom: boot -> spin -> roster -> reroll -> pick -> reveal -> result
scripts/                # sync-data, make-placeholder
public/data/            # synced real + generated placeholder JSON (gitignored)
```

## How it maps to the App spec

| Spec § | Where |
|---|---|
| §1 data contract | `data/loader.js` (builds the franchise×year grid indexes) + `data/validate.js` |
| §2 placeholder-first + `DATA_SOURCE` | `scripts/*` (placeholder is a grid too) + `VITE_DATA_SOURCE` |
| §3 headless reducer + invariants | `game/reducer.js` (independent franchise/season axes) + `game/reducer.test.js` |
| §4 screens & flow | `screens/*`, persistent `ui/GoatCard.jsx`, two-axis reroll bar in `GameScreen` |
| §5 feel & animation | `ui/TeamYearReel.jsx` (independent Team + Year reels), `RevealScreen` 6-beat count-up + percentile slam + confetti |
| §6 result card | `screens/ResultScreen.jsx` — `html-to-image` download, Play Again |
| §7 architecture | React + `useReducer`, fully static data layer, no backend |

Renders **complete with zero images** (initials + team-color fallback) — real photo/logo
files aren't shipped, only a manifest of required paths (`HAS_ASSETS` in `constants.js`).
