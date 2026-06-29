// Local persistence (App spec, virality pass): completed daily results + the streak they
// power. Pure read/modify/write over one localStorage key; every accessor tolerates a
// missing or corrupt store (private mode, SSR, tests) by falling back to an empty state.
import { todayStr, addDays } from './daily.js'

const KEY = 'sixspins.v1'

function read() {
  try {
    if (typeof localStorage === 'undefined') return { daily: {} }
    return JSON.parse(localStorage.getItem(KEY)) || { daily: {} }
  } catch {
    return { daily: {} }
  }
}

function write(state) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode / quota — the run still works, it just won't be remembered */
  }
}

export function getDaily(date) {
  return read().daily?.[date] || null
}

export function hasPlayedDaily(date) {
  return !!getDaily(date)
}

// Persist a completed daily. The FIRST score for a date is final — never overwritten, so a
// refresh-and-replay can't change your number. Returns the refreshed stats.
export function saveDaily(date, record) {
  const s = read()
  s.daily = s.daily || {}
  if (!s.daily[date]) {
    s.daily[date] = record
    write(s)
  }
  return computeStats(s, todayStr())
}

export function getStats(today = todayStr()) {
  return computeStats(read(), today)
}

function computeStats(s, today) {
  const played = new Set(Object.keys(s.daily || {}))
  // current streak: consecutive completed days ending today (or yesterday, if today's not done yet)
  const anchor = played.has(today) ? today : addDays(today, -1)
  let current = 0
  if (played.has(anchor)) {
    let d = anchor
    while (played.has(d)) {
      current++
      d = addDays(d, -1)
    }
  }
  // best streak: longest run anywhere in the history
  let best = 0
  for (const d of played) {
    if (played.has(addDays(d, -1))) continue // only count from a run's start
    let len = 0
    let c = d
    while (played.has(c)) {
      len++
      c = addDays(c, 1)
    }
    if (len > best) best = len
  }
  return { current, best, totalPlayed: played.size, playedToday: played.has(today) }
}
