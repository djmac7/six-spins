import { forwardRef } from 'react'
import { ABILITIES } from '../constants.js'
import Avatar from './Avatar.jsx'
import TeamLogo from './TeamLogo.jsx'
import PlayerComp from './PlayerComp.jsx'
import AbilityIcon from './AbilityIcon.jsx'
import { playerPhotoUrl } from './assets.js'
import { ratingTier, percentileTier, TIER_BLURB, teamDisplay } from './helpers.js'
import { ordinalSuffix } from './ordinal.js'
import { shareDisplayUrl } from './share.js'

// The shareable result card (App spec §6) — pure presentation behind a forwardRef so it can
// be rasterized (toPng/toBlob) from wherever it's mounted, visibly OR off-screen. That's
// what lets sharing happen inline on the reveal screen without a separate share page.
const ResultCard = forwardRef(function ResultCard({ game, state, percentile, comp, tag = '82-0 inspired' }, ref) {
  const total = state.result.total
  const ceiling = state.result.ceiling
  const tier = percentileTier(percentile)
  const playUrl = shareDisplayUrl()

  return (
    <div className={'result-card tier-edge tc-' + tier} ref={ref}>
      <div className="result-card__brand">
        <span className="result-card__logo">SIX <b>SPINS</b></span>
        <span className="result-card__tag">{tag}</span>
      </div>

      <div className="result-card__headline">
        <div className="result-card__pct">
          {percentile}<span className="result-card__ord">{ordinalSuffix(percentile)}</span>
          <span className="result-card__pctword">pctl</span>
        </div>
        <div className="result-card__score">
          <span className="result-card__total">{total}</span>
          <span className="result-card__ceil">/ {ceiling}</span>
        </div>
      </div>
      <div className="result-card__blurb">{TIER_BLURB[tier]}</div>

      <div className="result-card__rows">
        {state.slots.map((slot, i) => {
          const meta = ABILITIES[i]
          const player = game.playersById.get(slot.playerId)
          const team = teamDisplay(game, slot.franchise, slot.season)
          const color = team?.color || '#2a2a36'
          return (
            <div className="rrow" key={slot.ability} style={{ '--team': color }}>
              <Avatar name={player?.name} src={playerPhotoUrl(player)} color={color} size={40} rounded={9} />
              <span className="rrow__player">
                <span className="rrow__ability">{meta.label}</span>
                <span className="rrow__name">{player?.name || '-'}</span>
                <span className="rrow__teamline">
                  <TeamLogo franchise={team?.logoId} color={color} size={15} badge={false} />
                  <span className="rrow__team">{team?.label || ''}</span>
                </span>
              </span>
              <AbilityIcon ability={slot.ability} size={18} className="rrow__abicon" />
              <span className={'rrow__rating tier-' + ratingTier(slot.rating)}>{slot.rating}</span>
            </div>
          )
        })}
      </div>

      <PlayerComp comp={comp} />

      <div className="result-card__foot">{playUrl ? `play ▸ ${playUrl}` : 'six-spins · all-time NBA'}</div>
    </div>
  )
})

export default ResultCard
