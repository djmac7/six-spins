// Controller hook: the thin impure layer around the pure reducer (App spec §3). Owns the
// cell draws (Team × Year grid) and ratings lookups, then dispatches well-formed payloads.
// Draws run through a seeded `dealer` (see rng.js) so every board is reproducible: a daily
// seed deals everyone the same six spins; an unlimited game gets a fresh random seed. Team
// and Year reroll INDEPENDENTLY, each keyed on the CURRENT cell so the alternate is stable
// no matter the path taken to it.
import { useMemo, useReducer, useCallback } from 'react'
import { reducer, initialState } from './reducer.js'
import { cellKey } from '../constants.js'
import { makeDealer, randomSeed } from './rng.js'

export function useGame(game, dealer) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  // Default to a fresh random-seeded dealer if none is supplied (keeps the hook usable
  // standalone / in tests; App always passes the session's dealer).
  const deal = useMemo(() => dealer || makeDealer(randomSeed()), [dealer])

  // The nth dealt cell (spinNumber is 1..6) — a pure function of the seed, so a player's
  // rerolls never shift the cells anyone else is dealt.
  const cellAt = useCallback(
    (spinNumber) => {
      const key = game.cellList[deal.index(game.cellList.length, spinNumber, 'cell')]
      const i = key.indexOf('_')
      // the time-axis token is OPAQUE (an int season "1996" or a decade label "1990s"
      // depending on the data's pool_grain) — kept as the string from the cell key.
      return { season: key.slice(0, i), franchise: key.slice(i + 1) }
    },
    [deal, game.cellList]
  )

  const newGame = useCallback(() => {
    const c = cellAt(1)
    dispatch({ type: 'NEW_GAME', franchise: c.franchise, season: c.season, ceilingTotal: game.ceiling.total })
  }, [dispatch, cellAt, game.ceiling.total])

  const settle = useCallback(() => dispatch({ type: 'SETTLE' }), [dispatch])

  // legal alternates for each axis given the current cell
  const teamAlts = useMemo(
    () => (game.bySeason.get(state.currentSeason) || []).filter((f) => f !== state.currentFranchise),
    [game.bySeason, state.currentSeason, state.currentFranchise]
  )
  const yearAlts = useMemo(
    () => (game.byFranchise.get(state.currentFranchise) || []).filter((s) => s !== state.currentSeason),
    [game.byFranchise, state.currentFranchise, state.currentSeason]
  )

  const canRerollTeam = !state.rerollTeamUsed && state.phase === 'roster' && teamAlts.length > 0
  const canRerollYear = !state.rerollYearUsed && state.phase === 'roster' && yearAlts.length > 0

  const cur = cellKey(state.currentSeason, state.currentFranchise)

  const rerollTeam = useCallback(() => {
    if (!canRerollTeam) return
    const franchise = teamAlts[deal.index(teamAlts.length, state.spinNumber, 'team', cur)]
    dispatch({ type: 'REROLL_TEAM', franchise })
  }, [dispatch, canRerollTeam, teamAlts, deal, state.spinNumber, cur])

  const rerollYear = useCallback(() => {
    if (!canRerollYear) return
    const season = yearAlts[deal.index(yearAlts.length, state.spinNumber, 'year', cur)]
    dispatch({ type: 'REROLL_YEAR', season })
  }, [dispatch, canRerollYear, yearAlts, deal, state.spinNumber, cur])

  const assign = useCallback(
    (playerId, ability) => {
      const player = game.playersById.get(playerId)
      if (!player) return
      const next = cellAt(state.spinNumber + 1) // next dealt cell (unused on the 6th pick)
      dispatch({
        type: 'ASSIGN', playerId, ability, rating: player.ratings[ability],
        nextFranchise: next.franchise, nextSeason: next.season,
      })
    },
    [dispatch, game.playersById, cellAt, state.spinNumber]
  )

  const finishReveal = useCallback(() => dispatch({ type: 'FINISH_REVEAL' }), [dispatch])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [dispatch])

  // current roster (player objects) for the landed cell
  const currentRoster = useMemo(() => {
    if (state.currentFranchise == null || state.currentSeason == null) return []
    const ids = game.cells.get(cellKey(state.currentSeason, state.currentFranchise)) || []
    return ids.map((id) => game.playersById.get(id)).filter(Boolean)
  }, [game.cells, game.playersById, state.currentFranchise, state.currentSeason])

  return {
    state,
    actions: { newGame, settle, rerollTeam, rerollYear, assign, finishReveal, reset },
    canRerollTeam,
    canRerollYear,
    currentRoster,
  }
}
