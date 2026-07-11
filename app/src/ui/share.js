// The viral payload (App spec §6, virality pass). A Wordle-style TEXT share that pastes
// natively into iMessage / WhatsApp / X / Stories — no download, no attachment, previews
// inline, and CARRIES ITS OWN URL so every share is a distribution vector.
//
// The six tier-colored squares (one per ability, in the fixed ABILITIES order) encode the
// SHAPE of your GOAT — strong where, weak where — WITHOUT revealing which players/team-years
// you stole. That spoiler gap is the hook: "you went blue on defense? who'd you even get?!"
import { ABILITIES, ABILITY_KEYS } from '../constants.js'
import { ratingTier } from './helpers.js'
import { hashStr } from '../game/rng.js'

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
// Your six picks, packed for the challenge link (&run=): each pick is (index into the
// players table × 128 + rating), XORed with a seed-derived mask and written as 4 base36
// chars — 24 opaque characters total. The mask keeps the lineup from being readable in the
// URL (no spoiling the rival's picks before you've played), and decode verifies each
// player's rating for its ability slot, so a stale/garbled link degrades to score-only
// instead of showing a wrong lineup.
const RUN_CHARS = 4
const RUN_MASK = 0x7ffff // 19 bits — covers index*128+rating for the full player table

const runMask = (seed, i) => hashStr(String(seed) + '|run|' + i) & RUN_MASK

export function encodeRun(slots, game, seed) {
  if (!slots || !game || slots.length !== ABILITIES.length) return ''
  const indexById = new Map(game.players.map((p, i) => [p.id, i]))
  let out = ''
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    const pi = indexById.get(s?.playerId)
    if (pi == null || !Number.isFinite(s.rating)) return ''
    out += ((pi * 128 + s.rating) ^ runMask(seed, i)).toString(36).padStart(RUN_CHARS, '0')
  }
  return out
}

export function decodeRun(str, game, seed) {
  if (!str || !game || String(str).length !== ABILITIES.length * RUN_CHARS) return null
  const run = []
  for (let i = 0; i < ABILITIES.length; i++) {
    const v = parseInt(String(str).slice(i * RUN_CHARS, (i + 1) * RUN_CHARS), 36)
    if (!Number.isFinite(v)) return null
    const unmasked = v ^ runMask(seed, i)
    const rating = unmasked % 128
    const player = game.players[(unmasked - rating) / 128]
    // integrity check: the decoded player must actually hold this rating for this ability
    if (!player || player.ratings?.[ABILITY_KEYS[i]] !== rating) return null
    run.push({ playerId: player.id, rating })
  }
  return run
}

// `goal` (your OVR) + `slots` (your picks) ride along on seed links so the recipient gets a
// target to beat and a lineup to compare against — that's what turns a shared board into a 1v1.
export function shareLink(meta, goal, slots, game) {
  const base = shareUrl()
  if (!base) return ''
  const goalQs = Number.isFinite(goal) ? `&goal=${goal}` : ''
  const run = slots && game && meta?.seed ? encodeRun(slots, game, meta.seed) : ''
  const runQs = run ? `&run=${run}` : ''
  if (meta?.mode === 'daily' && meta.date) return `${base}?d=${meta.date}`
  if (meta?.seed) return `${base}?seed=${encodeURIComponent(meta.seed)}${goalQs}${runQs}`
  return base
}

// One plain sentence + the squares + the dare. The link replays THIS run (same six spins,
// same rosters), so the share reads as a direct head-to-head, not a scoreboard flex.
export function buildShareText({ ovr, slots, meta, url }) {
  const where = meta?.mode === 'daily' && meta.dayNumber != null ? `today's Six Spins (Daily #${meta.dayNumber})` : 'Six Spins'
  const link = url != null ? url : shareLink(meta)
  const lines = [
    `I built a ${ovr} OVR NBA player on ${where} 🏀`,
    `${ratingSquares(slots)}`,
    link ? `Can you beat my score? ${link}` : 'Can you beat my score?',
  ]
  return lines.join('\n')
}
