// Data loader + the DATA_SOURCE switch (App spec §1–2). The app codes against the schema,
// not a specific dataset: flip VITE_DATA_SOURCE=placeholder to build/test on fake data.
// The pool is a GRID — franchises × seasons — so Team and Year reroll independently.
import { validateGameData, resolveCeiling } from './validate.js'

const SOURCE = import.meta.env.VITE_DATA_SOURCE === 'placeholder' ? 'placeholder' : 'real'
const B = import.meta.env.BASE_URL // '/' in dev, './' in the static build

const FILES = {
  real: { data: `${B}data/goat-data.json`, pct: `${B}data/percentile-table.json` },
  placeholder: { data: `${B}data/goat-data.placeholder.json`, pct: `${B}data/percentile-table.placeholder.json` },
}

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.json()
}

// score<->percentile model over [min,max]. getPercentile(total)->0..100, and the inverse
// scoreForPercentile(pct) -> the smallest total score that reaches that percentile.
function makePercentile(pctTable) {
  const { min, max, table } = pctTable
  const arr = new Float64Array(max - min + 1)
  for (const [score, pct] of table) {
    if (score >= min && score <= max) arr[score - min] = pct
  }
  for (let i = 1; i < arr.length; i++) if (arr[i] === 0 && arr[i - 1] > 0) arr[i] = arr[i - 1]
  const getPercentile = (total) => {
    const t = Math.round(total)
    if (t <= min) return arr[0] ?? 0
    if (t >= max) return arr[arr.length - 1] ?? 100
    return arr[t - min]
  }
  const scoreForPercentile = (targetPct) => {
    for (let i = 0; i < arr.length; i++) if (arr[i] >= targetPct) return min + i
    return max
  }
  return { getPercentile, scoreForPercentile }
}


// Build the grid indexes the game needs from pool.rosters keys ("SEASON_FRANCHISE").
function buildPool(pool) {
  const cells = new Map() // key -> [playerId,...]
  const bySeason = new Map() // season -> [franchise,...]
  const byFranchise = new Map() // franchise -> [season,...]
  for (const [key, roster] of Object.entries(pool.rosters)) {
    cells.set(key, roster)
    const i = key.indexOf('_')
    // OPAQUE time-axis token: an int season ("1996") or a decade label ("1990s")
    // depending on the data's pool_grain — kept as the string from the cell key.
    const season = key.slice(0, i)
    const fr = key.slice(i + 1)
    if (!bySeason.has(season)) bySeason.set(season, [])
    bySeason.get(season).push(fr)
    if (!byFranchise.has(fr)) byFranchise.set(fr, [])
    byFranchise.get(fr).push(season)
  }
  return { cells, cellList: [...cells.keys()], bySeason, byFranchise }
}

// Narrow a loaded game to an era (a subset of the time-axis tokens). Rebuilds the grid
// indexes over the surviving cells; everything else (players, ratings, ceiling, percentile
// model) is shared with the full pool. `seasons: null` returns the game untouched.
export function filterGameByEra(game, seasons) {
  if (!seasons) return game
  const keep = new Set(seasons.map(String))
  const cells = new Map()
  const bySeason = new Map()
  const byFranchise = new Map()
  for (const [key, roster] of game.cells) {
    const i = key.indexOf('_')
    const season = key.slice(0, i)
    if (!keep.has(season)) continue
    const fr = key.slice(i + 1)
    cells.set(key, roster)
    if (!bySeason.has(season)) bySeason.set(season, [])
    bySeason.get(season).push(fr)
    if (!byFranchise.has(fr)) byFranchise.set(fr, [])
    byFranchise.get(fr).push(season)
  }
  return {
    ...game,
    cells,
    cellList: [...cells.keys()],
    bySeason,
    byFranchise,
    seasons: game.seasons.filter((s) => keep.has(String(s))),
  }
}

export async function loadGameData() {
  const f = FILES[SOURCE]
  const [data, pct] = await Promise.all([getJSON(f.data), getJSON(f.pct)])

  const { errors, warns } = validateGameData(data)
  if (warns.length) warns.forEach((w) => console.warn('[data] ' + w))
  if (errors.length) {
    const msg = `[data] ${errors.length} validation error(s):\n  ` + errors.slice(0, 12).join('\n  ')
    if (import.meta.env.DEV) throw new Error(msg)
    console.error(msg)
  }

  const ceiling = resolveCeiling(data)
  const grid = buildPool(data.pool)
  const { getPercentile, scoreForPercentile } = makePercentile(pct)

  return {
    source: SOURCE,
    meta: data.meta || {},
    players: data.players,
    playersById: new Map(data.players.map((p) => [p.id, p])),
    franchises: data.pool.franchises,
    franchisesById: new Map(data.pool.franchises.map((fr) => [fr.id, fr])),
    seasons: data.pool.seasons,
    ...grid,
    ceiling,
    getPercentile,
    scoreForPercentile,
  }
}
