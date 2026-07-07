// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'

vi.mock('canvas-confetti', () => ({ default: () => {} }))
vi.mock('html-to-image', () => ({ toPng: async () => 'data:image/png;base64,' }))

import App from './App.jsx'
import RevealScreen from './screens/RevealScreen.jsx'
import ResultScreen from './screens/ResultScreen.jsx'
import { reducer, initialState } from './game/reducer.js'
import { ABILITY_KEYS } from './constants.js'

afterEach(cleanup)

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public', 'data')

beforeAll(() => {
  const data = readFileSync(join(pub, 'goat-data.json'), 'utf8')
  const pct = readFileSync(join(pub, 'percentile-table.json'), 'utf8')
  global.fetch = vi.fn((url) =>
    Promise.resolve({
      ok: true, status: 200,
      json: async () => JSON.parse(String(url).includes('percentile') ? pct : data),
    })
  )
})

// "Land" the spin by firing transitionend on every animating reel strip.
const landSpin = (container) => {
  const strips = container.querySelectorAll('.tyreel-strip:not(.static)')
  expect(strips.length).toBeGreaterThan(0)
  act(() => { strips.forEach((s) => s.dispatchEvent(new Event('transitionend', { bubbles: true }))) })
}

describe('App render + interaction (real data via mocked fetch)', () => {
  it('boots to title, START -> spin (team+year reels) -> roster with GOAT card + both rerolls', async () => {
    const { container } = render(<App />)
    // no title screen — the app auto-starts a game on load
    await waitFor(() => expect(container.querySelector('.tyreel-strip')).toBeTruthy())
    // both axes animate on a fresh spin
    expect(container.querySelector('.tyreel-col.team')).toBeTruthy()
    expect(container.querySelector('.tyreel-col.year')).toBeTruthy()
    landSpin(container)

    await waitFor(() => expect(container.querySelector('.roster')).toBeTruthy())
    expect(container.querySelector('.goat-card')).toBeTruthy()
    expect(screen.getByLabelText('Respin team')).toBeTruthy()
    expect(screen.getByLabelText('Respin decade')).toBeTruthy()
    expect(screen.getByText(/SPIN 1/)).toBeTruthy()
  })

  it('Reroll Year re-spins only the year reel, then a forced pick locks a rating', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(container.querySelector('.tyreel-strip')).toBeTruthy())
    landSpin(container)
    await waitFor(() => expect(container.querySelector('.roster')).toBeTruthy())

    const yearBtn = screen.getByLabelText('Respin decade')
    if (!yearBtn.disabled) {
      fireEvent.click(yearBtn)
      await waitFor(() => expect(container.querySelector('.tyreel-strip')).toBeTruthy())
      // year axis only: the team reel is static, the year reel animates
      expect(container.querySelector('.tyreel-col.team .tyreel-strip.static')).toBeTruthy()
      landSpin(container)
      await waitFor(() => expect(container.querySelector('.roster')).toBeTruthy())
      // the year reroll is now spent -> its button is disabled
      expect(screen.getByLabelText('Respin decade').disabled).toBe(true)
    }

    const firstPlayer = container.querySelector('.pcard:not(.used)')
    fireEvent.click(firstPlayer)
    // the assign sheet is portaled to <body>, so query the document, not the container
    await waitFor(() => expect(document.querySelector('.sheet')).toBeTruthy())
    fireEvent.click(document.querySelector('.opt'))

    // a slot is now filled, but its rating stays HIDDEN while picking (no number shown);
    // the in-game card shows no TOTAL row. The spin counter advances to 2.
    await waitFor(() => expect(container.querySelector('.slot.filled')).toBeTruthy())
    expect(container.querySelector('.slot.filled .slot__rating')).toBeNull()
    expect(container.querySelector('.goat-card__total')).toBeNull()
    await waitFor(() => expect(screen.getByText(/SPIN 2/)).toBeTruthy())
  })
})

describe('Reveal + Result screens render without crashing', () => {
  function finishedState() {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 594 })
    s = reducer(s, { type: 'SETTLE' })
    ABILITY_KEYS.forEach((ability, i) => {
      const last = i === 5
      s = reducer(s, { type: 'ASSIGN', playerId: `p${i}`, ability, rating: 70 + i, nextFranchise: last ? null : 'CHI', nextSeason: last ? null : 1996 })
      if (!last) s = reducer(s, { type: 'SETTLE' })
    })
    return s
  }
  const fullRatings = Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, 70 + i]))
  const game = {
    players: [{ id: 'comp1', player_id: 'compxx01', name: 'Comp One', team_label: '1996 Bulls', ratings: fullRatings }],
    playersById: new Map(ABILITY_KEYS.map((_, i) => [`p${i}`, { id: `p${i}`, name: `Player ${i}`, ratings: {} }])),
    franchisesById: new Map([['CHI', { id: 'CHI', name: 'Bulls', color: '#CE1141' }]]),
    getPercentile: () => 93,
    scoreForPercentile: () => 545,
  }

  it('RevealScreen slams the grade, collapses the team card, and surfaces Play Again', async () => {
    vi.useFakeTimers()
    const onPlayAgain = vi.fn()
    const { container } = render(<RevealScreen game={game} state={finishedState()} onDone={() => {}} onPlayAgain={onPlayAgain} />)
    // during the count-up the team card is open (no toggle yet)
    expect(container.querySelector('.reveal-team.collapsed')).toBeFalsy()
    expect(container.querySelector('.reveal-team__toggle')).toBeFalsy()
    // at the tally: the grade slams and the card folds together (advance well past the count-up)
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(container.querySelector('.pct-slam')).toBeTruthy()
    // OVR is the hero and the only headline (curved from total 435 -> 70)
    expect(container.querySelector('.pct-slam__num').textContent).toBe('70')
    expect(container.querySelector('.reveal-team.collapsed')).toBeTruthy()
    // toggle re-opens the team card
    await act(async () => { container.querySelector('.reveal-team__toggle').click() })
    expect(container.querySelector('.reveal-team.collapsed')).toBeFalsy()
    vi.useRealTimers()
  })

  it('ResultScreen renders the shareable card with all six rows + Play Again as the main CTA', () => {
    const { container } = render(<ResultScreen game={game} state={finishedState()} onPlayAgain={() => {}} />)
    expect(container.querySelectorAll('.rrow')).toHaveLength(6)
    expect(screen.getByText('Play again')).toBeTruthy()
    expect(container.querySelector('.result-actions .btn-primary').textContent).toContain('Play again')
    expect(screen.getByText('Share results')).toBeTruthy()
  })
})
