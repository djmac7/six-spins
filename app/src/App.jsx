import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadGameData } from './data/loader.js'
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
function dailySession(date) {
  return { mode: 'daily', date, seed: seedForDate(date), dayNumber: dayNumber(date), label: `Daily #${dayNumber(date)}` }
}
function unlimitedSession() {
  return { mode: 'unlimited', date: null, seed: randomSeed(), dayNumber: null, label: 'Unlimited' }
}
function challengeSession(seed) {
  return { mode: 'challenge', date: null, seed, dayNumber: null, label: 'Challenge' }
}
// A daily date already completed opens straight to its saved result (you can't re-roll a daily).
function openDate(date) {
  return { view: getDaily(date) ? 'revisit' : 'play', session: dailySession(date) }
}
function initialNav() {
  if (typeof location !== 'undefined') {
    const p = new URLSearchParams(location.search)
    const seed = p.get('seed')
    if (seed) return { view: 'play', session: challengeSession(seed) }
    if (DAILY_ENABLED) {
      const d = p.get('d')
      if (d && isDateStr(d)) return openDate(d)
    }
  }
  return DAILY_ENABLED ? openDate(todayStr()) : { view: 'play', session: unlimitedSession() }
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

function Shell({ game }) {
  const [nav, setNav] = useState(initialNav)
  const [howOpen, setHowOpen] = useState(firstVisit)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, updateSettings] = useSettings()

  const goto = useMemo(
    () => ({
      daily: () => setNav(openDate(todayStr())),
      unlimited: () => setNav({ view: 'play', session: unlimitedSession() }),
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
        dailyEnabled={DAILY_ENABLED}
        onDaily={goto.daily}
        onUnlimited={goto.unlimited}
        onArchive={goto.archive}
        onBrowse={PLAYERS_ENABLED ? goto.browse : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {nav.view === 'archive' && <ArchiveScreen game={game} onPlayDate={goto.playDate} onClose={goto.daily} />}

      {PLAYERS_ENABLED && nav.view === 'browse' && <BrowseScreen game={game} onClose={goHome} />}

      {nav.view === 'play' && <Game key={nav.session.seed} game={game} session={nav.session} nav={goto} hideStats={settings.hideStats} />}

      {nav.view === 'revisit' && <Revisit game={game} session={nav.session} nav={goto} />}

      {howOpen && <HowToPlay onClose={() => { markHowToSeen(); setHowOpen(false) }} />}

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

  if (state.phase === 'reveal') {
    return (
      <RevealScreen
        game={game}
        state={state}
        mode={session.mode}
        session={session}
        onPlayAgain={nav.unlimited}
      />
    )
  }
  if (state.phase === 'result') {
    return (
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
    )
  }
  return (
    <GameScreen
      game={game}
      state={state}
      actions={actions}
      canRerollTeam={canRerollTeam}
      canRerollYear={canRerollYear}
      currentRoster={currentRoster}
      hideStats={hideStats}
    />
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
