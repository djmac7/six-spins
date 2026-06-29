import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Link2, Download, Check } from 'lucide-react'
import ResultCard from './ResultCard.jsx'
import { useShareActions } from './useShareActions.js'

// 82-0-style share sheet (modal, not a separate screen): card preview, the copy-paste
// message, the deep link, a grid of social targets, and copy-link / save-image.
const SOCIALS = [
  { key: 'x', name: 'X / Twitter', bg: '#0f1419', href: (t, u) => `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
  { key: 'fb', name: 'Facebook', bg: '#1877f2', href: (t, u) => `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}` },
  { key: 'bsky', name: 'Bluesky', bg: '#1185fe', href: (t, u) => `https://bsky.app/intent/compose?text=${t}%20${u}` },
  { key: 'wa', name: 'WhatsApp', bg: '#25d366', href: (t, u) => `https://wa.me/?text=${t}%20${u}` },
  { key: 'tg', name: 'Telegram', bg: '#229ed9', href: (t, u) => `https://t.me/share/url?url=${u}&text=${t}` },
  { key: 'rd', name: 'Reddit', bg: '#ff4500', href: (t, u) => `https://www.reddit.com/submit?url=${u}&title=${t}` },
]

export default function ShareModal({ game, state, percentile, comp, tag, message, url, total, onClose }) {
  const cardRef = useRef(null)
  const { saveImage, saving } = useShareActions(cardRef, message, `six-spins-${total}.png`)
  const [copied, setCopied] = useState(false)

  const t = encodeURIComponent(message)
  const u = encodeURIComponent(url)
  const openIntent = (href) => window.open(href, '_blank', 'noopener,noreferrer')
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('[share] copy link failed', e)
    }
  }

  return createPortal(
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share your player">
        <div className="share-modal__head">
          <h2 className="share-modal__title">Share your player</h2>
          <button className="share-modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="share-modal__msg">
          <span className="share-modal__msgtext">{message}</span>
          {url && <a className="share-modal__play" href={url} target="_blank" rel="noopener noreferrer">Play Six Spins ▸</a>}
        </div>

        {url && <div className="share-modal__url">{url}</div>}

        <div className="share-modal__socials">
          {SOCIALS.map((s) => (
            <button key={s.key} className="social-btn" style={{ '--social': s.bg }} onClick={() => openIntent(s.href(t, u))}>
              {s.name}
            </button>
          ))}
        </div>

        <div className="share-modal__foot">
          <button className="btn-secondary" onClick={copyLink}>
            {copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? 'Copied' : 'Copy link'}
          </button>
          <button className="btn-secondary" onClick={saveImage} disabled={saving}>
            <Download size={16} />{saving ? 'Saving…' : 'Save image'}
          </button>
        </div>
      </div>

      {/* Off-screen image source — forced LIGHT so the exported PNG is always the clean
          light card, regardless of the app's theme. */}
      <div className="share-card-holder" data-theme="light" aria-hidden="true">
        <ResultCard ref={cardRef} game={game} state={state} percentile={percentile} comp={comp} tag={tag} />
      </div>
    </div>,
    document.body
  )
}
