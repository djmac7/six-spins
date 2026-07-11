import { useState } from 'react'
import { ChevronDown, SlidersHorizontal, Users } from 'lucide-react'
import { ERAS } from '../constants.js'

// Logo: the 6 + shuffle emoji (the one bit of emoji we keep — everything else is SVG icons).
// Click = home (a fresh game).
function Logo({ as = 'div', onClick }) {
  const Tag = as
  return (
    <Tag
      className={'modebar__brand' + (onClick ? ' modebar__brand--btn' : '')}
      onClick={onClick}
      aria-label="Six Spins home"
    >
      <span className="modebar__logo" aria-hidden="true">6️⃣🔄</span>
    </Tag>
  )
}

// Era selector: a dropdown next to the logo — All-Time vs Modern Era (00s/10s/20s pool).
// Switching restarts the current board on the new pool (App keys the Game on the era).
function EraSelect({ era, onEra }) {
  const [open, setOpen] = useState(false)
  if (!onEra) return null
  const current = ERAS.find((e) => e.id === era) || ERAS[0]
  const pick = (id) => {
    setOpen(false)
    if (id !== era) onEra(id)
  }
  return (
    <div className="modebar__eradrop">
      <button
        className="modebar__erabtn"
        aria-label="Game era"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current.label}</span>
        <ChevronDown size={13} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="modebar__scrim" onClick={() => setOpen(false)} />
          <div className="modebar__menulist modebar__menulist--era" role="menu">
            {ERAS.map((e) => (
              <button key={e.id} role="menuitemradio" aria-checked={era === e.id} onClick={() => pick(e.id)}>
                <span className="mi__name">{e.label}</span>
                <span className="mi__sub">{e.seasons ? 'Seasons from the 00s, 10s & 20s' : 'The full pool, every decade'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Slim persistent top bar. Background spans the full viewport width (full-bleed) while the
// content stays aligned to the app frame. Daily parked -> minimal 82-0-style header; Daily on
// -> adds a mode pill + a Daily / Unlimited / Archive menu.
export default function ModeBar({ session, era, onEra, dailyEnabled = true, onDaily, onUnlimited, onArchive, onBrowse, onOpenSettings }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const pick = (fn) => () => { close(); fn() }

  const browseBtn = onBrowse && (
    <button className="modebar__new" onClick={onBrowse} aria-label="Player browser">
      <Users size={14} strokeWidth={2.2} aria-hidden="true" />
      <span>Players</span>
    </button>
  )
  const settingsBtn = (
    <button className="modebar__new" onClick={onOpenSettings} aria-label="Settings">
      <SlidersHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  )

  if (!dailyEnabled) {
    return (
      <header className="modebar">
        <div className="modebar__inner">
          <div className="modebar__left">
            <Logo as="button" onClick={onUnlimited} />
            <EraSelect era={era} onEra={onEra} />
          </div>
          <div className="modebar__right">
            {browseBtn}
            {settingsBtn}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="modebar">
      <div className="modebar__inner">
        <div className="modebar__left">
          <Logo as="button" onClick={onDaily} />
          <EraSelect era={era} onEra={onEra} />
        </div>
        <div className="modebar__right">
          <span className={'modebar__mode mode-' + session.mode}>{session.label}</span>
          {settingsBtn}
          <button
            className="modebar__menu"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>

        {open && (
          <>
            <div className="modebar__scrim" onClick={close} />
            <div className="modebar__menulist" role="menu">
              <button role="menuitem" onClick={pick(onDaily)}>
                <span className="mi__name">Today’s Daily</span>
                <span className="mi__sub">Same puzzle for everyone</span>
              </button>
              <button role="menuitem" onClick={pick(onUnlimited)}>
                <span className="mi__name">Unlimited</span>
                <span className="mi__sub">Play as much as you want</span>
              </button>
              <button role="menuitem" onClick={pick(onArchive)}>
                <span className="mi__name">Archive</span>
                <span className="mi__sub">Replay past days</span>
              </button>
              {onBrowse && (
                <button role="menuitem" onClick={pick(onBrowse)}>
                  <span className="mi__name">Player Browser</span>
                  <span className="mi__sub">Search the whole pool</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  )
}
