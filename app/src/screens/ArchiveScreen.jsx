import { archiveDates, dayNumber } from '../game/daily.js'
import { getDaily, getStats } from '../game/storage.js'
import { computeOvr, ovrColor } from '../ui/helpers.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function pretty(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

// Daily archive (HoopGrids-style): every past puzzle, today first. Completed days show your
// result with the tier color; unplayed days invite a play. Tapping any day opens it.
export default function ArchiveScreen({ game, onPlayDate, onClose }) {
  const dates = archiveDates()
  const stats = getStats()

  return (
    <div className="screen archive-screen">
      <div className="archive-head">
        <button className="archive-back" onClick={onClose} aria-label="Back">←</button>
        <div className="archive-head__title">
          <div className="archive-head__h1">Daily Archive</div>
          <div className="archive-head__sub">
            {stats.totalPlayed} played · 🔥 {stats.current} streak{stats.best > stats.current ? ` · best ${stats.best}` : ''}
          </div>
        </div>
      </div>

      <div className="archive-grid">
        {dates.map((d, i) => {
          const rec = getDaily(d)
          // new records store `ovr`; old ones only have `total` — derive it
          const ovr = rec ? (rec.ovr ?? computeOvr(rec.total)) : null
          return (
            <button
              key={d}
              className={'archive-cell' + (rec ? ' done' : '')}
              style={ovr != null ? { '--tier-color': ovrColor(ovr) } : undefined}
              onClick={() => onPlayDate(d)}
            >
              <span className="archive-cell__top">
                <span className="archive-cell__num">#{dayNumber(d)}</span>
                {i === 0 && <span className="archive-cell__today">TODAY</span>}
              </span>
              <span className="archive-cell__date">{pretty(d)}</span>
              {rec ? (
                <span className="archive-cell__result archive-cell__grade" style={{ color: ovrColor(ovr) }}>
                  {ovr}
                </span>
              ) : (
                <span className="archive-cell__play">Play ▸</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
