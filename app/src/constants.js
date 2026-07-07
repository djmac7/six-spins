// The six ability keys are FIXED and ORDERED (App spec §1). Defined ONCE here; never
// hardcode an ability string inline. NOTE: the shipped goat-data.json uses `scoring`
// (not the spec draft's `finishing`) — the app follows the real data file.
// Per-attribute line-icons live in ui/AbilityIcon.jsx (real SVGs, keyed by `key`).
export const ABILITIES = [
  { key: 'shooting',       label: 'Shooting',       short: 'SHOOT' },
  { key: 'scoring',        label: 'Scoring',        short: 'SCORE' },
  { key: 'playmaking',     label: 'Playmaking',     short: 'DIME' },
  { key: 'defense',        label: 'Defense',        short: 'D' },
  { key: 'rebounding',     label: 'Rebounding',     short: 'BOARDS' },
  { key: 'clutch',         label: 'Clutch',         short: 'CLUTCH' },
]

export const ABILITY_KEYS = ABILITIES.map((a) => a.key)

// Per-game box-score line shown while picking (the clue). The 0-100 ability ratings stay
// hidden until the final tally — picking is a read on the real stats, not the rating.
export const STAT_LINE = [
  { key: 'ppg', label: 'PPG' },
  { key: 'rpg', label: 'RPG' },
  { key: 'apg', label: 'APG' },
  { key: 'spg', label: 'SPG' },
  { key: 'bpg', label: 'BPG' },
]

// Pool cell key — Team and Year are independent axes; a cell is one (season, franchise).
// Must match the keys emitted by 05_curate.py ("SEASON_FRANCHISE").
export const cellKey = (season, franchise) => `${season}_${franchise}`
export const ABILITY_LABEL = Object.fromEntries(ABILITIES.map((a) => [a.key, a.label]))
export const ABILITY_META = Object.fromEntries(ABILITIES.map((a) => [a.key, a]))
