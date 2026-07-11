import { Swords } from 'lucide-react'

// 1v1 scoreboard: shown on the reveal/result when this run was played off a friend's
// challenge link (the `goal` carried by ?seed=&goal=). Shows both players' OVRs side by
// side, then calls the match. Nothing is persisted — reopening the same link replays it.
export default function VersusVerdict({ goal, ovr }) {
  if (!Number.isFinite(goal)) return null
  const diff = ovr - goal
  const cls = diff > 0 ? 'win' : diff < 0 ? 'loss' : 'tie'
  const line = diff > 0 ? 'You won the challenge!' : diff < 0 ? 'Better luck next time.' : 'Dead tie. Run it back.'
  return (
    <div className={'vs-result vs-result--' + cls}>
      <div className="vs-result__scores">
        <div className="vs-score">
          <span className="vs-score__who">You</span>
          <span className="vs-score__num">{ovr}</span>
          <span className="vs-score__ovr">OVR</span>
        </div>
        <span className="vs-result__x" aria-hidden="true"><Swords size={16} strokeWidth={2.2} /></span>
        <div className="vs-score">
          <span className="vs-score__who">Them</span>
          <span className="vs-score__num">{goal}</span>
          <span className="vs-score__ovr">OVR</span>
        </div>
      </div>
      <div className="vs-result__line">{line}</div>
    </div>
  )
}
