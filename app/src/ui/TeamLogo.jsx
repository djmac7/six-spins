import { useState } from 'react'
import { teamLogoUrl } from './assets.js'
import { readableText } from './helpers.js'

// Franchise logo with graceful fallback: try the (possibly historical) logo, then the
// CURRENT franchise's logo, then the abbreviation badge. So a relocated team with no
// era-specific art (SuperSonics, Nationals, Blackhawks) shows its modern franchise logo
// instead of a bare badge. Pass `fallback` = the canonical franchise id.
export default function TeamLogo({ franchise, fallback, color = '#2a2a36', size = 26, badge = true }) {
  const candidates = [...new Set(
    [teamLogoUrl(franchise), fallback && fallback !== franchise ? teamLogoUrl(fallback) : null].filter(Boolean)
  )]
  const [idx, setIdx] = useState(0)
  const url = candidates[idx]
  if (url) {
    return (
      <img
        className="tlogo"
        src={url}
        alt=""
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setIdx((i) => i + 1)}
      />
    )
  }
  if (!badge) return null
  return (
    <span
      className="tlogo-badge"
      style={{ width: size, height: size, background: color, color: readableText(color), fontSize: Math.round(size * 0.34) }}
    >
      {franchise}
    </span>
  )
}
