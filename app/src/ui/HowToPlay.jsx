import { createPortal } from 'react-dom'
import { X, Shuffle, Hand, LayoutGrid, Trophy } from 'lucide-react'

// First-visit explainer. Shown once per browser session (see App's session gate) — it does
// not reappear on Play Again.
const STEPS = [
  { Icon: Shuffle, t: 'Spin', d: 'Land on a random all-time roster.' },
  { Icon: Hand, t: 'Steal', d: 'Draft one skill from one player.' },
  { Icon: LayoutGrid, t: 'Build', d: 'Fill all six skill slots.' },
  { Icon: Trophy, t: 'Rank', d: 'See where your GOAT lands all-time.' },
]

export default function HowToPlay({ onClose }) {
  return createPortal(
    <div className="howto-backdrop" onClick={onClose}>
      <div className="howto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="How to play Six Spins">
        <button className="howto__close" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <div className="howto__hero">
          <div className="howto__logo" aria-hidden="true">6️⃣🔄</div>
          <h2 className="howto__title">Six Spins</h2>
          <p className="howto__tagline">Steal a skill from six all-time NBA players and build the GOAT.</p>
        </div>

        <ol className="howto__steps">
          {STEPS.map(({ Icon, t, d }, i) => (
            <li key={i} className="howto__step">
              <span className="howto__icon"><Icon size={20} strokeWidth={2.2} aria-hidden="true" /></span>
              <span className="howto__body">
                <span className="howto__t">{t}</span>
                <span className="howto__d">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        <button className="btn-primary howto__cta" onClick={onClose}>Start playing</button>
      </div>
    </div>,
    document.body
  )
}
