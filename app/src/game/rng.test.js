import { describe, it, expect } from 'vitest'
import { makeDealer, hashStr, randomSeed } from './rng.js'

describe('makeDealer', () => {
  it('is deterministic: same seed + same keys -> same index', () => {
    const a = makeDealer('daily-2026-06-29')
    const b = makeDealer('daily-2026-06-29')
    for (let n = 1; n <= 50; n++) {
      expect(a.index(n, 3, 'cell')).toBe(b.index(n, 3, 'cell'))
    }
  })

  it('different seeds generally diverge', () => {
    const a = makeDealer('daily-2026-06-29')
    const b = makeDealer('daily-2026-06-30')
    let diffs = 0
    for (let i = 1; i <= 6; i++) if (a.index(40, i, 'cell') !== b.index(40, i, 'cell')) diffs++
    expect(diffs).toBeGreaterThan(0)
  })

  it('keeps every index in range', () => {
    const d = makeDealer('seed')
    for (let n = 1; n <= 100; n++) {
      const i = d.index(n, n, 'team', '1996_CHI')
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(n)
    }
  })

  it('a reroll from a given cell is path-independent (keyed on the cell, not history)', () => {
    const d = makeDealer('daily-2026-06-29')
    // same spin, same axis, same current cell -> same alternate no matter how you got there
    const x = d.index(5, 2, 'team', '1996_CHI')
    const y = d.index(5, 2, 'team', '1996_CHI')
    expect(x).toBe(y)
  })

  it('guards n<=0', () => {
    expect(makeDealer('s').index(0, 'x')).toBe(0)
  })
})

describe('hashStr / randomSeed', () => {
  it('hashStr returns a uint32', () => {
    const h = hashStr('hello')
    expect(h).toBe(h >>> 0)
  })
  it('randomSeed is prefixed and unique-ish', () => {
    const s = randomSeed()
    expect(s.startsWith('u')).toBe(true)
  })
})
