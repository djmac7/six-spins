import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Share2 } from 'lucide-react'
import GoatCard from '../ui/GoatCard.jsx'
import PlayerComp from '../ui/PlayerComp.jsx'
import TierMeter from '../ui/TierMeter.jsx'
import ShareModal from '../ui/ShareModal.jsx'
import { findComp } from '../game/comp.js'
import { buildShareText, shareLink } from '../ui/share.js'
import { percentileTier, TIER_BLURB, TIER_CELEBRATE } from '../ui/helpers.js'
import { ordinalSuffix } from '../ui/ordinal.js'

// Final reveal (App spec §5): assemble the card, COUNT UP the six ratings in sequence,
// hard pause, then SLAM the percentile as the climax with the ceiling as context.
// Once scored, the GOAT card collapses (toggleable) so the percentile + a prominent
// Play Again land above the fold — no scrolling to replay. High percentiles get confetti.
const BEAT_MS = 430 // count-up cadence — back to the original, readable pace
const PAUSE_MS = 380 // shorter hold before the percentile so the transition stays snappy

export default function RevealScreen({ game, state, mode = 'unlimited', session, onPlayAgain }) {
  const total = state.result.total
  const ceiling = state.result.ceiling
  // round BEFORE picking the tier so the shown number and the accolade always agree
  const percentile = Math.round(game.getPercentile(total))
  const tier = percentileTier(percentile)

  const comp = useMemo(() => findComp(game.players, state.slots), [game.players, state.slots])

  // Share opens an 82-0-style modal (overlay, not a separate screen). The message carries
  // the squares + percentile + comp; the deep link is shared separately.
  const meta = session && { mode: session.mode, date: session.date, dayNumber: session.dayNumber, seed: session.seed }
  const shareMessage = useMemo(
    () => buildShareText({ percentile, total, ceiling, slots: state.slots, comp, meta, url: '' }),
    [percentile, total, ceiling, state.slots, comp, session]
  )
  const shareUrl = useMemo(() => shareLink(meta), [session])
  const cardTag = session?.label || '82-0 inspired'
  const [shareOpen, setShareOpen] = useState(false)

  const [revealCount, setRevealCount] = useState(0)
  const [showPct, setShowPct] = useState(false)
  const [teamOpen, setTeamOpen] = useState(true) // full card during the count-up; collapses at the slam
  const fired = useRef(false)

  useEffect(() => {
    const timers = []
    for (let i = 1; i <= 6; i++) timers.push(setTimeout(() => setRevealCount(i), i * BEAT_MS))
    // at the tally: slam the percentile and fold the card together (smooth height+opacity
    // transition carries the result into focus — no extra pause).
    timers.push(setTimeout(() => {
      setShowPct(true)
      setTeamOpen(false)
    }, 6 * BEAT_MS + PAUSE_MS))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (showPct && !fired.current && TIER_CELEBRATE.has(tier)) {
      fired.current = true
      const burst = tier === 'goat' ? 160 : tier === 'hof' ? 120 : 90
      confetti({ particleCount: burst, spread: 80, origin: { y: 0.4 }, scalar: 1.1 })
      if (tier === 'goat') {
        setTimeout(() => confetti({ particleCount: 120, spread: 110, origin: { y: 0.5 } }), 250)
      }
    }
  }, [showPct, tier])

  // Once scored: R = next game, S = open share. Ignore Cmd/Ctrl so reload/save still work.
  useEffect(() => {
    if (!showPct) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'r') { e.preventDefault(); onPlayAgain() }
      else if (k === 's') { e.preventDefault(); setShareOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPct, onPlayAgain])

  return (
    <div className={'screen reveal-screen tier-bg-' + tier}>
      {/* The scored GOAT card. After the tally it collapses to a toggle bar so the result
          (and Play Again) are immediately visible; the user can re-open it any time. */}
      <div className={'reveal-team' + (teamOpen ? '' : ' collapsed')}>
        {showPct && (
          <button className="reveal-team__toggle" onClick={() => setTeamOpen((o) => !o)} aria-expanded={teamOpen}>
            {teamOpen ? (
              <>
                <span>Hide breakdown</span>
                <span className="reveal-team__chev" aria-hidden="true">▲</span>
              </>
            ) : (
              <>
                <span>View your player</span>
                <span className="reveal-team__score"><b>{total}</b><span className="reveal-team__slash">/</span>{ceiling}</span>
                <span className="reveal-team__chev" aria-hidden="true">▼</span>
              </>
            )}
          </button>
        )}
        <div className="reveal-team__body">
          <div>
            <GoatCard
              slots={state.slots}
              game={game}
              runningTotal={revealCount >= 6 ? total : sumShown(state.slots, revealCount)}
              revealCount={revealCount}
              ceiling={ceiling}
            />
          </div>
        </div>
      </div>

      {showPct && (
        <div className={'pct-slam tc-' + tier}>
          <div className="pct-slam__big">
            <span className="pct-slam__num">{percentile}</span>
            <span className="pct-slam__ord">{ordinalSuffix(percentile)}</span>
          </div>
          <div className="pct-slam__word">percentile</div>
          <div className="pct-slam__blurb">{TIER_BLURB[tier]}</div>

          {/* Play Again is the main CTA, right under the score (above the fold). Share opens
              the 82-0-style modal. */}
          <div className="pct-slam__actions">
            <button className="btn-primary" onClick={onPlayAgain}>
              {mode === 'daily' ? 'Play Unlimited' : 'Play again'} <kbd className="kbd">R</kbd>
            </button>
            <button className="btn-secondary" onClick={() => setShareOpen(true)}>
              <Share2 size={17} />Share results <kbd className="kbd">S</kbd>
            </button>
          </div>

          <TierMeter percentile={percentile} total={total} scoreForPercentile={game.scoreForPercentile} />
          <PlayerComp comp={comp} />
        </div>
      )}

      {shareOpen && (
        <ShareModal
          game={game} state={state} percentile={percentile} comp={comp} tag={cardTag}
          message={shareMessage} url={shareUrl} total={total}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function sumShown(slots, n) {
  return slots.slice(0, n).reduce((s, x) => s + (x.rating ?? 0), 0)
}
