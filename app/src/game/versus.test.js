import { describe, it, expect } from 'vitest'
import { makeDealer, randomSeed } from './rng.js'
import { encodeRun, decodeRun } from '../ui/share.js'
import { ABILITY_KEYS } from '../constants.js'

// The 1v1 guarantee: a challenge link's seed deals both players the exact same six spins.
describe('1v1 challenge links (seed-based)', () => {
  it('the same seed deals both players identical spins', () => {
    const seed = randomSeed()
    const a = makeDealer(seed)
    const b = makeDealer(seed)
    for (let spin = 1; spin <= 6; spin++) {
      expect(a.index(500, spin, 'cell')).toBe(b.index(500, spin, 'cell'))
    }
  })

  const game = {
    players: ABILITY_KEYS.map((_, i) => ({
      id: `player${i}`,
      ratings: Object.fromEntries(ABILITY_KEYS.map((k, j) => [k, 80 + i + j])),
    })),
  }
  const slots = ABILITY_KEYS.map((ability, i) => ({ ability, playerId: `player${i}`, rating: 80 + 2 * i }))

  it('a run of picks round-trips through the challenge link encoding', () => {
    const seed = 'utestseed'
    const encoded = encodeRun(slots, game, seed)
    expect(encoded).toMatch(/^[0-9a-z]{24}$/) // compact + opaque: no player ids in the URL
    const decoded = decodeRun(encoded, game, seed)
    expect(decoded).toHaveLength(6)
    expect(decoded[0]).toEqual({ playerId: 'player0', rating: 80 })
    expect(decoded[5]).toEqual({ playerId: 'player5', rating: 90 })
  })

  it('rejects malformed, tampered, or wrong-seed run params', () => {
    const encoded = encodeRun(slots, game, 'utestseed')
    expect(decodeRun(null, game, 'utestseed')).toBeNull()
    expect(decodeRun('junk', game, 'utestseed')).toBeNull()
    expect(decodeRun(encoded, game, 'otherseed')).toBeNull() // mask is seed-derived
    expect(decodeRun('z' + encoded.slice(1), game, 'utestseed')).toBeNull() // integrity check
  })
})
