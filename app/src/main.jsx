import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './game/settings.js'
import './styles.css'

initTheme() // apply saved theme before first paint (no flash)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
