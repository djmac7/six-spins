import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ratingSquares, buildShareText } from './share.js'

// six slots in ABILITIES order: shooting, scoring, playmaking, perimeter_d, rim_protection, rebounding
// ratings sit on the decade-grain 2K-style scale (see ratingTier: 92/84/75/65)
const slots = [
  { rating: 95 }, // elite -> blue
  { rating: 86 }, // great -> green
  { rating: 78 }, // good  -> yellow
  { rating: 68 }, // mid   -> orange
  { rating: 58 }, // low   -> red
  { rating: 88 }, // great -> green
]
const comp = { player: { name: 'LeBron James', team_label: '2009 Cavaliers' }, match: 91 }

describe('ratingSquares', () => {
  it('maps each ability rating to a heat square, in order', () => {
    expect(ratingSquares(slots)).toBe('🟩🟦🟪🟧🟥🟦')
  })
  it('treats a missing slot as the lowest tier', () => {
    expect(ratingSquares([])).toBe('🟥🟥🟥🟥🟥🟥')
  })
})

describe('buildShareText', () => {
  const text = buildShareText({ ovr: 94, slots, url: 'https://x.io/six/' })

  it('is spoiler-light: contains the square shape but no player/team the user stole', () => {
    expect(text).toContain('🟩🟦🟪🟧🟥🟦')
    expect(text).not.toMatch(/Bulls|Lakers|Jordan/)
  })
  it('leads with the brand and the brag (OVR) in one plain sentence', () => {
    expect(text).toContain('I built a 94 OVR NBA player on Six Spins')
  })
  it('carries its own URL so the share is a distribution vector', () => {
    expect(text).toContain('https://x.io/six/')
  })
  it('ends on the competitive dare (the hook that earns the tap)', () => {
    expect(text).toContain('Can you beat my score?')
  })
})

describe('buildShareText — mode labels & deep links', () => {
  // shareLink derives the deep link from the live origin; stub it for the node test env.
  beforeAll(() => { globalThis.location = { origin: 'https://x.io', pathname: '/six/' } })
  afterAll(() => { delete globalThis.location })

  it('daily run names its puzzle number and links to ?d=<date>', () => {
    const t = buildShareText({
      ovr: 88, slots,
      meta: { mode: 'daily', date: '2026-06-29', dayNumber: 29 },
    })
    expect(t).toContain('Daily #29')
    expect(t).toMatch(/\?d=2026-06-29/)
  })

  it('challenge/unlimited run links to ?seed=<seed> to reproduce the board', () => {
    const t = buildShareText({
      ovr: 85, slots,
      meta: { mode: 'challenge', seed: 'uabc123' },
    })
    expect(t).toContain('I built a 85 OVR NBA player')
    expect(t).toMatch(/\?seed=uabc123/)
  })
})
