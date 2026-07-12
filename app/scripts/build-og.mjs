// Builds the OG share image (public/og.png) — light-mode, Hardwood/Claude design system,
// clean editorial layout with REAL player headshots inlined as base64.
// Render step (run separately): headless Chrome @2x -> downscale to 1200x630.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(here, '..', 'public')

const img = (rel) => {
  const buf = fs.readFileSync(path.join(pub, rel))
  return `data:image/webp;base64,${buf.toString('base64')}`
}

// Featured build — a spread across the four rating-tier colors (gold/green/slate/plum)
// so the card showcases the palette. Real players, real team colors, real headshots.
const ROWS = [
  { slug: 'curryst01', ability: 'Shooting',   name: 'Stephen Curry',  team: 'Warriors', color: '#1D428A', rating: 99, tier: 'goat'  },
  { slug: 'jordami01', ability: 'Scoring',    name: 'Michael Jordan', team: 'Bulls',    color: '#CE1141', rating: 96, tier: 'elite' },
  { slug: 'johnsma02', ability: 'Playmaking', name: 'Magic Johnson',  team: 'Lakers',   color: '#552583', rating: 88, tier: 'great' },
  { slug: 'birdla01',  ability: 'Rebounding', name: 'Larry Bird',     team: 'Celtics',  color: '#007A33', rating: 80, tier: 'good'  },
]

const rowHtml = ROWS.map((r, i) => `
      <div class="row${i === ROWS.length - 1 ? ' row--last' : ''}">
        <img class="ava" src="${img(`img/players/${r.slug}.webp`)}" alt="" />
        <span class="who">
          <span class="ab">${r.ability}</span>
          <span class="nm">${r.name}</span>
          <span class="tm"><span class="dot" style="background:${r.color}"></span>${r.team}</span>
        </span>
        <span class="rt t-${r.tier}">${r.rating}</span>
      </div>`).join('')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
  :root{
    --bg:#FAF9F5; --panel:#FFFFFF; --panel-2:#F6F4EC;
    --line:#E7E3D7; --line-soft:#EFEBDF;
    --ink:#1A1915; --ink-2:#5A564C; --ink-3:#8D8877; --ink-4:#B4AF9F;
    --accent:#D97757; --accent-deep:#BF5D3B; --accent-wash:#FBEEE7;
    --slate:#4E6E7E; --gold:#B98A32; --plum:#8A5A6B; --good:#5C7A52;
    --t-goat:var(--gold); --t-elite:var(--good); --t-great:var(--slate); --t-good:var(--plum);
    --serif:"Fraunces",Georgia,serif;
    --sans:"Schibsted Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,monospace;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1200px;height:630px;}
  body{
    font-family:var(--sans); color:var(--ink);
    background:radial-gradient(1200px 900px at 118% -30%, var(--accent-wash) 0%, rgba(251,238,231,0) 52%), var(--bg);
    display:flex; align-items:center; gap:72px;
    padding:0 76px; overflow:hidden; -webkit-font-smoothing:antialiased;
  }

  /* ---------- left: the pitch ---------- */
  .pitch{ width:540px; flex:0 0 540px; }
  .eyebrow{
    display:inline-flex; align-items:center; gap:11px;
    font-family:var(--sans); font-weight:700; font-size:17px; letter-spacing:0.22em;
    color:var(--ink-3); text-transform:uppercase; margin-bottom:26px;
  }
  .eyebrow .emblem{ font-size:26px; letter-spacing:0; }
  .wordmark{
    font-family:var(--sans); font-weight:800; font-size:120px; line-height:0.86;
    letter-spacing:-0.045em; color:var(--ink); margin-bottom:30px;
  }
  .wordmark b{ color:var(--accent); font-weight:800; }
  .tagline{
    font-family:var(--sans); font-weight:700; font-size:40px; line-height:1.12;
    letter-spacing:-0.025em; color:var(--ink); margin-bottom:16px;
  }
  .tagline .goat{ color:var(--accent-deep); font-weight:800; }
  .sub{ font-size:22px; font-weight:500; color:var(--ink-2); letter-spacing:-0.01em; margin-bottom:38px; line-height:1.4; max-width:470px; text-wrap:balance; }

  .chips{ display:flex; gap:26px; padding-left:2px; }
  .chip{ display:flex; flex-direction:column; gap:5px; }
  .chip .n{ font-family:var(--sans); font-weight:800; font-size:34px; line-height:1; letter-spacing:-0.03em; }
  .chip .l{ font-family:var(--sans); font-weight:600; font-size:12px; letter-spacing:0.10em; color:var(--ink-3); text-transform:uppercase; }

  /* ---------- right: the result card (clean/editorial) ---------- */
  .card{
    width:436px; flex:0 0 436px;
    background:var(--panel); border:1px solid var(--line);
    border-radius:28px; padding:30px 30px 20px;
    box-shadow:0 1px 3px rgba(26,25,19,.04), 0 24px 60px rgba(26,25,19,.13);
  }
  .card__brand{ display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
  .card__logo{ font-weight:800; letter-spacing:0.05em; font-size:17px; color:var(--ink); }
  .card__logo b{ color:var(--accent); }
  .card__daily{ font-family:var(--sans); font-weight:600; font-size:13px; letter-spacing:0.03em; color:var(--ink-4); }

  .card__head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:22px; }
  .card__score{ display:flex; align-items:baseline; gap:9px; }
  .card__ovr{ font-family:var(--sans); font-weight:900; font-size:88px; line-height:0.78; letter-spacing:-0.045em; color:var(--t-goat); }
  .card__ceil{ font-size:24px; font-weight:800; color:var(--ink-3); letter-spacing:0.03em; }
  .card__badge{
    padding:8px 20px; border-radius:999px; font-size:22px; font-weight:800; letter-spacing:0.02em;
    color:var(--gold); background:#F6EBD5;
  }

  .rows{ display:flex; flex-direction:column; }
  .row{ display:flex; align-items:center; gap:16px; padding:15px 2px; border-bottom:1px solid var(--line-soft); }
  .row--last{ border-bottom:0; padding-bottom:6px; }
  .ava{
    width:58px; height:58px; flex:0 0 auto; border-radius:50%; object-fit:cover; object-position:center top;
    background:var(--panel-2); box-shadow:0 0 0 1px var(--line) inset;
  }
  .who{ flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
  .who .ab{ font-family:var(--sans); font-weight:600; font-size:11.5px; letter-spacing:0.09em; color:var(--ink-3); text-transform:uppercase; }
  .who .nm{ font-weight:800; font-size:21px; letter-spacing:-0.02em; color:var(--ink); line-height:1; }
  .who .tm{ display:flex; align-items:center; gap:7px; font-size:14px; font-weight:600; color:var(--ink-2); letter-spacing:-0.01em; }
  .who .dot{ width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
  .rt{ font-family:var(--sans); font-weight:900; font-size:36px; line-height:1; letter-spacing:-0.03em; min-width:52px; text-align:right; }

  .t-goat{ color:var(--t-goat); } .t-elite{ color:var(--t-elite); }
  .t-great{ color:var(--t-great); } .t-good{ color:var(--t-good); }
</style>
</head>
<body>
  <div class="pitch">
    <div class="eyebrow"><span class="emblem">6️⃣🔄</span> Daily NBA Puzzle</div>
    <div class="wordmark">SIX <b>SPINS</b></div>
    <div class="tagline">Build the <span class="goat">GOAT</span> in six&nbsp;spins.</div>
    <div class="sub">Steal one elite rating each spin. About a minute a day.</div>
    <div class="chips">
      <div class="chip"><span class="n t-goat">99</span><span class="l">Shoot</span></div>
      <div class="chip"><span class="n t-elite">96</span><span class="l">Score</span></div>
      <div class="chip"><span class="n t-great">88</span><span class="l">Pass</span></div>
      <div class="chip"><span class="n t-good">80</span><span class="l">Reb</span></div>
    </div>
  </div>

  <div class="card">
    <div class="card__brand">
      <span class="card__logo">SIX <b>SPINS</b></span>
      <span class="card__daily">DAILY #128</span>
    </div>
    <div class="card__head">
      <div class="card__score"><span class="card__ovr">99</span><span class="card__ceil">OVR</span></div>
      <span class="card__badge">GOAT</span>
    </div>
    <div class="rows">${rowHtml}
    </div>
  </div>
</body>
</html>
`

fs.writeFileSync(path.join(here, 'og-template.html'), html)
console.log('wrote og-template.html')
