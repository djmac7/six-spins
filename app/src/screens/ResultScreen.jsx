import { useMemo, useState } from 'react'
import ResultCard from '../ui/ResultCard.jsx'
import ShareModal from '../ui/ShareModal.jsx'
import { findComp } from '../game/comp.js'
import { buildShareText, shareLink } from '../ui/share.js'
import { computeOvr } from '../ui/helpers.js'
import { nextDailyIn } from '../game/daily.js'

// Used for the daily REVISIT path (a completed daily you re-open). Play Again is the main CTA;
// Share opens the 82-0-style modal. Same ResultCard + ShareModal as the live reveal.
export default function ResultScreen({
  game, state, mode = 'unlimited', session, stats, revisit = false,
  onPlayAgain, onPlayUnlimited, onPlayDaily, onOpenArchive,
}) {
  const total = state.result.total
  const ovr = computeOvr(total)
  const comp = useMemo(() => findComp(game.players, state.slots), [game.players, state.slots])
  const isDaily = mode === 'daily'
  const tag = session?.label || '82-0 inspired'
  const [shareOpen, setShareOpen] = useState(false)

  const meta = session && { mode: session.mode, date: session.date, dayNumber: session.dayNumber, seed: session.seed }
  const shareMessage = useMemo(
    () => buildShareText({ ovr, slots: state.slots, comp, meta, url: '' }),
    [ovr, state.slots, comp, session]
  )
  const shareUrl = useMemo(() => shareLink(meta), [session])

  return (
    <div className="screen result-screen">
      <div className="result-screen__head">
        {revisit && isDaily ? `Daily #${session.dayNumber} complete ✓` : 'Your player'}
      </div>

      <ResultCard game={game} state={state} comp={comp} tag={tag} />

      {isDaily && stats && (
        <div className="daily-status">
          <span className="daily-status__streak">
            🔥 {stats.current} day{stats.current === 1 ? '' : 's'}
            {stats.best > stats.current ? ` · best ${stats.best}` : ''}
          </span>
          <span className="daily-status__next">Next daily in {nextDailyIn()}</span>
        </div>
      )}

      <div className="result-actions">
        {isDaily ? (
          <button className="btn-primary" onClick={onPlayUnlimited}>Play Unlimited</button>
        ) : (
          <button className="btn-primary" onClick={onPlayAgain}>Play again <kbd className="kbd">R</kbd></button>
        )}
        <button className="btn-secondary" onClick={() => setShareOpen(true)}>
          Challenge a friend
        </button>
        {isDaily && <button className="btn-secondary" onClick={onOpenArchive}>Archive</button>}
      </div>

      {shareOpen && (
        <ShareModal
          game={game} state={state} comp={comp} tag={tag}
          message={shareMessage} url={shareUrl} total={total}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
