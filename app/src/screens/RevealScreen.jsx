import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import GoatCard from '../ui/GoatCard.jsx'
import PlayerComp from '../ui/PlayerComp.jsx'
import TierMeter from '../ui/TierMeter.jsx'
import ShareModal from '../ui/ShareModal.jsx'
import { findComp } from '../game/comp.js'
import { buildShareText, shareLink } from '../ui/share.js'
import { computeOvr, ovrColorClass, isPerfectRun, OVR_CELEBRATE } from '../ui/helpers.js'

// Final reveal (App spec §5): assemble the card, COUNT UP the six ratings in sequence,
// hard pause, then SLAM the percentile as the climax with the ceiling as context.
// Once scored, the GOAT card collapses (toggleable) so the percentile + a prominent
// Play Again land above the fold — no scrolling to replay. High percentiles get confetti.
const BEAT_MS = 430 // count-up cadence — back to the original, readable pace
const PAUSE_MS = 380 // shorter hold before the percentile so the transition stays snappy

export default function RevealScreen({ game, state, mode = 'unlimited', session, onPlayAgain }) {
  const total = state.result.total
  const ceiling = state.result.ceiling
  // 2K-style OVERALL rating (avg of the six attributes, capped 99) — the headline hook.
  const ovr = computeOvr(total)
  const colorClass = ovrColorClass(ovr) // color the OVR like an attribute of the same value
  const perfect = isPerfectRun(state.slots) // all six attributes 99 → rainbow glimmer

  const comp = useMemo(() => findComp(game.players, state.slots), [game.players, state.slots])

  // Share opens an 82-0-style modal (overlay, not a separate screen). The message carries
  // the squares + percentile + comp; the deep link is shared separately.
  const meta = session && { mode: session.mode, date: session.date, dayNumber: session.dayNumber, seed: session.seed }
  const shareMessage = useMemo(
    () => buildShareText({ ovr, slots: state.slots, comp, meta, url: '' }),
    [ovr, state.slots, comp, session]
  )
  const shareUrl = useMemo(() => shareLink(meta), [session])
  const cardTag = session?.label || '82-0 inspired'
  const [shareOpen, setShareOpen] = useState(false)

  const [revealCount, setRevealCount] = useState(0)
  // showPct kept as the name of the "reveal the result" flag (least churn); it now gates the grade slam
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
    if (showPct && !fired.current && ovr >= OVR_CELEBRATE) {
      fired.current = true
      if (ovr >= 99) {
        return fireGoatCelebration() // a perfect 99 (GOAT) gets the full gold spectacle
      }
      const burst = ovr >= 94 ? 120 : 90
      confetti({ particleCount: burst, spread: 80, origin: { y: 0.4 }, scalar: 1.1 })
    }
  }, [showPct, ovr])

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
    <div className="screen reveal-screen">
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
              hideTotal={showPct}
              ceiling={ceiling}
            />
          </div>
        </div>
      </div>

      {showPct && (
        <div className={'pct-slam grade-slam ' + colorClass + (perfect ? ' perfect' : '')}>
          {/* the OVR is the hero — a single 2K-style overall, nothing else */}
          <div className="pct-slam__ovr">
            <span className="pct-slam__num">{ovr}</span>
            <span className="pct-slam__ovrlabel">OVR</span>
          </div>

          {/* Play Again is the main CTA, right under the score (above the fold). Share opens
              the 82-0-style modal. */}
          <div className="pct-slam__actions">
            <button className="btn-primary" onClick={onPlayAgain}>
              {mode === 'daily' ? 'Play Unlimited' : 'Play again'} <kbd className="kbd">R</kbd>
            </button>
            <button className="btn-secondary" onClick={() => setShareOpen(true)}>
              Challenge a friend <kbd className="kbd">S</kbd>
            </button>
          </div>

          <TierMeter ovr={ovr} />
          <PlayerComp comp={comp} />
        </div>
      )}

      {shareOpen && (
        <ShareModal
          game={game} state={state} comp={comp} tag={cardTag}
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

// Topping the ladder (99th) earns its own gold spectacle — distinct from the hof/allnba
// confetti so reaching THE GOAT lands as an event: a climax burst, twin gold cannons,
// a shower of 🐐, then a lingering wave. Returns a cleanup that cancels pending bursts.
function fireGoatCelebration() {
  const gold = ['#ffd700', '#f6c945', '#e3b341', '#c89200', '#fff3bf']
  const timers = []
  confetti({ particleCount: 200, spread: 100, startVelocity: 45, origin: { y: 0.42 }, scalar: 1.2, colors: gold })
  timers.push(setTimeout(() => {
    confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.65 }, colors: gold })
    confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.65 }, colors: gold })
  }, 180))
  let goat
  try { goat = confetti.shapeFromText({ text: '🐐', scalar: 2.6 }) } catch (e) { /* older canvas-confetti */ }
  timers.push(setTimeout(() => confetti({
    particleCount: goat ? 26 : 120, spread: 130, startVelocity: 36, origin: { y: 0.3 },
    ...(goat ? { shapes: [goat], scalar: 2.6 } : { colors: gold }),
  }), 380))
  timers.push(setTimeout(() => confetti({ particleCount: 130, spread: 120, origin: { y: 0.5 }, colors: gold, scalar: 1.1 }), 650))
  return () => timers.forEach(clearTimeout)
}
