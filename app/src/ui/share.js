// The viral payload (App spec §6, virality pass). A Wordle-style TEXT share that pastes
// natively into iMessage / WhatsApp / X / Stories — no download, no attachment, previews
// inline, and CARRIES ITS OWN URL so every share is a distribution vector.
//
// The six tier-colored squares (one per ability, in the fixed ABILITIES order) encode the
// SHAPE of your GOAT — strong where, weak where — WITHOUT revealing which players/team-years
// you stole. That spoiler gap is the hook: "you went blue on defense? who'd you even get?!"
import { ABILITIES } from '../constants.js'
import { ratingTier, ovrTier } from './helpers.js'

// rating tier -> heat square. GOAT gold(🟨), then green/blue/… down to red. Distinct per tier.
const TIER_SQUARE = { goat: '🟨', elite: '🟩', great: '🟦', good: '🟪', mid: '🟧', low: '🟥' }

export function ratingSquares(slots) {
  return ABILITIES.map((_, i) => TIER_SQUARE[ratingTier(slots[i]?.rating ?? 0)]).join('')
}

// Live deployed URL (origin + path, no query/hash, no index.html) so the share always
// points back to wherever this is hosted. Empty in non-DOM contexts (tests).
export function shareUrl() {
  if (typeof location === 'undefined') return ''
  return (location.origin + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '') + '/'
}

// Protocol-stripped, trailing-slash-trimmed URL for printing on the card / in text.
export function shareDisplayUrl() {
  return shareUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// A deep link that reproduces THIS run for whoever taps it: ?d=<date> opens that exact daily
// (playable from the archive); ?seed=<seed> reproduces an unlimited board (challenge-a-friend).
export function shareLink(meta) {
  const base = shareUrl()
  if (!base) return ''
  if (meta?.mode === 'daily' && meta.date) return `${base}?d=${meta.date}`
  if (meta?.seed) return `${base}?seed=${encodeURIComponent(meta.seed)}`
  return base
}

function shareTitle(meta) {
  if (meta?.mode === 'daily' && meta.dayNumber != null) return `SIX SPINS · Daily #${meta.dayNumber}`
  if (meta?.mode === 'challenge') return `SIX SPINS · Challenge`
  return `SIX SPINS 🏀`
}

export function buildShareText({ ovr, slots, comp, meta, url }) {
  const t = ovrTier(ovr)
  const link = url != null ? url : shareLink(meta)
  const lines = [
    shareTitle(meta),
    `${ovr} OVR — ${t.head}`,
    `${ratingSquares(slots)}`,
  ]
  if (comp?.player) lines.push(`plays like ${comp.player.name} · ${comp.player.team_label}`)
  lines.push(t.cta)
  if (link) lines.push(`▸ ${link}`)
  return lines.join('\n')
}
