// Historical team identities. The dataset keys every roster by the CURRENT franchise id
// (so 1999_OKC is really the '98–99 Seattle SuperSonics, and 1995_CHO is the original
// Charlotte Hornets). This table rewrites name/logo/color for seasons on or before a move
// or rename — purely for DISPLAY. The game logic always uses the canonical id, so nothing
// downstream of teamDisplay() has to change.
//
// `season` is the campaign's ENDING year (1999 = the 1998–99 season). `until` is the LAST
// such season the old identity applies to; eras are tried in order, first match wins.
// `id` doubles as the logo asset id (public/img/teams/<id>.webp, fetched by
// scripts/fetch-assets.mjs) and the badge text used when the logo is missing.
//
// Only unambiguous relocations/renames within the data's 1980+ window are listed. Where a
// modern franchise simply changed logos under the same city+name, we keep the one modern
// mark — matching how the current 30 are handled.
export const FRANCHISE_ERAS = {
  // Seattle SuperSonics → Oklahoma City Thunder (first OKC season: 2008–09)
  OKC: [{ until: 2008, id: 'SEA', name: 'SuperSonics', color: '#00653A' }],
  // New York Nets (NBA 1977) → New Jersey Nets → Brooklyn Nets (first Brooklyn season: 2012–13)
  BRK: [
    { until: 1977, id: 'NYN', name: 'Nets', color: '#C8102E' },
    { until: 2012, id: 'NJN', name: 'Nets', color: '#002A60' },
  ],
  // Minneapolis Lakers → Los Angeles Lakers (first LA season: 1960–61)
  LAL: [{ until: 1960, id: 'MNL', name: 'Lakers', color: '#0C2C56' }],
  // Philadelphia → San Francisco → Golden State Warriors
  GSW: [
    { until: 1962, id: 'PHW', name: 'Warriors', color: '#1D428A' },
    { until: 1971, id: 'SFW', name: 'Warriors', color: '#FFC72C' },
  ],
  // Syracuse Nationals → Philadelphia 76ers (renamed for 1963–64)
  PHI: [{ until: 1963, id: 'SYR', name: 'Nationals', color: '#D50032' }],
  // Fort Wayne Pistons → Detroit Pistons (first Detroit season: 1957–58)
  DET: [{ until: 1957, id: 'FTW', name: 'Pistons', color: '#C8102E' }],
  // Tri-Cities Blackhawks → Milwaukee → St. Louis → Atlanta Hawks
  ATL: [
    { until: 1951, id: 'TRI', name: 'Blackhawks', color: '#00653A' },
    { until: 1955, id: 'MLH', name: 'Hawks', color: '#E03A3E' },
    { until: 1968, id: 'STL', name: 'Hawks', color: '#E03A3E' },
  ],
  // Buffalo Braves → San Diego Clippers → LA Clippers (Braves through 1977–78)
  // (SDC era listed under LAC below)
  // San Diego Rockets → Houston Rockets (first Houston season: 1971–72)
  HOU: [{ until: 1971, id: 'SDR', name: 'Rockets', color: '#00653A' }],
  // New Orleans Jazz → Utah Jazz (first Utah season: 1979–80)
  UTA: [{ until: 1979, id: 'NOJ', name: 'Jazz', color: '#5A2D81' }],
  // Vancouver Grizzlies → Memphis Grizzlies (first Memphis season: 2001–02)
  MEM: [{ until: 2001, id: 'VAN', name: 'Grizzlies', color: '#00B2A9' }],
  // Chicago Packers/Zephyrs → Baltimore Bullets → Washington Bullets → Wizards
  WAS: [
    { until: 1973, id: 'BAL', name: 'Bullets', color: '#F58426' },
    { until: 1997, id: 'WSB', name: 'Bullets', color: '#002B5C' },
  ],
  // Rochester Royals → Cincinnati Royals → KC Kings → Sacramento Kings
  SAC: [
    { until: 1957, id: 'ROC', name: 'Royals', color: '#1D428A' },
    { until: 1972, id: 'CIN', name: 'Royals', color: '#1D428A' },
    { until: 1985, id: 'KCK', name: 'Kings', color: '#1D428A' },
  ],
  // Buffalo Braves → San Diego Clippers → Los Angeles Clippers (first LA season: 1984–85)
  LAC: [
    { until: 1978, id: 'BUF', name: 'Braves', color: '#F58426' },
    { until: 1984, id: 'SDC', name: 'Clippers', color: '#C8102E' },
  ],
  // bbref files BOTH Charlotte stints under the current Hornets franchise:
  // original Charlotte Hornets (1988–2002), then the Bobcats (2004–14), then Hornets again.
  CHO: [
    { until: 2002, id: 'CHH', name: 'Hornets', color: '#008CA8' },
    { until: 2014, id: 'CHA', name: 'Bobcats', color: '#2A5DA8' },
  ],
  // New Orleans Hornets → New Orleans Pelicans (renamed for 2013–14). The franchise's
  // pre-2003 history lives under CHO above, so NOP only needs the Hornets era.
  NOP: [{ until: 2013, id: 'NOH', name: 'Hornets', color: '#00285E' }],
}

// Resolve the historical identity for a (franchise, season) cell, or null for the current one.
export function franchiseEra(franchise, season) {
  const eras = FRANCHISE_ERAS[franchise]
  if (!eras || season == null) return null
  // Decade tokens ("1990s") resolve by the decade MIDPOINT: the identity that covers most
  // of the decade wins (a 2000s OKC cell shows the SuperSonics — the move was 2008).
  const y = typeof season === 'string' && /^\d{4}s$/.test(season)
    ? Number(season.slice(0, 4)) + 5
    : Number(season)
  if (Number.isNaN(y)) return null
  return eras.find((e) => y <= e.until) || null
}
