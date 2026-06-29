import { describe, it, expect } from 'vitest'
import { franchiseEra } from './franchiseEras.js'
import { teamDisplay } from '../ui/helpers.js'

describe('franchiseEra', () => {
  it('maps a pre-relocation OKC season to the Seattle SuperSonics', () => {
    expect(franchiseEra('OKC', 1999)).toMatchObject({ id: 'SEA', name: 'SuperSonics' })
  })

  it('treats the franchise as current from its first season under the new identity', () => {
    expect(franchiseEra('OKC', 2008)).toMatchObject({ id: 'SEA' }) // last Sonics season
    expect(franchiseEra('OKC', 2009)).toBeNull() // first Thunder season
  })

  it('resolves both Charlotte stints filed under CHO (Hornets, then Bobcats)', () => {
    expect(franchiseEra('CHO', 1995)).toMatchObject({ id: 'CHH', name: 'Hornets' })
    expect(franchiseEra('CHO', 2010)).toMatchObject({ id: 'CHA', name: 'Bobcats' })
    expect(franchiseEra('CHO', 2015)).toBeNull() // back to the current Hornets
  })

  it('returns null for franchises with no historical alias', () => {
    expect(franchiseEra('LAL', 1985)).toBeNull()
    expect(franchiseEra('OKC', null)).toBeNull()
  })
})

describe('teamDisplay era integration', () => {
  const game = {
    franchisesById: new Map([['OKC', { id: 'OKC', name: 'Thunder', color: '#007AC1' }]]),
  }

  it('renders the historical name, logo id, and color for an old season', () => {
    const t = teamDisplay(game, 'OKC', 1999)
    expect(t).toMatchObject({ id: 'OKC', logoId: 'SEA', name: 'SuperSonics', label: '1999 SuperSonics' })
    expect(t.color).toBe('#00653A')
  })

  it('renders the current identity for a modern season', () => {
    const t = teamDisplay(game, 'OKC', 2020)
    expect(t).toMatchObject({ id: 'OKC', logoId: 'OKC', name: 'Thunder', label: '2020 Thunder' })
  })
})
