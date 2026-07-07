// Generate schema-exact PLACEHOLDER data (App spec §2) so the whole app — loop, UI,
// animation, reveal, result card — is fully testable before/without the real dataset.
// Deterministic (seeded). Pool is a GRID: franchises × seasons, with a rosters map of the
// legal cells (Team and Year reroll independently). Player ids are per (player, season,
// franchise) stints. NO image paths (initials/color fallback is the default path).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const destDir = join(here, '..', 'public', 'data')
mkdirSync(destDir, { recursive: true })

const ABILITIES = ['shooting', 'scoring', 'playmaking', 'defense', 'rebounding', 'clutch']

let seed = 1337
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const pick = (arr) => arr[ri(0, arr.length - 1)]

const FRANCHISES = [
  { id: 'CHI', name: 'Bulls', color: '#CE1141' },
  { id: 'LAL', name: 'Lakers', color: '#552583' },
  { id: 'BOS', name: 'Celtics', color: '#007A33' },
  { id: 'GSW', name: 'Warriors', color: '#1D428A' },
  { id: 'MIA', name: 'Heat', color: '#98002E' },
  { id: 'DET', name: 'Pistons', color: '#1D42BA' },
]
const SEASONS = [1991, 1996, 2004, 2013, 2016, 2023]
const FIRST = ['Marcus', 'Andre', 'Tyrese', 'Devin', 'Jalen', 'Kobe', 'Reggie', 'Dax', 'Quinn', 'Theo', 'Malik', 'Zion']
const LAST = ['Carter', 'Brooks', 'Holiday', 'Vega', 'Sloan', 'Reed', 'Park', 'Nash', 'Okafor', 'Bell', 'Frost', 'Ames']
const ARCHETYPES = {
  guard: { shooting: [55, 95], scoring: [50, 92], playmaking: [60, 98], defense: [45, 90], rebounding: [20, 55], clutch: [40, 90] },
  wing: { shooting: [50, 92], scoring: [55, 95], playmaking: [40, 80], defense: [55, 95], rebounding: [40, 75], clutch: [45, 92] },
  big: { shooting: [15, 60], scoring: [45, 88], playmaking: [20, 60], defense: [40, 95], rebounding: [65, 99], clutch: [40, 88] },
}

const players = []
const rosters = {}

for (const fr of FRANCHISES) {
  for (const season of SEASONS) {
    const n = ri(8, 11)
    const roster = []
    for (let i = 0; i < n; i++) {
      const arche = i < 4 ? pick(['guard', 'wing']) : i < 7 ? 'wing' : 'big'
      const id = `ph_${fr.id}${season}_${i}`
      const ratings = {}
      for (const a of ABILITIES) {
        const [lo, hi] = ARCHETYPES[arche][a]
        ratings[a] = ri(lo, hi)
      }
      const stats = arche === 'big'
        ? { ppg: ri(8, 26), rpg: ri(6, 14), apg: ri(1, 4), spg: ri(0, 1), bpg: ri(1, 3) }
        : { ppg: ri(8, 30), rpg: ri(2, 7), apg: ri(2, 10), spg: ri(1, 2), bpg: ri(0, 1) }
      const stats1 = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v + Math.round(rnd() * 9) / 10]))
      players.push({
        id, player_id: id, name: `${pick(FIRST)} ${pick(LAST)}`, ratings, stats: stats1,
        team_label: `${season} ${fr.name}`,
      })
      roster.push(id)
    }
    rosters[`${season}_${fr.id}`] = roster
  }
}

const poolIds = new Set(Object.values(rosters).flat())
const ceiling = { total: 0 }
for (const a of ABILITIES) {
  const m = Math.max(...players.filter((p) => poolIds.has(p.id)).map((p) => p.ratings[a]))
  ceiling[a] = m
  ceiling.total += m
}

const data = {
  meta: { source: 'PLACEHOLDER (generated)', rating_unit: 'team_split', snapshot: 'placeholder' },
  players,
  pool: { franchises: FRANCHISES, seasons: SEASONS, rosters },
  ceiling,
}
writeFileSync(join(destDir, 'goat-data.placeholder.json'), JSON.stringify(data))

const lo = Math.round(ceiling.total * 0.3)
const table = []
for (let s = lo; s <= ceiling.total; s++) {
  const x = (s - lo) / (ceiling.total - lo)
  table.push([s, Math.round(100 * Math.min(1, Math.pow(x, 1.6)) * 100) / 100])
}
// letter-grade cutoffs spread across the top of the range (schema mirrors the real table)
const c = ceiling.total
const grades = [
  ['S', Math.round(c * 0.985)], ['A', Math.round(c * 0.965)], ['B', Math.round(c * 0.94)],
  ['C', Math.round(c * 0.90)], ['D', Math.round(c * 0.85)], ['F', lo],
]
writeFileSync(join(destDir, 'percentile-table.placeholder.json'), JSON.stringify({ min: lo, max: ceiling.total, table, grades }))

console.log(`[make-placeholder] ${players.length} players, ${FRANCHISES.length}x${SEASONS.length} grid (${Object.keys(rosters).length} cells), ceiling ${ceiling.total}`)
