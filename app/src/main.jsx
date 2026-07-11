import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './game/settings.js'
import './styles.css'

initTheme() // apply saved theme before first paint (no flash)

// Cache-first service worker for /img/ headshots — makes repeat visits and
// Browse↔board navigation hit the local cache. Production only: the dev server
// serves images fine and a stale SW there just confuses hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
