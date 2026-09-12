// Deterministic PRNG (mulberry32) so demo data is stable across restarts for the same seed.
export function rng(seed) {
  let a = seed >>> 0
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function hashString(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
export function poissonSample(lambda, r) { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= r() } while (p > L); return k - 1 }
