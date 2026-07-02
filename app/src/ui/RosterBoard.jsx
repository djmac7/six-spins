import { useEffect, useRef, useState } from 'react'
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
  // Keyboard draft: Tab engages the list (focuses the first player), Up/Down move, Enter opens
  // the assign sheet. -1 means keyboard nav hasn't been engaged (pointer-only).
  const [focusIdx, setFocusIdx] = useState(-1)
  const btnRefs = useRef([])
  const textColor = readableText(team.color)
  // blind mode: force a name sort so the order can't leak the hidden stats
  const effSort = hideStats ? 'az' : sort
  const ordered = [...players].sort((a, b) =>
    effSort === 'az'
      ? lastName(a.name).localeCompare(lastName(b.name)) || (a.name || '').localeCompare(b.name || '')
      : (b.stats?.[effSort] ?? 0) - (a.stats?.[effSort] ?? 0)
  )

  // Re-sorting reshuffles the list, so drop the keyboard cursor rather than point it at a
  // now-unrelated row.
  useEffect(() => { setFocusIdx(-1) }, [effSort, players])

  useEffect(() => {
    // The assign sheet owns the keyboard while it's open (see AssignSheet).
    if (selected) return
    const moveTo = (i) => {
      const next = Math.max(0, Math.min(i, ordered.length - 1))
      setFocusIdx(next)
      btnRefs.current[next]?.focus()
    }
    const onKey = (e) => {
      if (e.key === 'Tab' && focusIdx === -1) {
        // Enter keyboard-draft mode on the first player instead of walking the browser's tab order.
        e.preventDefault()
        moveTo(0)
      } else if (focusIdx === -1) {
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveTo(focusIdx + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveTo(focusIdx - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setSelected(ordered[focusIdx])
      } else if (e.key === 'Escape') {
        setFocusIdx(-1)
        btnRefs.current[focusIdx]?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, focusIdx, ordered])

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
        {ordered.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => { btnRefs.current[i] = el }}
            className={'pcard' + (hideStats ? ' pcard--blind' : '')}
            onClick={() => setSelected(p)}
          >
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
  const optRefs = useRef([])
  const [optIdx, setOptIdx] = useState(0)

  // Focus the first attribute on open so the sheet is drivable by keyboard immediately.
  useEffect(() => { optRefs.current[0]?.focus() }, [])

  useEffect(() => {
    const moveTo = (i) => {
      const next = Math.max(0, Math.min(i, openAbilities.length - 1))
      setOptIdx(next)
      optRefs.current[next]?.focus()
    }
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveTo(optIdx + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveTo(optIdx - 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      // Enter fires the focused option's native button click (-> onPick).
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [optIdx, openAbilities, onClose])

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
          {openAbilities.map((ability, i) => {
            const meta = ABILITY_META[ability]
            return (
              <button
                key={ability}
                ref={(el) => { optRefs.current[i] = el }}
                className="opt"
                onClick={() => onPick(ability)}
              >
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
