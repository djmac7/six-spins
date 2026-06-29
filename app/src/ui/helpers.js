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

// Rating tiers drive the chip color ramp (broadcast-graphic feel).
export function ratingTier(v) {
  if (v >= 90) return 'elite'
  if (v >= 80) return 'great'
  if (v >= 65) return 'good'
  if (v >= 45) return 'mid'
  return 'low'
}

// Percentile tiers drive the high/low reveal treatment (§5).
// Seven percentile tiers (NBA-accolade ladder), best -> worst.
export function percentileTier(p) {
  if (p >= 99) return 'goat'
  if (p >= 92) return 'hof'
  if (p >= 80) return 'allnba'
  if (p >= 60) return 'allstar'
  if (p >= 35) return 'role'
  if (p >= 15) return 'bench'
  return 'bust'
}

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
    label: season != null ? `${season} ${name}` : name,
  }
}

export const TIER_BLURB = {
  goat: 'THE GOAT.',
  hof: 'Hall of Famer.',
  allnba: 'All-NBA.',
  allstar: 'All-Star.',
  role: 'Role Player.',
  bench: 'Benchwarmer.',
  bust: 'Bust.',
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

// One accent color per tier (drives the percentile slam + result-card edge/headline).
export const TIER_COLOR = {
  goat: '#c89200',   // gold
  hof: '#7c3aed',    // violet
  allnba: '#ea580c', // orange
  allstar: '#0d9488',// teal
  role: '#495057',   // slate
  bench: '#6f7072',  // gray
  bust: '#9aa0a6',   // faint gray
}

// Tiers that earn confetti / a celebratory treatment.
export const TIER_CELEBRATE = new Set(['goat', 'hof', 'allnba'])

// Ordered ladder (best -> worst) with the percentile floor for each tier. Drives the
// gamified progress meter; `hi` is filled in for each tier's display range.
export const TIERS = [
  { key: 'goat', label: 'THE GOAT', min: 99 },
  { key: 'hof', label: 'Hall of Famer', min: 92 },
  { key: 'allnba', label: 'All-NBA', min: 80 },
  { key: 'allstar', label: 'All-Star', min: 60 },
  { key: 'role', label: 'Role Player', min: 35 },
  { key: 'bench', label: 'Benchwarmer', min: 15 },
  { key: 'bust', label: 'Bust', min: 0 },
].map((t, i, arr) => ({ ...t, hi: i === 0 ? 100 : arr[i - 1].min - 1 }))

// Percentile range label for a tier, e.g. "80–91st".
export function tierRange(t) {
  return t.min === t.hi ? `${t.min}th` : `${t.min}–${t.hi}th`
}
