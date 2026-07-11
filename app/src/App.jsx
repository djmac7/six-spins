import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadGameData, filterGameByEra } from './data/loader.js'
import { ERAS, DEFAULT_ERA } from './constants.js'
import { useGame } from './game/useGame.js'
import { makeDealer, randomSeed } from './game/rng.js'
import { seedForDate, dayNumber, todayStr, isDateStr } from './game/daily.js'
import { saveDaily, getDaily, getStats } from './game/storage.js'
import { ratingSquares } from './ui/share.js'
import { computeOvr } from './ui/helpers.js'
import { DAILY_ENABLED, PLAYERS_ENABLED } from './config.js'
import ModeBar from './ui/ModeBar.jsx'
import HowToPlay from './ui/HowToPlay.jsx'
import SettingsModal from './ui/SettingsModal.jsx'
import { useSettings } from './game/settings.js'
import GameScreen from './screens/GameScreen.jsx'
import RevealScreen from './screens/RevealScreen.jsx'
import ResultScreen from './screens/ResultScreen.jsx'
import ArchiveScreen from './screens/ArchiveScreen.jsx'
import BrowseScreen from './screens/BrowseScreen.jsx'

// ---- session builders: a session fully describes one playable board ----
// The era is PART OF THE SEED (a '-m' suffix for Modern Era, Classic untagged): the pool
// filter changes which cells exist, so a board is only reproducible seed+era together.
// Challenge links therefore force the creator's era on whoever opens them.
const MODERN_TAG = '-m'
function seedWithEra(era) {
  return randomSeed() + (era === 'modern' ? MODERN_TAG : '')
}
export function seedEra(seed) {
  return String(seed).endsWith(MODERN_TAG) ? 'modern' : 'all'
}
function dailySession(date) {
  return { mode: 'daily', date, seed: seedForDate(date), dayNumber: dayNumber(date), label: `Daily #${dayNumber(date)}` }
}
function unlimitedSession(era) {
  return { mode: 'unlimited', date: null, seed: seedWithEra(era), dayNumber: null, label: 'Unlimited' }
}
// A 1v1 match: same seed = same six spins for both players; `goal` is the rival's OVR to
// beat and `rivalRun` their packed six picks (both present when you arrive via a shared
// link, absent for the match creator). rivalRun stays encoded here — decoding needs the
// loaded game data, so the result screens unpack it (see ui/share.js decodeRun).
function challengeSession(seed, goal = null, rivalRun = null) {
  return { mode: 'challenge', date: null, seed, dayNumber: null, goal, rivalRun, label: 'Challenge' }
}
// A daily date already completed opens straight to its saved result (you can't re-roll a daily).
function openDate(date) {
  return { view: getDaily(date) ? 'revisit' : 'play', session: dailySession(date) }
}
function initialNav() {
  if (typeof location !== 'undefined') {
    const p = new URLSearchParams(location.search)
    const seed = p.get('seed')
    if (seed) {
      const goal = parseInt(p.get('goal'), 10)
      return { view: 'play', session: challengeSession(seed, Number.isFinite(goal) ? goal : null, p.get('run')) }
    }
    if (DAILY_ENABLED) {
      const d = p.get('d')
      if (d && isDateStr(d)) return openDate(d)
    }
  }
  return DAILY_ENABLED ? openDate(todayStr()) : { view: 'play', session: unlimitedSession(savedEra()) }
}

export default function App() {
  const [game, setGame] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadGameData().then(setGame).catch((e) => setError(e))
  }, [])

  if (error) {
    return (
      <div className="boot boot--error">
        <div className="boot__title">Couldn’t load game data</div>
        <pre className="boot__msg">{String(error.message || error)}</pre>
      </div>
    )
  }
  if (!game) {
    return (
      <div className="boot">
        <div className="boot__mark">
          <span className="boot__build">SIX</span>
          <span className="boot__goat">SPINS</span>
        </div>
        <div className="boot__spinner" />
        <div className="boot__title">Loading players…</div>
      </div>
    )
  }
  return <Shell game={game} />
}

// First-visit how-to, gated on sessionStorage so it shows once per tab session (not on Play Again).
const HOWTO_KEY = 'sixspins.howto'
function firstVisit() {
  try { return !sessionStorage.getItem(HOWTO_KEY) } catch { return false }
}
function markHowToSeen() {
  try { sessionStorage.setItem(HOWTO_KEY, '1') } catch { /* private mode — fine */ }
}

// Era selection persists across visits (localStorage). Falls back to All-Time.
const ERA_KEY = 'sixspins.era'
function savedEra() {
  try {
    const id = localStorage.getItem(ERA_KEY)
    return ERAS.some((e) => e.id === id) ? id : DEFAULT_ERA
  } catch { return DEFAULT_ERA }
}

function Shell({ game }) {
  const [nav, setNav] = useState(initialNav)
  // A challenge (seed) link ALWAYS opens the intro — framed as "you've been challenged" when
  // it carries a goal — even for returning players; nothing about the run is saved, so
  // re-opening the same link replays the whole flow.
  const challengedAtLoad = nav.session.mode === 'challenge' && nav.session.goal != null
  const [howOpen, setHowOpen] = useState(() => firstVisit() || challengedAtLoad)
  const [era, setEra] = useState(savedEra)
  // A challenge board must be played on the era its seed was created in (the '-m' tag) —
  // the local era preference only drives games YOU start.
  const activeEra = nav.session.mode === 'challenge' ? seedEra(nav.session.seed) : era
  const pickEra = (id) => {
    setEra(id)
    try { localStorage.setItem(ERA_KEY, id) } catch { /* private mode — fine */ }
    // Changing era can't apply to someone else's challenge board — bail to a fresh game.
    if (nav.session.mode === 'challenge') setNav({ view: 'play', session: unlimitedSession(id) })
  }
  // The playable pool for the active era; the full game object stays loaded so
  // switching eras is instant and lossless.
  const eraGame = useMemo(
    () => filterGameByEra(game, ERAS.find((e) => e.id === activeEra)?.seasons),
    [game, activeEra]
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, updateSettings] = useSettings()

  const goto = useMemo(
    () => ({
      daily: () => setNav(openDate(todayStr())),
      unlimited: () => setNav({ view: 'play', session: unlimitedSession(savedEra()) }),
      archive: () => setNav((n) => ({ view: 'archive', session: n.session })),
      browse: () => setNav((n) => ({ view: 'browse', session: n.session })),
      playDate: (date) => setNav(openDate(date)),
    }),
    []
  )
  // Leaving a full-screen detour (Archive/Browse) returns to the home board.
  const goHome = DAILY_ENABLED ? goto.daily : goto.unlimited

  return (
    <div className="app-frame">
      <ModeBar
        session={nav.session}
        era={activeEra}
        onEra={pickEra}
        dailyEnabled={DAILY_ENABLED}
        onDaily={goto.daily}
        onUnlimited={goto.unlimited}
        onArchive={goto.archive}
        onBrowse={PLAYERS_ENABLED ? goto.browse : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {nav.view === 'archive' && <ArchiveScreen game={eraGame} onPlayDate={goto.playDate} onClose={goto.daily} />}

      {PLAYERS_ENABLED && nav.view === 'browse' && <BrowseScreen game={eraGame} onClose={goHome} />}

      {nav.view === 'play' && (
        <Game key={activeEra + ':' + nav.session.seed} game={eraGame} session={nav.session} nav={goto} hideStats={settings.hideStats} />
      )}

      {nav.view === 'revisit' && <Revisit game={eraGame} session={nav.session} nav={goto} />}

      {howOpen && (
        <HowToPlay
          challengeGoal={challengedAtLoad ? nav.session.goal : null}
          onClose={() => { markHowToSeen(); setHowOpen(false) }}
        />
      )}

      {settingsOpen && <SettingsModal settings={settings} update={updateSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

// One live game: owns the seeded dealer, auto-starts, and persists a completed DAILY (once).
function Game({ game, session, nav, hideStats }) {
  const dealer = useMemo(() => makeDealer(session.seed), [session.seed])
  const { state, actions, canRerollTeam, canRerollYear, currentRoster } = useGame(game, dealer)

  // No title screen — drop straight into the board.
  const started = useRef(false)
  useLayoutEffect(() => {
    if (!started.current && state.phase === 'start') {
      started.current = true
      actions.newGame()
    }
  }, [state.phase, actions])

  // Persist a completed daily exactly once (the score locks at the reveal) and surface streak stats.
  const saved = useRef(false)
  const [stats, setStats] = useState(null)
  useEffect(() => {
    if (saved.current || !state.result) return
    if (state.phase !== 'reveal' && state.phase !== 'result') return
    saved.current = true
    if (session.mode !== 'daily') return
    setStats(
      saveDaily(session.date, {
        total: state.result.total,
        ceiling: state.result.ceiling,
        ovr: computeOvr(state.result.total),
        squares: ratingSquares(state.slots),
        slots: state.slots.map((s) => ({
          ability: s.ability, playerId: s.playerId, rating: s.rating, franchise: s.franchise, season: s.season,
        })),
        ts: Date.now(),
      })
    )
  }, [state.phase, state.result, session, game])

  // Pinned above every phase of a challenge run — the board AND the results.
  const vsStrip = session.mode === 'challenge' && session.goal != null && (
    <div className="vs-goal">⚔️ You’ve been challenged: beat {session.goal} OVR</div>
  )

  if (state.phase === 'reveal') {
    return (
      <>
        {vsStrip}
        <RevealScreen
          game={game}
          state={state}
          mode={session.mode}
          session={session}
          onPlayAgain={nav.unlimited}
        />
      </>
    )
  }
  if (state.phase === 'result') {
    return (
      <>
        {vsStrip}
        <ResultScreen
          game={game}
          state={state}
          mode={session.mode}
          session={session}
          stats={stats}
          onPlayAgain={nav.unlimited}
          onPlayUnlimited={nav.unlimited}
          onPlayDaily={DAILY_ENABLED ? nav.daily : undefined}
          onOpenArchive={nav.archive}
        />
      </>
    )
  }
  return (
    <>
      {vsStrip}
      <GameScreen
        game={game}
        state={state}
        actions={actions}
        canRerollTeam={canRerollTeam}
        canRerollYear={canRerollYear}
        currentRoster={currentRoster}
        hideStats={hideStats}
      />
    </>
  )
}

// Revisit a daily you've already completed: render its saved result, no replay.
function Revisit({ game, session, nav }) {
  const saved = getDaily(session.date)
  if (!saved) return <Game key={session.seed} game={game} session={session} nav={nav} />
  const state = { slots: saved.slots, result: { total: saved.total, ceiling: saved.ceiling } }
  return (
    <ResultScreen
      game={game}
      state={state}
      mode="daily"
      session={session}
      stats={getStats()}
      revisit
      onPlayAgain={nav.unlimited}
      onPlayUnlimited={nav.unlimited}
      onPlayDaily={nav.daily}
      onOpenArchive={nav.archive}
    />
  )
}
