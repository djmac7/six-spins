import Avatar from './Avatar.jsx'
import { playerPhotoUrl } from './assets.js'
import { matchColor } from '../game/comp.js'

// "Plays like X" comp card: the comp player's headshot + name/team and a color-coded % skill
// match. Shared by the reveal and the result card.
export default function PlayerComp({ comp }) {
  if (!comp?.player) return null
  const p = comp.player
  return (
    <div className="comp">
      <div className="comp__kicker">Your player plays like</div>
      <div className="comp__row">
        <Avatar name={p.name} src={playerPhotoUrl(p)} color="#c9ccd2" size={46} rounded={10} />
        <div className="comp__who">
          <span className="comp__name">{p.name}</span>
          <span className="comp__team">{p.team_label}</span>
        </div>
        <div className="comp__match" style={{ '--match': matchColor(comp.match) }}>
          <span className="comp__pct">{comp.match}%</span>
          <span className="comp__pct-label">skill match</span>
        </div>
      </div>
    </div>
  )
}
