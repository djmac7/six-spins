import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

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

// Slim persistent top bar. Background spans the full viewport width (full-bleed) while the
// content stays aligned to the app frame. Daily parked -> minimal 82-0-style header; Daily on
// -> adds a mode pill + a Daily / Unlimited / Archive menu.
export default function ModeBar({ session, dailyEnabled = true, onDaily, onUnlimited, onArchive, onOpenSettings }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const pick = (fn) => () => { close(); fn() }

  const settingsBtn = (
    <button className="modebar__new" onClick={onOpenSettings} aria-label="Settings">
      <SlidersHorizontal size={14} strokeWidth={2.2} aria-hidden="true" />
      <span>Settings</span>
    </button>
  )

  if (!dailyEnabled) {
    return (
      <header className="modebar">
        <div className="modebar__inner">
          <Logo as="button" onClick={onUnlimited} />
          {settingsBtn}
        </div>
      </header>
    )
  }

  return (
    <header className="modebar">
      <div className="modebar__inner">
        <Logo as="button" onClick={onDaily} />
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
            </div>
          </>
        )}
      </div>
    </header>
  )
}
