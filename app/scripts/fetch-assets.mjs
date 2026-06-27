// Download the team logos + player headshots ONCE and self-host them under public/img,
// so the app never depends on third-party CDNs at runtime. Re-runnable (skips files that
// already exist). Anything that 404s is simply left out — the app falls back to initials.
//
//   node scripts/fetch-assets.mjs
//
// Sources: ESPN team-logo CDN (by franchise) and Basketball-Reference headshots (by slug).
// These are trademarked logos / licensed photos used here for a non-commercial fan project;
// swap in properly licensed assets before any commercial use.
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

// We re-encode every downloaded logo/headshot to WebP (~70% smaller than the source
// JPG/PNG) so the app loads fast. Requires the `cwebp` CLI (brew install webp); if it's
// missing we keep the native file so the fetch still succeeds (just larger).
let HAVE_CWEBP = true
try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }) } catch { HAVE_CWEBP = false }
function toWebp(nativePath, q, maxDim = 0) {
  if (!HAVE_CWEBP) return
  const webp = nativePath.replace(/\.(jpg|png)$/i, '.webp')
  // logos arrive 500px but render at <=26px, so cap the longest side — a ~5x size cut with no
  // visible loss. `-resize w 0` keeps aspect; only ever downscales here. Headshots pass maxDim=0.
  const resize = maxDim ? ['-resize', String(maxDim), '0'] : []
  try {
    execFileSync('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '100', ...resize, nativePath, '-o', webp], { stdio: 'ignore' })
    rmSync(nativePath)
  } catch { /* leave the native file on failure */ }
}

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const data = JSON.parse(readFileSync(join(pub, 'data', 'goat-data.json'), 'utf8'))

// franchise -> ESPN logo code. Covers all 30 CURRENT franchises (the pool merges relocated
// teams into their current identity, so e.g. the Thunder logo serves the old Sonics years).
const ESPN_CODE = {
  ATL: 'atl', BOS: 'bos', BRK: 'bkn', CHI: 'chi', CHO: 'cha', CLE: 'cle', DAL: 'dal',
  DEN: 'den', DET: 'det', GSW: 'gs', HOU: 'hou', IND: 'ind', LAC: 'lac', LAL: 'lal',
  MEM: 'mem', MIA: 'mia', MIL: 'mil', MIN: 'min', NOP: 'no', NYK: 'ny', OKC: 'okc',
  ORL: 'orl', PHI: 'phi', PHO: 'phx', POR: 'por', SAC: 'sac', SAS: 'sa', TOR: 'tor',
  UTA: 'utah', WAS: 'wsh',
}

mkdirSync(join(pub, 'img', 'teams'), { recursive: true })
mkdirSync(join(pub, 'img', 'players'), { recursive: true })

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const tasks = []
// team logos (q90 — crisp UI marks, keep alpha)
for (const fr of data.pool.franchises) {
  const code = ESPN_CODE[fr.id]
  if (!code) continue
  tasks.push({ url: `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`, dest: join(pub, 'img', 'teams', `${fr.id}.png`), q: 90, maxDim: 128 })
}
// player headshots (unique slugs; q80)
const slugs = [...new Set(data.players.map((p) => p.player_id))]
for (const slug of slugs) {
  tasks.push({ url: `https://www.basketball-reference.com/req/202106291/images/headshots/${slug}.jpg`, dest: join(pub, 'img', 'players', `${slug}.jpg`), q: 80 })
}

const webpOf = (p) => p.replace(/\.(jpg|png)$/i, '.webp')
let ok = 0, miss = 0, skip = 0
async function run(task) {
  // already have the compressed (or native, if cwebp absent) output
  if (existsSync(webpOf(task.dest)) || existsSync(task.dest)) { skip++; return }
  try {
    const res = await fetch(task.url, { headers: { 'User-Agent': UA } })
    if (!res.ok) { miss++; return }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 200) { miss++; return } // tiny/placeholder = treat as missing
    writeFileSync(task.dest, buf)
    toWebp(task.dest, task.q, task.maxDim || 0) // -> .webp (~70% smaller, logos also downscaled)
    ok++
  } catch {
    miss++
  }
}

// modest concurrency to be polite to the source servers
const CONCURRENCY = 8
console.log(`[fetch-assets] ${tasks.length} files (${tasks.length - slugs.length} logos + ${slugs.length} headshots) -> WebP${HAVE_CWEBP ? '' : ' (cwebp missing: keeping native)'}…`)
let i = 0
async function worker() {
  while (i < tasks.length) {
    const t = tasks[i++]
    await run(t)
    if ((ok + miss + skip) % 100 === 0) process.stdout.write(`\r  ${ok} saved · ${miss} missing · ${skip} skipped`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`\r[fetch-assets] done: ${ok} saved · ${miss} missing (fall back to initials) · ${skip} already present`)
