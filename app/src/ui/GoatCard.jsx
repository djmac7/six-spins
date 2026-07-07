import { ABILITIES } from '../constants.js'
import TeamLogo from './TeamLogo.jsx'
import Avatar from './Avatar.jsx'
import AbilityIcon from './AbilityIcon.jsx'
import { playerPhotoUrl } from './assets.js'
import { ratingTier, computeOvr, teamDisplay } from './helpers.js'

// The GOAT card: six slots, ONE ability per row, in fixed order. During picking
// (`hideRatings`) the 0-99 numbers and the OVR stay hidden — a filled slot just
// shows the drafted player; the scores are the surprise at the tally. `revealCount` (reveal
// phase) counts the slots up one at a time; the OVR builds toward the final overall.
export default function GoatCard({ slots, game, runningTotal, lastLockKey, revealCount = null, compact = false, hideRatings = false, hideTotal = false, ceiling = null }) {
  return (
    <div className={'goat-card' + (compact ? ' compact' : '')}>
      <div className="goat-card__slots">
        {slots.map((slot, i) => {
          const meta = ABILITIES[i]
          const filled = slot.status === 'filled'
          const player = filled ? game.playersById.get(slot.playerId) : null
          const team = filled ? teamDisplay(game, slot.franchise, slot.season) : null
          const color = team?.color || '#c9ccd2'
          const justLocked = lastLockKey === slot.ability
          const shown = revealCount === null ? (filled && !hideRatings) : i < revealCount
          return (
            <div
              key={slot.ability}
              className={'slot' + (filled ? ' filled' : ' open') + (justLocked ? ' just-locked' : '') + (shown ? ' shown' : '')}
              style={filled ? { '--team': color } : undefined}
            >
              <AbilityIcon ability={slot.ability} size={16} className="slot__leadicon" />
              <span className="slot__label">{meta.label}</span>
              {filled ? (
                <div className="slot__fill">
                  <Avatar name={player?.name} src={playerPhotoUrl(player)} color={color} size={30} rounded={6} />
                  <span className="slot__who">
                    <span className="slot__name">{player?.name || '-'}</span>
                    <span className="slot__team">{team?.label || ''}</span>
                  </span>
                  {slot.franchise && <TeamLogo franchise={team?.logoId} fallback={team?.id} color={color} size={20} badge={false} />}
                  {shown && (
                    <span className={'slot__rating tier-' + ratingTier(slot.rating)}>{slot.rating}</span>
                  )}
                </div>
              ) : (
                <span className="slot__await">open</span>
              )}
            </div>
          )
        })}
      </div>

      {!hideRatings && !hideTotal && (
        <div className="goat-card__total">
          <span className="goat-card__total-label">OVERALL</span>
          <span className={'goat-card__total-value tier-' + ratingTier(runningTotal / 6)}>
            {computeOvr(runningTotal)}<span className="goat-card__total-ceil"> OVR</span>
          </span>
        </div>
      )}
    </div>
  )
}
