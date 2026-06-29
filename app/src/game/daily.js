// Daily-mode calendar: date strings, puzzle numbers, the playable archive window, and the
// countdown to the next puzzle. All LOCAL-time, so "today" rolls over at the player's own
// midnight (matching Wordle / HoopGrids).

export const LAUNCH = '2026-06-01' // Daily #1. Bump to the real launch date before shipping.

const pad = (n) => String(n).padStart(2, '0')

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

// noon-UTC anchoring avoids DST off-by-one when differencing whole days.
function utcNoon(s) {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

// 1-based puzzle number (LAUNCH === #1). Can be <1 if the clock is before launch.
export function dayNumber(dateStr, launch = LAUNCH) {
  return Math.floor((utcNoon(dateStr) - utcNoon(launch)) / 86400000) + 1
}

export function seedForDate(dateStr) {
  return 'daily-' + dateStr
}

// Shift a YYYY-MM-DD by n days (local; handles month/year rollover).
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d + n))
}

// Every playable day, today first back to LAUNCH (clamped to [today] if the clock predates launch).
export function archiveDates(today = todayStr(), launch = LAUNCH) {
  const n = dayNumber(today, launch)
  if (n < 1) return [today]
  const out = []
  for (let i = 0; i < n; i++) out.push(addDays(today, -i))
  return out
}

// "7h 12m" until the next local midnight.
export function nextDailyIn(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const ms = Math.max(0, next - now)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}
