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
  // New Jersey Nets → Brooklyn Nets (first Brooklyn season: 2012–13)
  BRK: [{ until: 2012, id: 'NJN', name: 'Nets', color: '#002A60' }],
  // Vancouver Grizzlies → Memphis Grizzlies (first Memphis season: 2001–02)
  MEM: [{ until: 2001, id: 'VAN', name: 'Grizzlies', color: '#00B2A9' }],
  // Washington Bullets → Washington Wizards (renamed for 1997–98)
  WAS: [{ until: 1997, id: 'WSB', name: 'Bullets', color: '#002B5C' }],
  // Kansas City Kings → Sacramento Kings (first Sacramento season: 1985–86)
  SAC: [{ until: 1985, id: 'KCK', name: 'Kings', color: '#1D428A' }],
  // San Diego Clippers → Los Angeles Clippers (first LA season: 1984–85)
  LAC: [{ until: 1984, id: 'SDC', name: 'Clippers', color: '#C8102E' }],
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
  return eras.find((e) => season <= e.until) || null
}
