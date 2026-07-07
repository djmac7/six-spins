import { describe, it, expect } from 'vitest'
import { parseFilters, buildFilterContext, indexPlayers } from './filterQuery.js'

// A tiny stand-in pool. ids follow the real "slug_season_FR" shape so season parses from the id.
const PLAYERS = [
  mk('rodmde01', 1996, 'CHI', 'Dennis Rodman', { rebounding: 99, scoring: 20, shooting: 30, defense: 90, clutch: 70, playmaking: 40 }, { ppg: 5.5, rpg: 14.9, apg: 2.5, spg: 0.7, bpg: 0.6 }),
  mk('jordami01', 1996, 'CHI', 'Michael Jordan', { rebounding: 70, scoring: 99, shooting: 88, defense: 95, clutch: 99, playmaking: 80 }, { ppg: 30.4, rpg: 6.6, apg: 4.3, spg: 2.2, bpg: 0.5 }),
  mk('curryst01', 2016, 'GSW', 'Stephen Curry', { rebounding: 45, scoring: 95, shooting: 99, defense: 60, clutch: 92, playmaking: 90 }, { ppg: 30.1, rpg: 5.4, apg: 6.7, spg: 2.1, bpg: 0.2 }),
  mk('mutomdi01', 1996, 'DEN', 'Dikembe Mutombo', { rebounding: 92, scoring: 40, shooting: 20, defense: 99, clutch: 60, playmaking: 25 }, { ppg: 11.8, rpg: 11.8, apg: 1.5, spg: 0.4, bpg: 4.5 }),
  mk('bryanko01', 2006, 'LAL', 'Kobe Bryant', { rebounding: 60, scoring: 98, shooting: 85, defense: 88, clutch: 95, playmaking: 75 }, { ppg: 35.4, rpg: 5.3, apg: 4.5, spg: 1.8, bpg: 0.4 }),
]

function mk(slug, season, fr, name, ratings, stats) {
  return { id: `${slug}_${season}_${fr}`, player_id: slug, name, team_label: `${season} ${fr === 'CHI' ? 'Bulls' : fr === 'GSW' ? 'Warriors' : fr === 'DEN' ? 'Nuggets' : 'Lakers'}`, ratings, stats }
}

const ctx = buildFilterContext({ players: PLAYERS })
const INDEX = indexPlayers({ players: PLAYERS })
const run = (q) => {
  const { filters } = parseFilters(q, ctx)
  return INDEX.filter((p) => filters.every((f) => f.test(p))).map((p) => p.name)
}

describe('parseFilters', () => {
  it('indexes season from the id', () => {
    expect(INDEX.find((p) => p.name === 'Kobe Bryant')._season).toBe(2006)
  })

  it('elite rating qualifier sets a 90+ floor', () => {
    expect(run('elite rebounders')).toEqual(['Dennis Rodman', 'Dikembe Mutombo'])
  })

  it('bare ability means good-or-better (70+)', () => {
    // shooting >= 70: Jordan(88), Curry(99), Kobe(85)
    expect(run('shooters')).toEqual(['Michael Jordan', 'Stephen Curry', 'Kobe Bryant'])
  })

  it('negative qualifier flips to a ceiling', () => {
    // weak shooting <= 45: Rodman(30), Mutombo(20)
    expect(run('weak shooting')).toEqual(['Dennis Rodman', 'Dikembe Mutombo'])
  })

  it('numbers attach to per-game stats, not ratings', () => {
    expect(run('20+ ppg')).toEqual(['Michael Jordan', 'Stephen Curry', 'Kobe Bryant'])
    expect(run('at least 4 blocks')).toEqual(['Dikembe Mutombo'])
    expect(run('under 1 bpg')).toEqual(['Dennis Rodman', 'Michael Jordan', 'Stephen Curry', 'Kobe Bryant'])
  })

  it('"scores N" verb maps to points', () => {
    expect(run('scores 35+')).toEqual(['Kobe Bryant'])
  })

  it('decades filter the season range', () => {
    expect(run('90s')).toEqual(['Dennis Rodman', 'Michael Jordan', 'Dikembe Mutombo'])
    expect(run('2010s')).toEqual(['Stephen Curry'])
  })

  it('year ranges and open bounds', () => {
    expect(run('between 2000 and 2020')).toEqual(['Stephen Curry', 'Kobe Bryant'])
    expect(run('before 2000')).toEqual(['Dennis Rodman', 'Michael Jordan', 'Dikembe Mutombo'])
    expect(run('since 2010')).toEqual(['Stephen Curry'])
  })

  it('teams match by nickname (full or last word)', () => {
    expect(run('Bulls')).toEqual(['Dennis Rodman', 'Michael Jordan'])
    expect(run('warriors')).toEqual(['Stephen Curry'])
  })

  it('combines criteria across categories (AND)', () => {
    expect(run('elite scorers from the 90s on the Bulls')).toEqual(['Michael Jordan'])
    expect(run('great defense 4+ blocks')).toEqual(['Dikembe Mutombo'])
  })

  it('falls back to a name search for unrecognized words', () => {
    expect(run('curry')).toEqual(['Stephen Curry'])
    expect(run('michael jordan')).toEqual(['Michael Jordan'])
  })

  it('produces human-readable chips for what it understood', () => {
    const { chips } = parseFilters('elite rebounders from the 90s', ctx)
    expect(chips).toContain('Elite Rebounding')
    expect(chips).toContain('1990s')
  })

  it('empty query yields no filters (everyone matches)', () => {
    expect(parseFilters('', ctx).filters).toEqual([])
    expect(run('   ')).toHaveLength(PLAYERS.length)
  })

  it('dedupes repeated criteria', () => {
    expect(parseFilters('shooters shooting shooters', ctx).filters).toHaveLength(1)
  })
})
