// Feature flags.
//
// Daily mode — the seeded one-a-day puzzle + Archive + streaks — is built and tested but
// PARKED for launch. We're shipping the 82-0-style Unlimited experience first (a daily
// leaderboard only sings once there's a crowd playing the same board day one).
//
// Flip this to `true` to re-enable Daily + Archive everywhere: default landing, the ModeBar
// menu, ?d=<date> deep links, the streak banner, and saved/revisited results. No other
// change needed — every daily code path is gated on this flag.
export const DAILY_ENABLED = false

// Player Browser — plain-language filtering over the full pool — is built and tested but
// HIDDEN for now. Flip to `true` to surface it: the ModeBar "Players" button + menu item and
// the browse view are all gated on this flag (see App.jsx). No other change needed.
export const PLAYERS_ENABLED = false
