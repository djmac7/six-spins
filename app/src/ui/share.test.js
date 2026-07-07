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
  const text = buildShareText({ ovr: 94, slots, comp, url: 'https://x.io/six/' })

  it('is spoiler-light: contains the square shape but no player/team the user stole', () => {
    expect(text).toContain('🟩🟦🟪🟧🟥🟦')
    expect(text).not.toMatch(/Bulls|Lakers|Jordan/)
  })
  it('leads with the brand and the brag (OVR)', () => {
    expect(text).toContain('SIX SPINS')
    expect(text).toContain('94 OVR')
  })
  it('carries its own URL so the share is a distribution vector', () => {
    expect(text).toContain('https://x.io/six/')
  })
  it('includes the debate-bait comp', () => {
    expect(text).toContain('plays like LeBron James')
  })
  it('brags with an OVR-tier verdict and ends on a competitive dare (the hook that earns the tap)', () => {
    expect(text).toContain('a superstar') // 94 OVR -> Superstar
    expect(text).toContain('Think you can top it?')
  })
})

describe('buildShareText — OVR-aware verdict & dare', () => {
  const base = { slots, comp: null, url: '' }
  it('a 99 OVR flexes the GOAT line and dares you to top it', () => {
    const t = buildShareText({ ...base, ovr: 99 })
    expect(t).toContain('GOAT')
    expect(t).toContain('Good luck topping it')
  })
  it('a low OVR leans into the self-burn and baits a rematch', () => {
    const t = buildShareText({ ...base, ovr: 60 })
    expect(t).toContain('deep-bench depth')
    expect(t).toContain('beat this')
  })
})

describe('buildShareText — mode labels & deep links', () => {
  // shareLink derives the deep link from the live origin; stub it for the node test env.
  beforeAll(() => { globalThis.location = { origin: 'https://x.io', pathname: '/six/' } })
  afterAll(() => { delete globalThis.location })

  it('daily run is titled with its puzzle number and links to ?d=<date>', () => {
    const t = buildShareText({
      ovr: 88, slots, comp,
      meta: { mode: 'daily', date: '2026-06-29', dayNumber: 29 },
    })
    expect(t).toContain('SIX SPINS · Daily #29')
    expect(t).toMatch(/\?d=2026-06-29/)
  })

  it('challenge/unlimited run links to ?seed=<seed> to reproduce the board', () => {
    const t = buildShareText({
      ovr: 85, slots, comp,
      meta: { mode: 'challenge', seed: 'uabc123' },
    })
    expect(t).toContain('SIX SPINS · Challenge')
    expect(t).toMatch(/\?seed=uabc123/)
  })
})
