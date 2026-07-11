import { ABILITIES } from '../constants.js'
import Avatar from './Avatar.jsx'
import AbilityIcon from './AbilityIcon.jsx'
import { playerPhotoUrl } from './assets.js'
import { ratingTier, computeOvr } from './helpers.js'

// Head-to-head breakdown for a finished 1v1: your six picks against the rival lineup the
// challenge link carried (&run=, packed/opaque — decoded against the loaded game data).
// Rendered in the same collapsible spot as the solo player breakdown and styled like the
// GOAT card's slot rows. During the reveal, `revealCount` uncovers both sides' ratings one
// row at a time — the count-up plays out ON the head-to-head, same as the solo card.
// Returns null when the link carried no (valid) lineup.
function franchiseColor(game, playerId) {
  const fr = String(playerId || '').split('_').pop()
  return game.franchisesById.get(fr)?.color || '#c9ccd2'
}

function Side({ game, playerId, rating, shown, them = false }) {
  const player = game.playersById.get(playerId)
  const color = franchiseColor(game, playerId)
  return (
    <div className={'vsx-side' + (them ? ' vsx-side--them' : '')}>
      <Avatar name={player?.name} src={playerPhotoUrl(player)} color={color} size={30} rounded={6} />
      <span className="vsx-side__who">
        <span className="vsx-side__name">{player?.name || '-'}</span>
        <span className="vsx-side__team">{player?.team_label || ''}</span>
      </span>
      {shown && <span className={'vsx-side__rating slot__rating tier-' + ratingTier(rating)}>{rating}</span>}
    </div>
  )
}

export default function VersusShowdown({ game, slots, rivalRun, goal, ovr, revealCount = null }) {
  if (!rivalRun) return null
  const revealed = (i) => revealCount === null || i < revealCount
  const done = revealCount === null || revealCount >= ABILITIES.length
  // running overalls build alongside the row-by-row reveal, exactly like the solo card
  const sumShown = (picks) => picks.reduce((t, p, i) => t + (revealed(i) ? p.rating : 0), 0)
  const yourOvr = done ? ovr : computeOvr(sumShown(slots))
  const theirOvr = done ? goal : computeOvr(sumShown(rivalRun))
  return (
    <div className="goat-card vsx-card">
      <div className="vsx-cols" aria-hidden="true">
        <span>You</span>
        <span>Them</span>
      </div>
      <div className="goat-card__slots">
        {ABILITIES.map((meta, i) => {
          const yours = slots[i]
          const theirs = rivalRun[i]
          const shown = revealed(i)
          const outcome = !shown ? 'tie' : yours.rating > theirs.rating ? 'win' : yours.rating < theirs.rating ? 'loss' : 'tie'
          return (
            <div className={'slot filled vsx-slot vsx-slot--' + outcome + (shown ? ' shown' : '')} key={meta.key}>
              <Side game={game} playerId={yours.playerId} rating={yours.rating} shown={shown} />
              <span className="vsx-slot__mid">
                <AbilityIcon ability={meta.key} size={15} strokeWidth={2.4} aria-hidden="true" />
                <span>{meta.short}</span>
              </span>
              <Side game={game} playerId={theirs.playerId} rating={theirs.rating} shown={shown} them />
            </div>
          )
        })}
      </div>
      <div className="goat-card__total vsx-total">
        <span className={'goat-card__total-value tier-' + ratingTier(yourOvr)}>{yourOvr}</span>
        <span className="goat-card__total-label">OVERALL</span>
        <span className={'goat-card__total-value tier-' + ratingTier(theirOvr)}>{theirOvr}</span>
      </div>
    </div>
  )
}
