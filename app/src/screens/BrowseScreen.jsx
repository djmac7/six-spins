import { useDeferredValue, useMemo, useState } from 'react'
import { ABILITIES, STAT_LINE } from '../constants.js'
import { buildFilterContext, indexPlayers, parseFilters } from '../game/filterQuery.js'
import Avatar from '../ui/Avatar.jsx'
import AbilityIcon from '../ui/AbilityIcon.jsx'
import { playerPhotoUrl } from '../ui/assets.js'
import { ratingTier } from '../ui/helpers.js'

const fmt1 = (v) => (v == null ? '-' : Number(v).toFixed(1))
const lastName = (n) => ((n || '').trim().split(/\s+/).pop() || '')
const CAP = 300 // rows rendered at once — the whole 13k-row DOM would jank scrolling on mobile

const SORTS = [...STAT_LINE.map((s) => ({ key: s.key, label: s.label })), { key: 'az', label: 'A–Z' }]
const EXAMPLES = ['elite rebounders from the 90s', 'shooters who score 25+', 'Lakers with 8+ apg']

// Browse the full player pool, filtered by a plain-language query. The query is parsed by a
// deterministic rule-based parser (no LLM, no backend) — see game/filterQuery.js.
export default function BrowseScreen({ game, onClose }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('ppg')

  // Defer filtering so each keystroke paints immediately; the 13k-row filter + 300-card
  // re-render happens in a lower-priority render.
  const deferredQuery = useDeferredValue(query)
  const index = useMemo(() => indexPlayers(game), [game])
  const ctx = useMemo(() => buildFilterContext(game), [game])
  const { filters, chips } = useMemo(() => parseFilters(deferredQuery, ctx), [deferredQuery, ctx])

  const results = useMemo(() => {
    const hits = filters.length ? index.filter((p) => filters.every((f) => f.test(p))) : index
    return [...hits].sort((a, b) =>
      sort === 'az'
        ? lastName(a.name).localeCompare(lastName(b.name)) || (a.name || '').localeCompare(b.name || '')
        : (b.stats?.[sort] ?? 0) - (a.stats?.[sort] ?? 0)
    )
  }, [index, filters, sort])

  const shown = results.slice(0, CAP)

  return (
    <div className="screen browse-screen">
      <div className="archive-head">
        <button className="archive-back" onClick={onClose} aria-label="Back">←</button>
        <div className="archive-head__title">
          <div className="archive-head__h1">Player Browser</div>
          <div className="archive-head__sub">{index.length.toLocaleString()} player-seasons · describe who you want</div>
        </div>
      </div>

      <div className="browse-search">
        <input
          className="browse-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. elite shot blockers on the 90s Bulls"
          aria-label="Describe the players to filter"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button className="browse-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
        )}
      </div>

      {!query && (
        <div className="browse-examples">
          <span className="browse-examples__label">Try</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip chip--example" onClick={() => setQuery(ex)}>{ex}</button>
          ))}
        </div>
      )}

      {query && (
        <div className="browse-understood">
          {chips.length ? (
            <>
              <span className="browse-understood__label">Filters</span>
              {chips.map((c) => <span key={c} className="chip">{c}</span>)}
            </>
          ) : (
            <span className="browse-understood__none">Couldn’t read that into a filter — showing everyone. Try an attribute, a stat like “20+ ppg”, a decade, or a team.</span>
          )}
        </div>
      )}

      <div className="browse-meta">
        <span className="browse-count">
          <b>{results.length.toLocaleString()}</b> {results.length === 1 ? 'result' : 'results'}
          {results.length > CAP && <span className="browse-count__cap"> · showing top {CAP}</span>}
        </span>
        <div className="roster__sort-opts browse-sort">
          {SORTS.map((s) => (
            <button key={s.key} className={'sort-btn' + (sort === s.key ? ' active' : '')} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="roster__list browse-list">
        {shown.length === 0 && <div className="browse-empty">No players match all of those filters.</div>}
        {shown.map((p) => (
          <div key={p.id} className="pcard pcard--browse">
            <Avatar name={p.name} src={playerPhotoUrl(p)} color="#c9ccd2" size={44} />
            <div className="pcard__id">
              <div className="pcard__name">{p.name}</div>
              <div className="pcard__meta">{p.team_label}</div>
            </div>
            <div className="pcard__stats">
              {STAT_LINE.map((s) => (
                <div key={s.key} className="stat">
                  <span className="stat__v">{fmt1(p.stats?.[s.key])}</span>
                  <span className="stat__k">{s.label}</span>
                </div>
              ))}
            </div>
            <div className="pcard__rates">
              {ABILITIES.map((a) => {
                const v = p.ratings?.[a.key] ?? 0
                return (
                  <div key={a.key} className={'rate rate--' + ratingTier(v)} title={a.label}>
                    <AbilityIcon ability={a.key} size={12} className="rate__icon" />
                    <span className="rate__v">{v}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
