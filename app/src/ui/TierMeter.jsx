import { useMemo } from 'react'
import { TIERS, tierRange, randomGoatLine } from './helpers.js'

// Gamified rank ladder: a row of stepped bars rising toward THE GOAT, lit up through the
// player's current tier so they can see how close they are — and what's left to climb.
// Per-step tooltip (native title) shows the percentile range, keeping the UI uncluttered.
export default function TierMeter({ percentile, total, scoreForPercentile }) {
  // current tier = highest tier whose floor the percentile clears
  const curIdx = TIERS.findIndex((t) => percentile >= t.min) // index in best->worst
  const cur = TIERS[curIdx] ?? TIERS[TIERS.length - 1]
  // pick the GOAT flourish once per result (stable across the reveal's re-renders)
  const goatLine = useMemo(() => randomGoatLine(), [])

  // render worst -> best so the staircase rises to the right
  const steps = [...TIERS].reverse()
  const curStep = steps.length - 1 - curIdx

  return (
    <div className="tiermeter">
      <div className="tiermeter__bars" role="img" aria-label={`Rank: ${cur.label}`}>
        {steps.map((t, i) => {
          const achieved = i <= curStep
          return (
            <div
              key={t.key}
              className={'tiermeter__step tc-' + t.key + (achieved ? ' on' : '') + (i === curStep ? ' cur' : '')}
              style={{ '--c': 'var(--tier-color)', height: 10 + i * 4 }}
              title={`${t.label} · ${tierRange(t)}`}
            />
          )
        })}
      </div>
      <div className="tiermeter__caption">
        <span className={'tiermeter__cur tc-' + cur.key}>{cur.label}</span>
        {cur.key === 'goat' ? (
          <span className="tiermeter__next">{goatLine}</span>
        ) : (
          <span className="tiermeter__next">
            {scoreForPercentile ? Math.max(1, scoreForPercentile(TIERS[0].min) - Math.round(total)) : TIERS[0].min - percentile} pts to GOAT
          </span>
        )}
      </div>
    </div>
  )
}
