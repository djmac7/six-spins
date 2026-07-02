// Plain-language → structured filters for the player browser. The filter domain is small and
// bounded (6 ratings, 5 stats, season/decade, team, name), so a deterministic parser beats an
// LLM here: $0, instant, offline, private, and no backend on a static GitHub Pages site.
//
// The parser scans a working copy of the query, consuming (blanking) each phrase it recognizes
// so the next pass can't re-trigger on it. Order matters — specific patterns (years, teams,
// "8+ rebounds") run before the looser ability/name passes. Every recognized criterion becomes
// a { key, label, test } filter; the UI ANDs the tests and renders the labels as chips so the
// user can see exactly how their words were read.
import { ABILITY_LABEL, STAT_LINE } from '../constants.js'

const STAT_LABEL = Object.fromEntries(STAT_LINE.map((s) => [s.key, s.label]))

// Rating-attribute synonyms → ability key. Bare stat nouns (rebounds/assists/…) map to the
// closest rating so "elite rebounder" and "good rebounds" both land on the rebounding rating;
// the same nouns paired with a NUMBER are caught earlier as a per-game stat threshold instead.
const ABILITY_SYNONYMS = {
  shooting: ['three-point shooting', 'three point shooting', '3-point shooting', '3pt shooting', 'outside shooting', 'jump shooting', 'sharpshooting', 'sharpshooter', 'marksman', 'three-point', '3-point', 'shooting', 'shooters', 'shooter', 'spacing', '3pt'],
  scoring: ['bucket getter', 'bucket-getter', 'point-scoring', 'scoring', 'scorers', 'scorer', 'buckets', 'points'],
  playmaking: ['floor general', 'court vision', 'playmaking', 'playmakers', 'playmaker', 'facilitator', 'passing', 'passers', 'passer', 'assists', 'assist', 'dimes'],
  perimeter_d: ['perimeter defense', 'perimeter defender', 'on-ball defense', 'on ball defense', 'on-ball defender', 'wing defender', 'wing defense', 'lockdown defender', 'perimeter d', 'perimeter', 'steals', 'steal'],
  rim_protection: ['rim protection', 'rim protector', 'interior defense', 'interior defender', 'shot blocking', 'shot-blocking', 'shot blocker', 'paint protector', 'rim defense', 'rim protect', 'blocks', 'block'],
  rebounding: ['rebounding', 'rebounders', 'rebounder', 'rebounds', 'rebound', 'boards', 'glass'],
}

// Per-game stat synonyms → stat key, used only when a number is attached (e.g. "20+ ppg").
const STAT_SYNONYMS = {
  ppg: ['points per game', 'points', 'ppg', 'pts'],
  rpg: ['rebounds per game', 'rebounds', 'rebound', 'boards', 'rebs', 'rpg'],
  apg: ['assists per game', 'assists', 'assist', 'dimes', 'asts', 'apg'],
  spg: ['steals per game', 'steals', 'steal', 'stls', 'spg'],
  bpg: ['blocks per game', 'blocks', 'block', 'blks', 'bpg'],
}

// Qualifier word → rating floor. NEG words flip to a ceiling ("weak shooter" = shooting ≤ 45).
const POS_QUAL = { 'elite-level': 90, 'all-time': 90, elite: 90, dominant: 90, exceptional: 82, excellent: 82, premier: 82, superb: 82, lockdown: 82, great: 82, best: 82, top: 82, 'above average': 70, good: 70, strong: 70, solid: 70, quality: 70, skilled: 70, serviceable: 60, decent: 60, capable: 60, reliable: 60 }
const NEG_QUAL = { 'below average': 45, weak: 45, poor: 45, terrible: 45, awful: 45, bad: 45 }
const DEFAULT_FLOOR = 70 // a bare ability ("shooters") means a good-or-better rating

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'who', 'whose', 'whom', 'that', 'which', 'are', 'is', 'was', 'were', 'be', 'been', 'from', 'in', 'on', 'of', 'for', 'to', 'by', 'as', 'at', 'show', 'me', 'us', 'all', 'any', 'some', 'players', 'player', 'guys', 'dudes', 'people', 'find', 'list', 'give', 'get', 'want', 'looking', 'search', 'best', 'top', 'most', 'more', 'less', 'than', 'over', 'under', 'about', 'very', 'really', 'quite', 'only', 'just', 'during', 'era', 'eras', 'season', 'seasons', 'year', 'years', 'nba', 'aba', 'per', 'game', 'games', 'high', 'higher', 'low', 'lower', 'plus', 'minus', 'between', 'career', 'prime', 'played', 'play', 'playing', 'had', 'his', 'their',
  // position / archetype words we can't filter on (the data has ratings & stats, not positions)
  // — ignore them rather than treating them as a name search
  'big', 'bigs', 'man', 'men', 'center', 'centers', 'guard', 'guards', 'forward', 'forwards',
  'wing', 'wings', 'point', 'combo', 'swingman', 'stretch', 'rookie', 'veteran', 'vet', 'star',
  'stars', 'superstar', 'superstars', 'legend', 'legends', 'greats', 'hooper', 'hoopers'])

const NUM = '(\\d+(?:\\.\\d+)?)'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const byLenDesc = (arr) => [...arr].sort((a, b) => b.length - a.length)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// Build the (memoizable) team vocabulary from the data's own team_label nicknames — data-driven
// so it tracks historical identities (SuperSonics, Bullets, Bobcats) for free. Each nickname
// gets its full form plus its last word ("blazers" → "Trail Blazers") as match phrases.
export function buildFilterContext(game) {
  const nicks = new Set()
  for (const p of game.players) nicks.add(p.team_label.replace(/^\d{4}\s+/, ''))
  const teamPhrases = []
  for (const nick of nicks) {
    const low = nick.toLowerCase()
    teamPhrases.push({ phrase: low, nick })
    const parts = low.split(/\s+/)
    if (parts.length > 1 && parts[parts.length - 1].length >= 4) {
      teamPhrases.push({ phrase: parts[parts.length - 1], nick })
    }
  }
  teamPhrases.sort((a, b) => b.phrase.length - a.phrase.length) // longest phrase wins first
  return { teamPhrases }
}

// Decorate the player list with the fields the filters need (season, parsed once from the id).
export function indexPlayers(game) {
  return game.players.map((p) => {
    const parts = p.id.split('_') // "abdelal01_1992_POR" -> [slug, season, franchise]
    return { ...p, _season: Number(parts[parts.length - 2]) }
  })
}

// Parse a query into { filters, chips }. Each filter is { key, label, test(player) }; the UI
// keeps the first filter per key (so duplicate phrases don't stack) and ANDs all tests.
export function parseFilters(text, ctx = { teamPhrases: [] }) {
  let rest = ` ${(text || '').toLowerCase()} `
  const filters = []
  const seen = new Set()
  const add = (f) => { if (!seen.has(f.key)) { seen.add(f.key); filters.push(f) } }

  // eat(re, handle): replace every match with a space (consuming it) and run handle(groups).
  const eat = (re, handle) => {
    rest = rest.replace(re, function () {
      handle([].slice.call(arguments)) // [match, g1, g2, ..., offset, string]
      return ' '
    })
  }

  // --- seasons: ranges, open-ended bounds, single years, decades (most specific first) ---
  const YEAR = '((?:19|20)\\d{2})'
  eat(new RegExp(`\\b(?:between\\s+)?${YEAR}\\s*(?:-|–|—|to|and|through|thru)\\s*${YEAR}\\b`, 'gi'), (g) => {
    const lo = Number(g[1]); const hi = Number(g[2]); const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
    add({ key: 'season', label: `${a}–${b}`, test: (p) => p._season >= a && p._season <= b })
  })
  eat(new RegExp(`\\b(?:before|prior to|up to|until)\\s+${YEAR}\\b`, 'gi'), (g) => {
    const y = Number(g[1]); add({ key: 'season', label: `Before ${y}`, test: (p) => p._season < y })
  })
  eat(new RegExp(`\\b(?:after|since|from)\\s+${YEAR}\\b`, 'gi'), (g) => {
    const y = Number(g[1]); add({ key: 'season', label: `${y}+`, test: (p) => p._season >= y })
  })
  eat(new RegExp(`\\b${YEAR}\\b`, 'gi'), (g) => {
    const y = Number(g[1]); add({ key: 'season', label: `${y}`, test: (p) => p._season === y })
  })
  eat(/\b(?:(19|20))?(\d0)s\b/gi, (g) => {
    const dd = Number(g[2])
    const start = g[1] ? Number(`${g[1]}${g[2]}`) : dd >= 80 ? 1900 + dd : 2000 + dd
    add({ key: 'season', label: `${start}s`, test: (p) => p._season >= start && p._season <= start + 9 })
  })

  // --- teams (data-driven phrases; match the team_label suffix so the year never interferes) ---
  for (const { phrase, nick } of ctx.teamPhrases) {
    const suffix = nick.toLowerCase()
    eat(new RegExp(`\\b${esc(phrase)}\\b`, 'gi'), () => {
      add({ key: `team:${suffix}`, label: nick, test: (p) => p.team_label.toLowerCase().endsWith(suffix) })
    })
  }

  // --- per-game stat thresholds (need a number) ---
  for (const [key, syns] of Object.entries(STAT_SYNONYMS)) {
    const S = byLenDesc(syns).map(esc).join('|')
    const label = STAT_LABEL[key]
    const gte = (n) => add({ key: `stat:${key}:gte`, label: `${label} ≥ ${fmtNum(n)}`, test: (p) => (p.stats?.[key] ?? 0) >= n })
    const lte = (n) => add({ key: `stat:${key}:lte`, label: `${label} ≤ ${fmtNum(n)}`, test: (p) => (p.stats?.[key] ?? 0) <= n })
    eat(new RegExp(`\\b(?:${S})\\s*(?:>=|>|over|above|at least|more than)\\s*${NUM}`, 'gi'), (g) => gte(Number(g[1])))
    eat(new RegExp(`\\b(?:${S})\\s*(?:<=|<|under|below|less than|fewer than)\\s*${NUM}`, 'gi'), (g) => lte(Number(g[1])))
    eat(new RegExp(`\\b(?:over|above|at least|more than|>=|>)\\s*${NUM}\\+?\\s*(?:${S})\\b`, 'gi'), (g) => gte(Number(g[1])))
    eat(new RegExp(`\\b(?:under|below|less than|fewer than|<=|<)\\s*${NUM}\\s*(?:${S})\\b`, 'gi'), (g) => lte(Number(g[1])))
    eat(new RegExp(`\\b${NUM}\\+?\\s*(?:${S})\\b`, 'gi'), (g) => gte(Number(g[1])))
  }
  // verb form implies points: "scores 25", "drops 30+"
  eat(new RegExp(`\\b(?:scores?|scoring|puts up|drops|dropping)\\s+${NUM}\\+?`, 'gi'), (g) => {
    const n = Number(g[1]); add({ key: 'stat:ppg:gte', label: `${STAT_LABEL.ppg} ≥ ${fmtNum(n)}`, test: (p) => (p.stats?.ppg ?? 0) >= n })
  })

  // --- rating thresholds: an optional qualifier in front of an ability word ---
  const QUAL = byLenDesc([...Object.keys(POS_QUAL), ...Object.keys(NEG_QUAL)]).map(esc).join('|')
  for (const [key, syns] of Object.entries(ABILITY_SYNONYMS)) {
    const A = byLenDesc(syns).map(esc).join('|')
    eat(new RegExp(`\\b(?:(${QUAL})\\s+)?(?:${A})\\b`, 'gi'), (g) => {
      const qual = g[1]
      if (qual && qual in NEG_QUAL) {
        const v = NEG_QUAL[qual]
        add({ key: `rate:${key}:lte`, label: `${cap(qual)} ${ABILITY_LABEL[key]}`, test: (p) => (p.ratings?.[key] ?? 0) <= v })
      } else {
        const v = qual ? POS_QUAL[qual] : DEFAULT_FLOOR
        const word = qual ? cap(qual) + ' ' : ''
        add({ key: `rate:${key}:gte`, label: `${word}${ABILITY_LABEL[key]}`, test: (p) => (p.ratings?.[key] ?? 0) >= v })
      }
    })
  }

  // --- leftover words → a name search (every remaining content word must appear in the name) ---
  const words = (rest.match(/[a-z][a-z'-]{2,}/gi) || []).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w))
  if (words.length) {
    add({ key: 'name', label: `Name: “${words.join(' ')}”`, test: (p) => { const n = p.name.toLowerCase(); return words.every((w) => n.includes(w)) } })
  }

  return { filters, chips: filters.map((f) => f.label) }
}
