import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import GoatCard from '../ui/GoatCard.jsx'
import TeamYearReel from '../ui/TeamYearReel.jsx'
import RosterBoard from '../ui/RosterBoard.jsx'
import Avatar from '../ui/Avatar.jsx'
import AbilityIcon from '../ui/AbilityIcon.jsx'
import { playerPhotoUrl } from '../ui/assets.js'
import { teamDisplay } from '../ui/helpers.js'

// Drives the `spinning` and `roster` phases (App spec §4). Team and Year are independent:
// the spin shows a Team reel + a Year reel; Reroll Team re-rolls only the franchise (same
// year), Reroll Year only the season (same franchise). The two rerolls live top-right,
// inline with the spin counter.
export default function GameScreen({ game, state, actions, canRerollTeam, canRerollYear, currentRoster, hideStats }) {
  const team = teamDisplay(game, state.currentFranchise, state.currentSeason)
  const openAbilities = state.slots.filter((s) => s.status === 'open').map((s) => s.ability)
  const teamTitle = state.rerollTeamUsed ? 'Team respin used (one per game)' : 'Respin the team (one per game)'
  const yearTitle = state.rerollYearUsed ? 'Decade respin used (one per game)' : 'Respin the decade (one per game)'
  // mobile: collapse the "your GOAT" card to give the player list room (always shown on desktop)
  const [cardOpen, setCardOpen] = useState(false)

  return (
    <div className="screen game-screen">
      <div className="game-top">
        <div className="game-header">
          <div className="spin-counter">
            <span className="spin-counter__now">SPIN {state.spinNumber}</span>
            <span className="spin-counter__of">of 6</span>
          </div>
          <div className="reroll-group">
            {/* title lives on the wrapper so the tooltip still shows when the button is disabled */}
            <span className="reroll-mini-wrap" title={teamTitle}>
              <button className="reroll-mini" disabled={!canRerollTeam} onClick={actions.rerollTeam} aria-label="Respin team">
                <RefreshCw size={13} strokeWidth={2.4} aria-hidden="true" /><span className="reroll-mini__label">Team</span>
              </button>
            </span>
            <span className="reroll-mini-wrap" title={yearTitle}>
              <button className="reroll-mini" disabled={!canRerollYear} onClick={actions.rerollYear} aria-label="Respin decade">
                <RefreshCw size={13} strokeWidth={2.4} aria-hidden="true" /><span className="reroll-mini__label">Decade</span>
              </button>
            </span>
          </div>
        </div>
        <button
          className={'goat-toggle' + (cardOpen ? ' open' : '')}
          onClick={() => setCardOpen((o) => !o)}
          aria-expanded={cardOpen}
        >
          <span className="goat-toggle__label">Your Player</span>
          <span className="goat-toggle__faces">
            {state.slots.map((slot) => {
              const isFilled = slot.status === 'filled'
              const player = isFilled ? game.playersById.get(slot.playerId) : null
              const color = isFilled ? teamDisplay(game, slot.franchise, slot.season).color : '#c9ccd2'
              return isFilled ? (
                <Avatar key={slot.ability} name={player?.name} src={playerPhotoUrl(player)} color={color} size={26} rounded={13} />
              ) : (
                <span key={slot.ability} className="goat-toggle__ph">
                  <AbilityIcon ability={slot.ability} size={14} strokeWidth={2.4} className="goat-toggle__ph-icon" />
                </span>
              )
            })}
          </span>
          <svg className="goat-toggle__chev" width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className={'goat-card-wrap' + (cardOpen ? ' open' : '')}>
          <GoatCard
            slots={state.slots}
            game={game}
            runningTotal={state.runningTotal}
            lastLockKey={state.lastLock?.ability}
            compact
            hideRatings
          />
        </div>
      </div>

      <div className="game-bottom">
        {state.phase === 'spinning' && (
          <div className="spin-stage">
            <div className="spin-stage__title">
              {state.spinAxis === 'team' ? 'Rerolling team…' : state.spinAxis === 'year' ? 'Rerolling year…' : 'Spinning…'}
            </div>
            <TeamYearReel
              franchises={game.franchises}
              seasons={game.seasons}
              targetFranchise={state.currentFranchise}
              targetSeason={state.currentSeason}
              animateTeam={state.spinAxis === 'both' || state.spinAxis === 'team'}
              animateYear={state.spinAxis === 'both' || state.spinAxis === 'year'}
              spinKey={`${state.spinNumber}:${state.spinAxis}:${state.currentFranchise}:${state.currentSeason}`}
              onSettle={actions.settle}
            />
          </div>
        )}

        {state.phase === 'roster' && (
          <RosterBoard
            team={team}
            players={currentRoster}
            openAbilities={openAbilities}
            onAssign={actions.assign}
            hideStats={hideStats}
          />
        )}
      </div>
    </div>
  )
}
