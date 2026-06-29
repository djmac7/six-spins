import { createPortal } from 'react-dom'
import { X, Sun, Moon } from 'lucide-react'

// Settings overlay: appearance (light/dark) + difficulty (hide player stats).
export default function SettingsModal({ settings, update, onClose }) {
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
            <span className="setting-row__desc">Draft blind. Much harder.</span>
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

        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body
  )
}
