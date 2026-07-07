import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sun, Moon, ChevronRight } from 'lucide-react'
import InfoModal from './InfoModal.jsx'

const ABOUT_LINKS = [
  { key: 'methodology', label: 'Attributes Methodology', desc: 'How the ratings are calculated.' },
  { key: 'privacy', label: 'Privacy Policy', desc: 'What we store (almost nothing).' },
  { key: 'terms', label: 'Terms of Service', desc: 'The fan-project fine print.' },
]

// Settings overlay: appearance (light/dark) + difficulty (hide player stats) + about/legal.
export default function SettingsModal({ settings, update, onClose }) {
  const [doc, setDoc] = useState(null)
  if (doc) return <InfoModal doc={doc} onBack={() => setDoc(null)} onClose={onClose} />
  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings__head">
          <h2 className="settings__title">Settings</h2>
          <button className="settings__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <span className="setting-row__label">Appearance</span>
            <span className="setting-row__desc">Light or dark.</span>
          </div>
          <div className="segmented" role="group" aria-label="Theme">
            <button className={'seg' + (settings.theme === 'light' ? ' active' : '')} onClick={() => update({ theme: 'light' })}>
              <Sun size={15} />Light
            </button>
            <button className={'seg' + (settings.theme === 'dark' ? ' active' : '')} onClick={() => update({ theme: 'dark' })}>
              <Moon size={15} />Dark
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-row__text">
            <span className="setting-row__label">Hide player stats</span>
            <span className="setting-row__desc">Hard mode for pro NBA gamers like KOT4Q.</span>
          </div>
          <button
            className={'toggle' + (settings.hideStats ? ' on' : '')}
            role="switch"
            aria-checked={settings.hideStats}
            aria-label="Hide player stats"
            onClick={() => update({ hideStats: !settings.hideStats })}
          >
            <span className="toggle__knob" />
          </button>
        </div>

        <div className="settings__section">About &amp; Legal</div>
        {ABOUT_LINKS.map((l) => (
          <button key={l.key} className="setting-row setting-link" onClick={() => setDoc(l.key)}>
            <div className="setting-row__text">
              <span className="setting-row__label">{l.label}</span>
              <span className="setting-row__desc">{l.desc}</span>
            </div>
            <ChevronRight size={18} className="setting-link__chev" />
          </button>
        ))}

        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body
  )
}
