// Exact money and odds arithmetic.
// Money: integer minor units (agorot). Odds: decimal strings parsed to BigInt at a fixed scale.
// Nothing here rounds except the explicit display helpers.

export const ODDS_SCALE = 6n            // 1.83 → 1_830_000n
export const ODDS_SCALE_N = 10n ** ODDS_SCALE

/** Parse a decimal odds value ("1.83", 1.83, "21") into a BigInt scaled by 1e6. Throws on invalid/≤1. */
export function parseOdds(value) {
  if (value === null || value === undefined) throw new Error('odds missing')
  const s = String(value).trim()
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid odds: ${s}`)
  const [int, frac = ''] = s.split('.')
  if (frac.length > Number(ODDS_SCALE)) throw new Error(`odds precision beyond ${ODDS_SCALE} decimals: ${s}`)
  const scaled = BigInt(int) * ODDS_SCALE_N + BigInt((frac + '0'.repeat(Number(ODDS_SCALE))).slice(0, Number(ODDS_SCALE)))
  if (scaled <= ODDS_SCALE_N) throw new Error(`odds must exceed 1.00: ${s}`)
  return scaled
}

/** Exact product of odds as a rational {num, den} (den = 1e6^n). */
export function combinedOdds(oddsList) {
  let num = 1n, den = 1n
  for (const o of oddsList) { num *= typeof o === 'bigint' ? o : parseOdds(o); den *= ODDS_SCALE_N }
  return { num, den }
}

/** Exact potential return as rational minor units: stake * product. */
export function potentialReturnMinor(stakeMinor, oddsList) {
  const { num, den } = combinedOdds(oddsList)
  return { num: BigInt(stakeMinor) * num, den }
}

/** Compare rational >= integer (minor units) without rounding. */
export function rationalAtLeast(r, minor) { return r.num >= BigInt(minor) * r.den }

/** floor(rational) as Number minor units — display only. */
export function floorMinor(r) { return Number(r.num / r.den) }

/** Required combined odds for a target: (stake + targetNet) / stake, as rational. */
export function targetOdds(stakeMinor, targetNetMinor) {
  return { num: BigInt(stakeMinor) + BigInt(targetNetMinor), den: BigInt(stakeMinor) }
}

/** Combined odds as decimal string with `digits` decimals (floor). Display only. */
export function rationalToDecimalString(r, digits = 2) {
  const scale = 10n ** BigInt(digits)
  const v = (r.num * scale) / r.den
  const s = v.toString().padStart(digits + 1, '0')
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`
}

/** 1 / combinedOdds as a Number in [0,1] — the break-even probability (display/analysis). */
export function breakEvenProbability(r) { return Number(r.den) / Number(r.num) }

/** Format minor units as "12.34" (no rounding beyond the stored precision). */
export function formatMinor(minor) {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(Number(minor))
  const int = Math.floor(abs / 100), frac = abs % 100
  return `${sign}${int}${frac ? '.' + String(frac).padStart(2, '0') : ''}`
}

export function oddsToString(scaled, digits = 2) { return rationalToDecimalString({ num: scaled, den: ODDS_SCALE_N }, digits) }
