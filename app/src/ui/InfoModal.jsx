import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'

// Long-form info pages (methodology + legal), opened from Settings. `doc` selects which.
const UPDATED = 'Last updated: July 2026'

const DOCS = {
  methodology: {
    title: 'Attributes Methodology',
    body: (
      <>
        <p>
          Every player in Six Spins is rated on six attributes, <b>Shooting, Scoring,
          Playmaking, Defense, Rebounding,</b> and <b>Clutch</b>, on a 55-99 scale. The
          ratings are <b>computed by a fixed formula, not hand-picked opinions</b>: the same
          math is applied to every player-season in NBA history.
        </p>
        <h3>Where the numbers come from</h3>
        <p>
          We start from publicly available <b>box-score and advanced stats</b> (points,
          rebounds, assists, steals, blocks, shooting splits, usage, box plus/minus, shot
          locations where available). We blend in
          <b> recorded league recognition</b>: MVP, All-NBA, All-Defensive, Defensive Player
          of the Year, All-Star, and Finals MVP voting, because some skills (point-of-attack
          defense, clutch shot-making) barely show up in a box score.
        </p>
        <h3>How each attribute is built</h3>
        <ul>
          <li>Each attribute is a <b>weighted blend</b> of the stats most relevant to it.</li>
          <li>Rates are <b>era-adjusted</b> and <b>shrunk toward the league average</b> when the sample is small, so a hot 200-minute stretch doesn't outrank a full season.</li>
          <li><b>Defense</b> merges perimeter and interior impact and leans on All-Defensive/DPOY recognition for what the box score misses.</li>
          <li><b>Clutch</b> is built from playoff production (scoring, depth of runs, how efficiency holds up in the postseason) plus Finals-MVP and Clutch-Player recognition.</li>
          <li>Your card shows a player's <b>peak</b> for that team and decade, ranked against the whole modern NBA (1960s to present).</li>
        </ul>
        <h3>The honest disclaimer</h3>
        <p>
          <b>Box-score stats are not perfect, and neither are these ratings.</b> Traditional
          stats miss off-ball defense, screen-setting, spacing, gravity, leadership, and plenty
          of other things that win games. Eras differ enormously: pace, rules, and the fact
          that steals and blocks weren't tracked before 1974, and shot-location data doesn't
          exist before 1997. Accolade voting carries its own era and media biases.
        </p>
        <p>
          So treat these as a <b>fun, data-driven approximation</b>: a starting point for the
          argument, not the final word. If a rating looks wrong to you, you're probably having
          exactly the debate the game is meant to start. 🐐
        </p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <p>{UPDATED}</p>
        <p>
          Six Spins is designed to respect your privacy. <b>We do not require an account and
          we do not ask for your name, email, or any personal information to play.</b>
        </p>
        <h3>What we store</h3>
        <ul>
          <li><b>On your device only:</b> your settings, your daily-puzzle results, and your streak are saved in your browser's local storage. This never leaves your device and we cannot see it. Clearing your browser data erases it.</li>
          <li><b>Basic, anonymous analytics</b> may be used to understand aggregate traffic (e.g., how many people played). This does not identify you.</li>
        </ul>
        <h3>Advertising</h3>
        <p>
          The site may display ads served by third-party advertising partners. These partners
          may use cookies or similar technologies to measure and serve ads. We do not share any
          personal information with them, because we don't collect any. You can control cookies
          through your browser settings.
        </p>
        <h3>Children</h3>
        <p>
          The game is suitable for general audiences and does not knowingly collect personal
          information from children.
        </p>
        <h3>Changes</h3>
        <p>
          We may update this policy; material changes will be reflected here with a new date.
          Questions can be directed to the contact listed on the site.
        </p>
      </>
    ),
  },
  terms: {
    title: 'Terms of Service',
    body: (
      <>
        <p>{UPDATED}</p>
        <p>
          By playing Six Spins you agree to these terms. The game is provided <b>free of charge
          and "as is,"</b> for personal, non-commercial entertainment.
        </p>
        <h3>No affiliation</h3>
        <p>
          Six Spins is an independent fan project. It is <b>not affiliated with, endorsed by, or
          sponsored by the NBA</b>, any team, or any player. All team names, logos, and player
          names are the property of their respective owners and are used here for
          identification and commentary in a non-commercial fan context.
        </p>
        <h3>Ratings &amp; content</h3>
        <p>
          Player attributes are algorithmic estimates derived from public statistics (see
          Attributes Methodology) and are provided for entertainment only. They are opinions
          expressed through a formula, not statements of fact about any player.
        </p>
        <h3>No warranty</h3>
        <p>
          The game is provided without warranties of any kind. We do not guarantee it will be
          uninterrupted, error-free, or that ratings are accurate or complete. To the fullest
          extent permitted by law, we are not liable for any damages arising from your use of
          the game.
        </p>
        <h3>Acceptable use</h3>
        <p>
          Don't attempt to disrupt, scrape at scale, reverse-engineer for redistribution, or
          misuse the service. We may update or discontinue the game at any time.
        </p>
      </>
    ),
  },
}

export default function InfoModal({ doc, onBack, onClose }) {
  const d = DOCS[doc]
  if (!d) return null
  return createPortal(
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings info-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={d.title}>
        <div className="settings__head">
          <button className="info-back" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>
          <h2 className="settings__title">{d.title}</h2>
          <span style={{ width: 18 }} aria-hidden="true" />
        </div>
        <div className="info-doc">{d.body}</div>
        <button className="btn-primary" onClick={onBack}>Back</button>
      </div>
    </div>,
    document.body
  )
}
