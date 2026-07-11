import Avatar from './Avatar.jsx'
import { playerPhotoUrl } from './assets.js'
import { matchColor } from '../game/comp.js'
import { STAT_LINE } from '../constants.js'

const fmt1 = (v) => (v == null ? '-' : Number(v).toFixed(1))

// "Plays like X" comp card: the comp player's headshot + name/team, a color-coded % match,
// and their per-game line. Shared by the reveal and the result card.
export default function PlayerComp({ comp }) {
  if (!comp?.player) return null
  const p = comp.player
  return (
    <div className="comp">
      <div className="comp__kicker">Plays like</div>
      <div className="comp__row">
        <Avatar name={p.name} src={playerPhotoUrl(p)} color="#c9ccd2" size={46} rounded={10} />
        <div className="comp__who">
          <span className="comp__name">{p.name}</span>
          <span className="comp__team">{p.team_label}</span>
        </div>
        <div className="comp__match" style={{ '--match': matchColor(comp.match) }}>
          <span className="comp__pct">{comp.match}%</span>
          <span className="comp__pct-label">match</span>
        </div>
      </div>
      <div className="comp__stats">
        {STAT_LINE.map((s) => (
          <div key={s.key} className="stat">
            <span className="stat__v">{fmt1(p.stats?.[s.key])}</span>
            <span className="stat__k">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
