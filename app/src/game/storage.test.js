import { describe, it, expect, beforeEach } from 'vitest'
import { saveDaily, getDaily, hasPlayedDaily, getStats } from './storage.js'

// in-memory localStorage so the store works under the node test env
function memStorage() {
  let m = {}
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v) },
    removeItem: (k) => { delete m[k] },
    clear: () => { m = {} },
  }
}

const rec = (total) => ({ total, ceiling: 470, percentile: 80, tier: 'allnba', squares: '🟩🟩🟩🟩🟩🟩', slots: [] })

beforeEach(() => { globalThis.localStorage = memStorage() })

describe('storage daily + streak', () => {
  it('saves and reads a daily result', () => {
    expect(hasPlayedDaily('2026-06-29')).toBe(false)
    saveDaily('2026-06-29', rec(420))
    expect(hasPlayedDaily('2026-06-29')).toBe(true)
    expect(getDaily('2026-06-29').total).toBe(420)
  })

  it('never overwrites the first score for a date', () => {
    saveDaily('2026-06-29', rec(420))
    saveDaily('2026-06-29', rec(999))
    expect(getDaily('2026-06-29').total).toBe(420)
  })

  it('counts a consecutive streak ending today', () => {
    saveDaily('2026-06-27', rec(400))
    saveDaily('2026-06-28', rec(410))
    saveDaily('2026-06-29', rec(420))
    const s = getStats('2026-06-29')
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
    expect(s.playedToday).toBe(true)
    expect(s.totalPlayed).toBe(3)
  })

  it('a gap breaks the current streak but best remembers the longest run', () => {
    saveDaily('2026-06-20', rec(1))
    saveDaily('2026-06-21', rec(1))
    saveDaily('2026-06-22', rec(1)) // run of 3
    saveDaily('2026-06-28', rec(1))
    saveDaily('2026-06-29', rec(1)) // run of 2 ending today
    const s = getStats('2026-06-29')
    expect(s.current).toBe(2)
    expect(s.best).toBe(3)
  })

  it('keeps the streak alive on a day not yet played (anchored to yesterday)', () => {
    saveDaily('2026-06-27', rec(1))
    saveDaily('2026-06-28', rec(1))
    const s = getStats('2026-06-29') // today not played yet
    expect(s.current).toBe(2)
    expect(s.playedToday).toBe(false)
  })
})
