import { useEffect, useRef, useState } from 'react'
import { initials, readableText } from './helpers.js'

// Player chip. The initials on the team color render immediately; the real headshot fades IN
// over them once decoded (no pop / layout flash), and a 404 just leaves the initials showing
// (App spec §1 resilience). crossOrigin lets the result-card PNG export inline the image.
export default function Avatar({ name, src, color = '#333', size = 44, rounded = 9 }) {
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  const imgRef = useRef(null)

  // cached images can finish before React attaches onLoad — catch that on mount so they still fade in
  useEffect(() => {
    setLoaded(false)
    setBroken(false)
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true)
  }, [src])

  const style = {
    width: size,
    height: size,
    borderRadius: rounded,
    background: color,
    color: readableText(color),
    fontSize: Math.round(size * 0.36),
  }
  return (
    <div className="avatar" style={style} aria-hidden="true">
      <span className="avatar__initials">{initials(name)}</span>
      {src && !broken && (
        <img
          ref={imgRef}
          className={'avatar__img' + (loaded ? ' is-loaded' : '')}
          src={src}
          alt=""
          crossOrigin="anonymous"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
        />
      )}
    </div>
  )
}
