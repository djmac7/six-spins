import { useEffect, useState } from 'react'

// Persistent user settings (theme + difficulty). Stored in localStorage; tolerant of
// private-mode / SSR by falling back to defaults.
const KEY = 'sixspins.settings'
const DEFAULTS = { theme: 'light', hideStats: false }

function read() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(s) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* ignore */ }
}

// Apply the theme to <html data-theme> so CSS can switch tokens.
export function applyTheme(theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

// Apply the saved theme as early as possible (called from main before render) to avoid a flash.
export function initTheme() {
  applyTheme(read().theme)
}

// Shared settings hook: returns [settings, update]. Persists + applies theme on change.
export function useSettings() {
  const [settings, setSettings] = useState(read)

  useEffect(() => {
    applyTheme(settings.theme)
    write(settings)
  }, [settings])

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }))
  return [settings, update]
}
