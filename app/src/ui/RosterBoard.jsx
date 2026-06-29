import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ABILITY_META, STAT_LINE } from '../constants.js'
import Avatar from './Avatar.jsx'
import TeamLogo from './TeamLogo.jsx'
import AbilityIcon from './AbilityIcon.jsx'
import { playerPhotoUrl } from './assets.js'
import { readableText } from './helpers.js'

// Per-game stats always show one decimal place (3 -> "3.0").
const fmt1 = (v) => (v == null ? '-' : Number(v).toFixed(1))

// A–Z sorts by LAST name (last whitespace-separated token), then first name as tiebreak.
const lastName = (n) => ((n || '').trim().split(/\s+/).pop() || '')

// Roster + forced pick (App spec §4), one player PER ROW (ESPN box-score style). Each row
// shows the player's real per-game line (PPG/RPG/APG/SPG/BPG) — the ability RATINGS are
// hidden, so drafting is a read on the stats. Tap a player -> choose which open ability to
// draft them into (no rating shown); the score is a surprise at the final tally.
const SORTS = [...STAT_LINE.map((s) => ({ key: s.key, label: s.label })), { key: 'az', label: 'A–Z' }]

export default function RosterBoard({ team, players, openAbilities, onAssign, hideStats = false }) {
  const [selected, setSelected] = useState(null)
  const [sort, setSort] = useState('ppg')
  const textColor = readableText(team.color)
  // blind mode: force a name sort so the order can't leak the hidden stats
  const effSort = hideStats ? 'az' : sort
  const ordered = [...players].sort((a, b) =>
    effSort === 'az'
      ? lastName(a.name).localeCompare(lastName(b.name)) || (a.name || '').localeCompare(b.name || '')
      : (b.stats?.[effSort] ?? 0) - (a.stats?.[effSort] ?? 0)
  )

  return (
    <div className="roster">
      <div className="roster__banner" style={{ '--team': team.color, color: textColor }}>
        <div className="roster__crest">
          <TeamLogo franchise={team.logoId || team.id} color={team.color} size={40} />
        </div>
        <div className="roster__title">
          <div className="roster__team">{team.label}</div>
          <div className="roster__hint">{hideStats ? 'Blind draft' : 'Tap to draft'}</div>
        </div>
      </div>

      {!hideStats && (
        <div className="roster__sort">
          <span className="roster__sort-label">Sort</span>
          <div className="roster__sort-opts">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={'sort-btn' + (sort === s.key ? ' active' : '')}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="roster__list">
        {ordered.map((p) => (
          <button key={p.id} className="pcard" onClick={() => setSelected(p)}>
            <Avatar name={p.name} src={playerPhotoUrl(p)} color={team.color} size={44} />
            <div className="pcard__id">
              <div className="pcard__name">{p.name}</div>
              <div className="pcard__meta">{p.team_label || team.label}</div>
            </div>
            {!hideStats && (
              <div className="pcard__stats">
                {STAT_LINE.map((s) => (
                  <div key={s.key} className="stat">
                    <span className="stat__v">{fmt1(p.stats?.[s.key])}</span>
                    <span className="stat__k">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <AssignSheet
          player={selected}
          openAbilities={openAbilities}
          team={team}
          hideStats={hideStats}
          onPick={(ability) => {
            onAssign(selected.id, ability)
            setSelected(null)
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function AssignSheet({ player, openAbilities, team, hideStats = false, onPick, onClose }) {
  // Portal to <body> so the full-page overlay escapes the app-frame/grid containing block.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grab" />
        <div className="sheet__head">
          <Avatar name={player.name} src={playerPhotoUrl(player)} color={team.color} size={46} />
          <div>
            <div className="sheet__name">{player.name}</div>
            <div className="sheet__sub">{player.team_label || team.label}</div>
          </div>
        </div>
        {!hideStats && (
          <div className="sheet__statline">
            {STAT_LINE.map((s) => (
              <div key={s.key} className="stat">
                <span className="stat__v">{fmt1(player.stats?.[s.key])}</span>
                <span className="stat__k">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="sheet__prompt">Draft into which attribute?</div>
        <div className="sheet__options">
          {openAbilities.map((ability) => {
            const meta = ABILITY_META[ability]
            return (
              <button key={ability} className="opt" onClick={() => onPick(ability)}>
                <AbilityIcon ability={ability} size={18} className="opt__icon" />
                <span className="opt__label">{meta.label}</span>
              </button>
            )
          })}
        </div>
        <button className="sheet__cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body
  )
}
