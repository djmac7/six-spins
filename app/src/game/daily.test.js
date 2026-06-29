import { describe, it, expect } from 'vitest'
import { dayNumber, addDays, archiveDates, isDateStr, seedForDate, toDateStr } from './daily.js'

describe('daily calendar', () => {
  it('LAUNCH is puzzle #1 and numbers count up by day', () => {
    expect(dayNumber('2026-06-01', '2026-06-01')).toBe(1)
    expect(dayNumber('2026-06-02', '2026-06-01')).toBe(2)
    expect(dayNumber('2026-07-01', '2026-06-01')).toBe(31)
  })

  it('addDays rolls over months and years', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-10', -9)).toBe('2026-03-01')
  })

  it('archiveDates lists today-first back to launch, inclusive', () => {
    const dates = archiveDates('2026-06-03', '2026-06-01')
    expect(dates).toEqual(['2026-06-03', '2026-06-02', '2026-06-01'])
  })

  it('archiveDates clamps to just today when the clock predates launch', () => {
    expect(archiveDates('2026-05-30', '2026-06-01')).toEqual(['2026-05-30'])
  })

  it('isDateStr validates shape', () => {
    expect(isDateStr('2026-06-29')).toBe(true)
    expect(isDateStr('2026-6-9')).toBe(false)
    expect(isDateStr('nope')).toBe(false)
    expect(isDateStr(null)).toBe(false)
  })

  it('seedForDate is stable and date-scoped', () => {
    expect(seedForDate('2026-06-29')).toBe('daily-2026-06-29')
  })

  it('toDateStr zero-pads', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
