// Deterministic, seed-driven draws. EVERY game — daily or unlimited — runs off a seed, so
// every board is reproducible and shareable as a challenge link.
//
// The key property: draws are keyed by PURPOSE (spin number + axis + current cell), NOT
// pulled from one sequential stream. So a player's optional rerolls never shift the cells
// everyone else is dealt — for a given seed the six spins are identical regardless of choices,
// and a reroll from a given cell always yields the same alternate (path-independent).

// fnv-1a + a final avalanche -> a well-mixed 32-bit hash of a string.
export function hashStr(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

// A dealer turns (length, ...key parts) into a stable index in [0, length).
export function makeDealer(seed) {
  const s = String(seed)
  const index = (n, ...parts) => (n <= 0 ? 0 : hashStr(s + '|' + parts.join('|')) % n)
  return { seed: s, index }
}

// Fresh seed for an unlimited game — random token, but the play that follows is fully
// reproducible (so "share my board" works in unlimited too).
export function randomSeed() {
  const r = Math.floor(Math.random() * 0xffffffff).toString(36)
  const t = Math.floor(Math.random() * 0xffffffff).toString(36)
  return 'u' + r + t
}
