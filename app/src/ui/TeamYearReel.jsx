import { useEffect, useMemo, useRef, useState } from 'react'
import { readableText, seasonLabel } from './helpers.js'
import { teamLogoUrl } from './assets.js'

const ITEM_H = 92 // px, must match .tyreel__item height in CSS

// The spin (App spec §5) with INDEPENDENT axes: a Team reel and a Year reel side by side.
// On a fresh spin both reels roll and land; on Reroll Team only the team reel rolls (year
// holds), on Reroll Year only the year reel rolls. Calls onSettle once the rolling stops.
export default function TeamYearReel({
  franchises, seasons, targetFranchise, targetSeason, animateTeam, animateYear, spinKey, onSettle,
}) {
  const settled = useRef(false)
  const [go, setGo] = useState(false)

  const teamStrip = useMemo(
    () => buildStrip(franchises, (f) => f.id === targetFranchise, animateTeam),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spinKey, targetFranchise, animateTeam]
  )
  const yearStrip = useMemo(
    () => buildOrderedStrip(seasons, targetSeason, animateYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spinKey, targetSeason, animateYear]
  )

  useEffect(() => {
    settled.current = false
    setGo(false)
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    // if nothing animates (shouldn't happen), settle on the next tick
    const t = !animateTeam && !animateYear ? setTimeout(() => finish(), 60) : null
    return () => { cancelAnimationFrame(r); if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, targetFranchise, targetSeason])

  const finish = () => {
    if (settled.current) return
    settled.current = true
    onSettle()
  }

  // the reel we listen to for "landed": prefer the team reel when it animates
  const primary = animateTeam ? 'team' : 'year'

  const targetFr = franchises.find((f) => f.id === targetFranchise) || { id: targetFranchise, color: '#2a2a36' }

  return (
    <div className="tyreel">
      <Reel
        kind="team"
        strip={teamStrip}
        animate={animateTeam}
        go={go}
        target={targetFr}
        renderItem={(f) => (
          <div className="tyreel__item team" style={{ '--team': f.color, color: readableText(f.color) }}>
            {teamLogoUrl(f.id) && (
              <span className="tyreel__logo-chip">
                <img className="tyreel__logo" src={teamLogoUrl(f.id)} alt="" crossOrigin="anonymous" decoding="async" />
              </span>
            )}
            <span className="tyreel__name">{f.name || f.id}</span>
          </div>
        )}
        onEnd={primary === 'team' ? finish : undefined}
      />
      <Reel
        kind="year"
        strip={yearStrip}
        animate={animateYear}
        go={go}
        target={{ id: targetSeason }}
        renderItem={(x) => <div className="tyreel__item year">{seasonLabel(x.id)}</div>}
        onEnd={primary === 'year' ? finish : undefined}
      />
    </div>
  )
}

// Era reel ticks through the pool's time-axis tokens IN ORDER (an odometer), landing on
// the target (always a real pool token). Tokens are opaque — int seasons or decade
// labels — so the strip cycles the ordered token list rather than doing year math.
function buildOrderedStrip(seasons, target, animate) {
  if (!animate) return [{ id: target }]
  const span = seasons.length
  const ti = Math.max(seasons.indexOf(target), 0)
  const count = Math.max(28, span)
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({ id: seasons[(((ti - (count - 1) + i) % span) + span) % span] })
  }
  return out
}

function buildStrip(items, isTarget, animate) {
  const target = items.find(isTarget) || items[0]
  if (!animate) return [target] // static reel: just the landed value
  const multi = items.length > 1
  const pickDifferent = (prev) => {
    let p = items[Math.floor(Math.random() * items.length)]
    while (multi && p === prev) p = items[Math.floor(Math.random() * items.length)]
    return p
  }
  // build filler with NO two adjacent the same, and never the target right before it lands
  const filler = []
  let prev = null
  for (let i = 0; i < 26; i++) {
    prev = pickDifferent(prev)
    filler.push(prev)
  }
  if (multi && filler[filler.length - 1] === target) filler[filler.length - 1] = pickDifferent(target)
  return [...filler, target]
}

function Reel({ kind, strip, animate, go, target, renderItem, onEnd }) {
  if (!animate) {
    return (
      <div className={'tyreel-col ' + kind} style={{ height: ITEM_H }}>
        <div className="tyreel-strip static">{renderItem(target)}</div>
      </div>
    )
  }
  const finalY = -(strip.length - 1) * ITEM_H
  return (
    <div className={'tyreel-col ' + kind} style={{ height: ITEM_H }}>
      <div
        className={'tyreel-strip ' + kind}
        style={{ transform: `translateY(${go ? finalY : 0}px)` }}
        onTransitionEnd={onEnd}
      >
        {strip.map((it, i) => (
          <div key={i} style={{ height: ITEM_H }}>{renderItem(it)}</div>
        ))}
      </div>
    </div>
  )
}
