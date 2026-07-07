// Small presentation helpers shared across components.
import { franchiseEra } from '../data/franchiseEras.js'

export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Pick black/white text for legibility on a team-color background (WCAG-ish luminance).
export function readableText(hex) {
  if (!hex || typeof hex !== 'string') return '#ffffff'
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(v.slice(0, 2), 16) || 0
  const g = parseInt(v.slice(2, 4), 16) || 0
  const b = parseInt(v.slice(4, 6), 16) || 0
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0a0a0f' : '#ffffff'
}

// Display form of a time-axis token: decade labels drop the century ("1990s" -> "90s");
// int seasons pass through. Tokens stay opaque everywhere else in the game logic.
export function seasonLabel(season) {
  if (typeof season === 'string' && /^\d{4}s$/.test(season)) return season.slice(2)
  return season
}

// Rating tiers drive the chip color ramp (broadcast-graphic feel). Thresholds sit on the
// decade-grain 2K-style scale (decade_curve: mean 75, sd 9, floor 55, cap 99): elite ≈ top
// 3% of the decade-grain universe, great ≈ top 16%, good ≈ top half.
export function ratingTier(v) {
  if (v >= 99) return 'goat'   // gold — reserved for a perfect 99 (GOAT)
  if (v >= 90) return 'elite'  // green — right below GOAT
  if (v >= 82) return 'great'  // blue
  if (v >= 74) return 'good'   // amber
  if (v >= 65) return 'mid'    // orange
  return 'low'                 // red
}

// 2K-STYLE OVERALL RATING. The six stolen attributes roll up into ONE overall (the hook).
// NOT a raw average: the top of the average is so compressed (even a great card rarely
// averages > 98) that a linear avg makes 99 nearly unreachable. Instead the OVR is a CURVED
// map of the total that anchors 99 to a STRONG-but-imperfect card — a total ~592 (five 99s
// + a 97, say), which a good player reaches in ~30-45 min — and scales down from there.
// Calibrated against simulated play (see pipeline sim). Clamped to [40, 99].
const OVR_ANCHOR_TOTAL = 592 // total that maps to a 99 OVR
const OVR_LO_TOTAL = 480     // total that maps to OVR_LO
const OVR_LO = 78
const OVR_SLOPE = (99 - OVR_LO) / (OVR_ANCHOR_TOTAL - OVR_LO_TOTAL)
export function computeOvr(total) {
  return Math.max(40, Math.min(99, Math.round(99 - (OVR_ANCHOR_TOTAL - total) * OVR_SLOPE)))
}
// OVR tier -> color class (`tc`, reused by all the tc-*/tier-bg-* CSS) + 2K-flavored label +
// share copy. Best -> worst; a 99 is legendary, ~92+ elite, most good games land 88-95.
// Thresholds align 1:1 with the ratingTier color bands (goat/elite/great/good/mid/low) so
// each tier is a DISTINCT color on the meter and badge.
export const OVR_TIERS = [
  { min: 99, label: 'GOAT',      head: 'the GOAT 🐐',      cta: 'Your turn. Good luck topping it.' },
  { min: 90, label: 'Superstar', head: 'a superstar 🏆',   cta: 'Think you can top it?' },
  { min: 82, label: 'All-Star',  head: 'an All-Star ⭐',    cta: 'Think you can top it?' },
  { min: 74, label: 'Starter',   head: 'a solid starter',  cta: 'Your turn — can you beat it?' },
  { min: 65, label: 'Rotation',  head: 'a rotation piece', cta: 'Bet you can do better.' },
  { min: 0,  label: 'Bench',     head: 'deep-bench depth', cta: 'You can definitely beat this.' },
]
export function ovrTier(ovr) {
  return OVR_TIERS.find((t) => ovr >= t.min) || OVR_TIERS[OVR_TIERS.length - 1]
}
// The OVR is colored like an ATTRIBUTE of the same value — same green/blue/slate palette as
// the rating chips — so the headline number matches the card. `ratingTier` -> tc-* class.
export function ovrColorClass(ovr) {
  return 'tc-' + ratingTier(ovr)
}
export function ovrColor(ovr) {
  return `var(--t-${ratingTier(ovr)})`
}
// OVR at/above this earns confetti; 96+ (All-Time Great) gets the full GOAT spectacle.
export const OVR_CELEBRATE = 92

// Resolve a (franchise, season) into display fields. Works off the loaded game's
// franchisesById; falls back to the abbreviation + neutral color if unknown.
export function teamDisplay(game, franchise, season) {
  const fr = game.franchisesById?.get(franchise)
  // Older seasons of a relocated/renamed franchise show their historical identity
  // (a 1999 OKC cell is really the Seattle SuperSonics). See data/franchiseEras.js.
  const era = franchiseEra(franchise, season)
  const name = era?.name || fr?.name || franchise || '-'
  return {
    id: franchise, // canonical id — game logic keys off this, never the era
    logoId: era?.id || franchise, // logo asset to render (historical when applicable)
    name,
    color: era?.color || fr?.color || '#2a2a36',
    label: season != null ? `${seasonLabel(season)} ${name}` : name,
  }
}

// GOAT-tier flourish (you maxed the ladder). Pure hoops culture — jersey retirement, the
// Springfield HoF, unanimous MVP, the Mount Rushmore / barbershop debates. One is drawn at
// random per result so topping out feels like an event.
export const GOAT_LINES = [
  'jersey to the rafters 🐐',
  'enshrined in Springfield 🐐',
  'unanimous, debate over 🐐',
  'Mount Rushmore made room 🐐',
  'first ballot, no questions 🐐',
  'put some respect on the name 🐐',
  'the barbershop debate ends here 🐐',
  'ring szn, every szn 🐐',
  'no ceiling left to break 🐐',
]

export function randomGoatLine() {
  return GOAT_LINES[Math.floor(Math.random() * GOAT_LINES.length)]
}

// One accent color per tier class (`tc`), reused by the OVR tiers via OVR_TIERS[].tc.
// Drives the OVR slam + result-card edge/headline (CSS keys off tc-<tc> / tier-bg-<tc>).
export const TIER_COLOR = {
  goat: '#c89200',   // gold   (All-Time Great)
  hof: '#7c3aed',    // violet (Superstar)
  allnba: '#ea580c', // orange (All-Star)
  allstar: '#0d9488',// teal   (Starter)
  role: '#495057',   // slate  (Rotation)
  bust: '#9aa0a6',   // gray   (Bench)
}
