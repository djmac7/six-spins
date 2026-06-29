import { useState } from 'react'
import { toBlob } from 'html-to-image'

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
// images are same-origin (public/img) so they inline cleanly; the transparent placeholder
// keeps the export from throwing if any single image ever fails to load. skipFonts avoids a
// cross-origin fetch of the Google Fonts stylesheet (which only logs an error and can't embed
// anyway — the card renders fine with the system fallback).
const PNG_OPTS = { pixelRatio: 2, backgroundColor: '#ffffff', imagePlaceholder: TRANSPARENT, skipFonts: true }

export const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

// Shared share/copy/save behaviour for the result card. `cardRef` points at the (possibly
// off-screen) ResultCard node used for image export — so sharing never needs its own screen.
export function useShareActions(cardRef, shareText, filename = 'six-spins.png') {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 2200) }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(shareText)
      flash()
    } catch (e) {
      console.error('[share] copy failed', e)
    }
  }

  // Native share sheet (text + the card image when the platform allows it), falling back to
  // clipboard on desktop browsers without the Web Share API. Stays on the current screen.
  async function onShare() {
    if (!canWebShare) return copyText()
    try {
      let files
      try {
        const blob = cardRef.current && (await toBlob(cardRef.current, PNG_OPTS))
        const file = blob && new File([blob], filename, { type: 'image/png' })
        if (file && navigator.canShare?.({ files: [file] })) files = [file]
      } catch { /* image is a bonus; text always ships */ }
      await navigator.share(files ? { text: shareText, files } : { text: shareText })
    } catch (e) {
      if (e?.name === 'AbortError') return // user dismissed the sheet
      copyText()
    }
  }

  async function saveImage() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      // Blob URL + an anchor attached to the DOM: a detached anchor or a multi-hundred-KB
      // data: URL silently fails to download in several browsers (Firefox, some Chrome).
      const blob = await toBlob(cardRef.current, PNG_OPTS)
      if (!blob) throw new Error('export produced no image')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      console.error('[share] image export failed', e)
    } finally {
      setSaving(false)
    }
  }

  return { onShare, copyText, saveImage, copied, saving }
}
