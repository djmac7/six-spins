import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reducer, initialState } from './reducer.js'
import { validateGameData, resolveCeiling } from '../data/validate.js'
import { ABILITY_KEYS } from '../constants.js'

// End-to-end check against the REAL shipped artifacts (the data contract, App spec §1):
// load goat-data.json + percentile-table.json, then drive a full legal game through the
// pure reducer — Team and Year as independent grid axes.
const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', '..', '..', 'data')
const dataPath = join(dataDir, 'goat-data.json')
const pctPath = join(dataDir, 'percentile-table.json')
const haveReal = existsSync(dataPath) && existsSync(pctPath)

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makePercentile(pct) {
  const { min, max, table } = pct
  const arr = new Float64Array(max - min + 1)
  for (const [s, p] of table) if (s >= min && s <= max) arr[s - min] = p
  return (total) => {
    const t = Math.round(total)
    if (t <= min) return arr[0]
    if (t >= max) return arr[arr.length - 1]
    return arr[t - min]
  }
}

describe.runIf(haveReal)('integration — real data contract (grid pool)', () => {
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))
  const pct = JSON.parse(readFileSync(pctPath, 'utf8'))
  const playersById = new Map(data.players.map((p) => [p.id, p]))
  const cells = new Map(Object.entries(data.pool.rosters))
  const cellList = [...cells.keys()]
  const getPercentile = makePercentile(pct)
  const ceiling = resolveCeiling(data)

  const parseCell = (key) => {
    const i = key.indexOf('_')
    return { season: Number(key.slice(0, i)), franchise: key.slice(i + 1) }
  }

  it('passes schema validation with zero errors', () => {
    const { errors } = validateGameData(data)
    expect(errors).toEqual([])
  })

  it('every grid cell resolves and is deep enough for a 6-pick game', () => {
    expect(cellList.length).toBeGreaterThan(20)
    for (const [key, roster] of cells) {
      expect(roster.length).toBeGreaterThanOrEqual(6)
      for (const id of roster) expect(playersById.has(id)).toBe(true)
    }
  })

  it('Team and Year axes are genuinely independent (a season has many franchises; a franchise many seasons)', () => {
    const bySeason = new Map(), byFr = new Map()
    for (const key of cellList) {
      const { season, franchise } = parseCell(key)
      bySeason.set(season, (bySeason.get(season) || 0) + 1)
      byFr.set(franchise, (byFr.get(franchise) || 0) + 1)
    }
    // at least one season offers multiple teams (Reroll Team) and one franchise multiple years (Reroll Year)
    expect(Math.max(...bySeason.values())).toBeGreaterThanOrEqual(2)
    expect(Math.max(...byFr.values())).toBeGreaterThanOrEqual(2)
  })

  it('traded players appear as separate per-team entries with their own ratings', () => {
    const byPlayerSeason = new Map()
    for (const p of data.players) {
      const k = `${p.player_id}_${p.season}`
      byPlayerSeason.set(k, (byPlayerSeason.get(k) || 0) + 1)
    }
    const traded = [...byPlayerSeason.values()].filter((n) => n > 1).length
    expect(traded).toBeGreaterThan(0) // team_split is in effect
  })

  it('drives a full legal game across grid cells and produces a valid result', () => {
    const rnd = mulberry32(7)
    const drawCell = () => parseCell(cellList[Math.floor(rnd() * cellList.length)])

    const first = drawCell()
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: first.franchise, season: first.season, ceilingTotal: ceiling.total })
    s = reducer(s, { type: 'SETTLE' })

    for (let spin = 0; spin < 6; spin++) {
      const roster = cells.get(`${s.currentSeason}_${s.currentFranchise}`)
      const openAbilities = s.slots.filter((x) => x.status === 'open').map((x) => x.ability)
      // genuinely greedy: best (unused player, open ability) pair on this roster — the pool now
      // spans every team-year (incl. weaker ones), so picking roster[0] blindly isn't a real
      // strategy and wouldn't reliably beat the random-skill Monte Carlo median.
      const avail = roster.map((id) => playersById.get(id)).filter((p) => !s.usedPlayerIds.includes(p.id))
      expect(avail.length).toBeGreaterThan(0)
      let player = avail[0], best = openAbilities[0], bestVal = -1
      for (const p of avail) for (const a of openAbilities) {
        if (p.ratings[a] > bestVal) { bestVal = p.ratings[a]; player = p; best = a }
      }
      expect(player).toBeTruthy()
      const last = spin === 5
      const next = last ? { franchise: null, season: null } : drawCell()
      s = reducer(s, { type: 'ASSIGN', playerId: player.id, ability: best, rating: player.ratings[best], nextFranchise: next.franchise, nextSeason: next.season })
      if (!last) s = reducer(s, { type: 'SETTLE' })
    }

    expect(s.phase).toBe('reveal')
    expect(s.slots.every((x) => x.status === 'filled')).toBe(true)
    expect(new Set(s.usedPlayerIds).size).toBe(6)
    expect(s.runningTotal).toBe(s.slots.reduce((a, x) => a + x.rating, 0))
    const p = getPercentile(s.result.total)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(100)
    expect(p).toBeGreaterThan(50) // greedy beats random
  })
})
