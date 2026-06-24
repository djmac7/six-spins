// SELF-HOSTED image URLs. The logos + headshots are downloaded once into public/img by
// scripts/fetch-assets.mjs (never hotlinked at runtime). Anything that wasn't downloaded
// 404s locally and degrades to the initials/color fallback.

const B = import.meta.env.BASE_URL // '/' in dev, './' in the static build

// Images are self-hosted as WebP (compressed by scripts/fetch-assets.mjs — ~70% smaller
// than the source JPG/PNG). Every evergreen browser supports WebP; a missing file 404s
// locally and degrades to the initials/color fallback.
export function teamLogoUrl(franchise) {
  return franchise ? `${B}img/teams/${franchise}.webp` : null
}

// BBRef slugs look like "curryst01" (lowercase letters + 2 digits). Placeholder ids
// ("ph_chi1991_0") don't match -> null -> initials fallback.
const BBREF_SLUG = /^[a-z.'-]{3,}\d{2}$/

export function playerPhotoUrl(player) {
  const slug = player?.player_id
  if (!slug || !BBREF_SLUG.test(slug)) return null
  return `${B}img/players/${slug}.webp`
}
