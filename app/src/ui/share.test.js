import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ratingSquares, buildShareText } from './share.js'

// six slots in ABILITIES order: shooting, scoring, playmaking, perimeter_d, rim_protection, rebounding
const slots = [
  { rating: 95 }, // elite -> blue
  { rating: 84 }, // great -> green
  { rating: 70 }, // good  -> yellow
  { rating: 50 }, // mid   -> orange
  { rating: 30 }, // low   -> red
  { rating: 88 }, // great -> green
]
const comp = { player: { name: 'LeBron James', team_label: '2009 Cavaliers' }, match: 91 }

describe('ratingSquares', () => {
  it('maps each ability rating to a heat square, in order', () => {
    expect(ratingSquares(slots)).toBe('🟦🟩🟨🟧🟥🟩')
  })
  it('treats a missing slot as the lowest tier', () => {
    expect(ratingSquares([])).toBe('🟥🟥🟥🟥🟥🟥')
  })
})

describe('buildShareText', () => {
  const text = buildShareText({ percentile: 97, total: 428, ceiling: 470, slots, comp, url: 'https://x.io/six/' })

  it('is spoiler-light: contains the square shape but no player/team the user stole', () => {
    expect(text).toContain('🟦🟩🟨🟧🟥🟩')
    expect(text).not.toMatch(/Bulls|Lakers|Jordan/)
  })
  it('leads with the brand and the brag (percentile + tier)', () => {
    expect(text).toContain('SIX SPINS')
    expect(text).toContain('97th percentile')
    expect(text).toContain('428/470')
  })
  it('carries its own URL so the share is a distribution vector', () => {
    expect(text).toContain('https://x.io/six/')
  })
  it('includes the debate-bait comp', () => {
    expect(text).toContain('plays like LeBron James')
  })
})

describe('buildShareText — mode labels & deep links', () => {
  // shareLink derives the deep link from the live origin; stub it for the node test env.
  beforeAll(() => { globalThis.location = { origin: 'https://x.io', pathname: '/six/' } })
  afterAll(() => { delete globalThis.location })

  it('daily run is titled with its puzzle number and links to ?d=<date>', () => {
    const t = buildShareText({
      percentile: 88, total: 400, ceiling: 470, slots, comp,
      meta: { mode: 'daily', date: '2026-06-29', dayNumber: 29 },
    })
    expect(t).toContain('SIX SPINS · Daily #29')
    expect(t).toMatch(/\?d=2026-06-29/)
  })

  it('challenge/unlimited run links to ?seed=<seed> to reproduce the board', () => {
    const t = buildShareText({
      percentile: 60, total: 350, ceiling: 470, slots, comp,
      meta: { mode: 'challenge', seed: 'uabc123' },
    })
    expect(t).toContain('SIX SPINS · Challenge')
    expect(t).toMatch(/\?seed=uabc123/)
  })
})
