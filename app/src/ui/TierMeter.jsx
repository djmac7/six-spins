import { useMemo } from 'react'
import { OVR_TIERS, ovrTier, ratingTier, randomGoatLine } from './helpers.js'

// Gamified OVR ladder: a row of stepped bars rising toward All-Time Great, lit through the
// player's current tier so they can see how close they are — and what's left to climb to a
// 99 OVR.
export default function TierMeter({ ovr }) {
  const cur = ovrTier(ovr)
  const curIdx = OVR_TIERS.findIndex((t) => t.label === cur.label) // 0 = best
  const goatLine = useMemo(() => randomGoatLine(), [])

  // render worst -> best so the staircase rises to the right
  const steps = [...OVR_TIERS].reverse()
  const curStep = steps.length - 1 - curIdx

  return (
    <div className="tiermeter">
      <div className="tiermeter__bars" role="img" aria-label={`Tier: ${cur.label}`}>
        {steps.map((t, i) => {
          const achieved = i <= curStep
          // color each step like the attribute rating at that tier's floor (green/blue/slate)
          return (
            <div
              key={t.label}
              className={'tiermeter__step tc-' + ratingTier(t.min) + (achieved ? ' on' : '') + (i === curStep ? ' cur' : '')}
              style={{ '--c': 'var(--tier-color)', height: 10 + i * 4 }}
              title={t.label}
            />
          )
        })}
      </div>
      <div className="tiermeter__caption">
        <span className={'tiermeter__cur tc-' + ratingTier(ovr)}>{cur.label}</span>
        {ovr >= 99 ? (
          <span className="tiermeter__next">{goatLine}</span>
        ) : (
          <span className="tiermeter__next">{99 - ovr} pts away from GOAT</span>
        )}
      </div>
    </div>
  )
}
