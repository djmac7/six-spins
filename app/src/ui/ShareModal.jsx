import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Link2, Download, Check } from 'lucide-react'
import ResultCard from './ResultCard.jsx'
import { useShareActions } from './useShareActions.js'

// Brand glyphs (simple-icons paths, 24x24), so each share target reads at a glance.
const ICONS = {
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  fb: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  ms: 'M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.522 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.848l2.381-1.051a.96.96 0 0 1 .641-.047A13.08 13.08 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0zm7.207 8.956l-3.525 5.592a1.8 1.8 0 0 1-2.604.48l-2.804-2.102a.72.72 0 0 0-.867.002l-3.786 2.874c-.505.383-1.165-.221-.826-.758l3.525-5.592a1.8 1.8 0 0 1 2.604-.48l2.803 2.102a.72.72 0 0 0 .868-.002l3.786-2.874c.505-.383 1.165.221.826.758z',
  wa: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
  tg: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  rd: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.561-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
}

// 82-0-style share sheet (modal, not a separate screen): card preview, the copy-paste
// message, the deep link, a grid of social targets, and copy-link / save-image.
// Each target gets the FULL payload (message with the challenge link inline) wherever it
// accepts free text, so the composer opens pre-populated with both — no target relies on a
// separate url param surviving.
const SOCIALS = [
  { key: 'x', name: 'X', bg: '#0f1419', href: ({ tFull }) => `https://twitter.com/intent/tweet?text=${tFull}` },
  // Facebook's sharer only takes the URL (quote is deprecated without a registered app);
  // the OG preview carries the pitch there.
  { key: 'fb', name: 'Facebook', bg: '#1877f2', href: ({ u }) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  // Messenger's web dialog requires a registered app_id, so use the app deep link
  // (works on iOS/Android where Messenger is installed — this is a mobile-first game).
  { key: 'ms', name: 'Messenger', bg: '#0084ff', href: ({ u }) => `fb-messenger://share/?link=${u}` },
  // api.whatsapp.com/send is more reliable than wa.me for long multi-line/emoji payloads.
  { key: 'wa', name: 'WhatsApp', bg: '#25d366', href: ({ tFull }) => `https://api.whatsapp.com/send?text=${tFull}` },
  { key: 'tg', name: 'Telegram', bg: '#229ed9', href: ({ t, u }) => `https://t.me/share/url?url=${u}&text=${t}` },
  // Reddit titles are single-line: pass the flattened variant, not the multi-line message.
  { key: 'rd', name: 'Reddit', bg: '#ff4500', href: ({ u, tLine }) => `https://www.reddit.com/submit?url=${u}&title=${tLine}` },
]

function BrandIcon({ name }) {
  return (
    <svg className="social-btn__icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

export default function ShareModal({ game, state, comp, tag, message, url, total, onClose }) {
  const cardRef = useRef(null)
  const { saveImage, saving } = useShareActions(cardRef, message, `six-spins-${total}.png`)
  const [copied, setCopied] = useState(false)

  const enc = {
    t: encodeURIComponent(message),
    tFull: encodeURIComponent(url ? `${message}\n${url}` : message),
    tLine: encodeURIComponent(message.split('\n').join(' · ')),
    u: url ? encodeURIComponent(url) : '',
  }
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
      <div className="share-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Challenge a friend">
        <div className="share-modal__head">
          <div>
            <h2 className="share-modal__title">Challenge a friend</h2>
            <p className="share-modal__sub">Your link replays this exact run. See who can beat it.</p>
          </div>
          <button className="share-modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {url && (
          <button className="share-modal__url" onClick={copyLink} title="Copy link">
            <span className="share-modal__urltext">{url}</span>
            <span className="share-modal__urlicon">{copied ? <Check size={15} /> : <Link2 size={15} />}</span>
          </button>
        )}

        <div className="share-modal__socials">
          {SOCIALS.map((s) => (
            <button key={s.key} className="social-btn" style={{ '--social': s.bg }} onClick={() => openIntent(s.href(enc))} aria-label={`Share to ${s.name}`}>
              <span className="social-btn__circle"><BrandIcon name={s.key} /></span>
              <span className="social-btn__label">{s.name}</span>
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

      {/* Off-screen image source — inherits the app's active theme so the exported PNG
          looks exactly like the card does on the site. */}
      <div className="share-card-holder" aria-hidden="true">
        <ResultCard ref={cardRef} game={game} state={state} comp={comp} tag={tag} />
      </div>
    </div>,
    document.body
  )
}
