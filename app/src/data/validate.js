// Startup validation (App spec §1 resilience): fail loudly in dev, fall back gracefully
// in prod. Checks the contract the whole app relies on so a malformed file is caught at
// boot, not mid-spin. Pool is a GRID: franchises (team axis) × seasons (year axis) with a
// rosters map of the legal cells.
import { ABILITY_KEYS } from '../constants.js'

export function validateGameData(data) {
  const errors = []
  const warns = []

  if (!data || typeof data !== 'object') return { errors: ['data is not an object'], warns }
  if (!Array.isArray(data.players)) errors.push('players[] missing')
  if (!data.pool || typeof data.pool !== 'object') errors.push('pool{} missing')
  if (errors.length) return { errors, warns }

  const byId = new Map()
  for (const p of data.players) {
    if (!p.id) { errors.push('a player is missing an id'); continue }
    byId.set(p.id, p)
    const r = p.ratings || {}
    for (const k of ABILITY_KEYS) {
      const v = r[k]
      if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`player ${p.id} rating ${k} is not a number`)
      else if (v < 0 || v > 100) errors.push(`player ${p.id} rating ${k}=${v} out of 0..100`)
    }
  }

  const pool = data.pool
  if (!Array.isArray(pool.franchises) || pool.franchises.length === 0) errors.push('pool.franchises[] empty')
  if (!Array.isArray(pool.seasons) || pool.seasons.length === 0) errors.push('pool.seasons[] empty')
  if (!pool.rosters || typeof pool.rosters !== 'object') errors.push('pool.rosters{} missing')

  if (pool.rosters) {
    const cells = Object.entries(pool.rosters)
    if (cells.length === 0) errors.push('pool.rosters{} has no cells')
    for (const [key, roster] of cells) {
      if (!Array.isArray(roster) || roster.length === 0) { errors.push(`cell ${key} has no roster`); continue }
      for (const pid of roster) {
        if (!byId.has(pid)) errors.push(`cell ${key} roster id ${pid} does not resolve to a player`)
      }
      if (roster.length < 6) warns.push(`cell ${key} roster has <6 players (${roster.length})`)
    }
  }

  if (!data.ceiling || typeof data.ceiling.total !== 'number') {
    warns.push('ceiling.total absent, will derive from per-ability maxima')
  }

  return { errors, warns }
}

// Prefer the file's ceiling; otherwise derive from per-ability maxima across pool players (§1).
export function resolveCeiling(data) {
  if (data.ceiling && typeof data.ceiling.total === 'number') return data.ceiling
  const poolIds = new Set(Object.values(data.pool.rosters || {}).flat())
  const reachable = data.players.filter((p) => poolIds.has(p.id))
  const pool = reachable.length ? reachable : data.players
  const ceiling = { total: 0 }
  for (const k of ABILITY_KEYS) {
    const m = pool.reduce((mx, p) => Math.max(mx, p.ratings?.[k] ?? 0), 0)
    ceiling[k] = m
    ceiling.total += m
  }
  return ceiling
}
