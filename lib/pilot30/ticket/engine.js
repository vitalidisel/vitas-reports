// Ticket engine: exact math + bounded subset search.
// Input candidates are already *eligible* (data-quality checks happen upstream in analysis/eligibility).
// The engine never adds weak selections to reach the ratio; if nothing qualifies it returns no_candidate.
import { parseOdds, combinedOdds, potentialReturnMinor, rationalAtLeast, targetOdds, rationalToDecimalString, breakEvenProbability, floorMinor } from '../money.js'

/**
 * @typedef Candidate
 * @prop {string} fixtureId
 * @prop {string} market      '1X2' | 'OU25' | 'BTTS'
 * @prop {string} selection   'home'|'draw'|'away'|'over'|'under'|'yes'|'no'
 * @prop {string} odds        decimal string
 * @prop {string} bookmaker
 * @prop {string} quoteId
 * @prop {string} analysisId
 * @prop {number|null} probability   model estimate for this selection, null when unavailable
 * @prop {number|null} uncertainty   0..1, null when unavailable
 */

export function ticketMath(stakeMinor, oddsList) {
  const combined = combinedOdds(oddsList)
  const ret = potentialReturnMinor(stakeMinor, oddsList)
  const netNum = ret.num - BigInt(stakeMinor) * ret.den
  return {
    combinedOdds: combined,
    combinedOddsText: rationalToDecimalString(combined, 2),
    potentialReturn: ret,
    potentialReturnMinorFloor: floorMinor(ret),
    potentialNetMinorFloor: floorMinor({ num: netNum, den: ret.den }),
    breakEvenProbability: breakEvenProbability(combined),
  }
}

/** Joint probability under the independence approximation, or null if any leg lacks a probability. */
export function jointProbability(legs) {
  let p = 1
  for (const l of legs) { if (l.probability === null || l.probability === undefined) return null; p *= l.probability }
  return p
}

/**
 * Search combinations meeting the target. Bounded DFS: at most one selection per fixture,
 * one bookmaker per ticket, at most `maxLegs` legs.
 * Returns { status: 'candidate'|'no_candidate', tickets: [...], explored, reasons }.
 */
export function findCombinations({ candidates, stakeMinor, targetNetMinor, maxLegs = 8, maxResults = 25, rankingMode = 'accounting', evThresholdMinor = null, maxExplored = 400_000, perDepthCap = 3000 }) {
  const reasons = []
  const target = targetOdds(stakeMinor, targetNetMinor)
  const targetReturnMinor = BigInt(stakeMinor) + BigInt(targetNetMinor)
  if (!candidates.length) return { status: 'no_candidate', tickets: [], explored: 0, reasons: ['אין בחירות כשירות'], target: rationalToDecimalString(target, 2) }

  // Group by bookmaker: a ticket never mixes operators.
  const byBook = new Map()
  for (const c of candidates) {
    try { parseOdds(c.odds) } catch (e) { reasons.push(`יחס לא תקין למשחק ${c.fixtureId}: ${e.message}`); continue }
    if (!byBook.has(c.bookmaker)) byBook.set(c.bookmaker, [])
    byBook.get(c.bookmaker).push(c)
  }

  // Iterative deepening on leg count: depth d enumerates minimal qualifying sets of exactly d legs
  // (one selection per fixture, one bookmaker), with an upper-bound prune on the remaining fixtures.
  // Shallow depths are cheap; we stop deepening once enough solutions exist, so a day with 25 fixtures
  // and 7 selections each stays bounded without ever "forcing" extra legs.
  const results = []
  let explored = 0
  let truncated = false
  for (const [bookmaker, list] of byBook) {
    const fixtures = [...new Set(list.map(c => c.fixtureId))].map(id => ({ id, options: list.filter(c => c.fixtureId === id).map(c => ({ ...c, scaled: parseOdds(c.odds) })).sort((a, b) => (b.scaled > a.scaled ? 1 : -1)) }))
    const maxPerFixture = fixtures.map(f => f.options[0].scaled)
    const order = fixtures.map((_, i) => i).sort((a, b) => (maxPerFixture[b] > maxPerFixture[a] ? 1 : maxPerFixture[b] < maxPerFixture[a] ? -1 : 0))
    const sortedFixtures = order.map(i => fixtures[i])
    const sortedMax = order.map(i => maxPerFixture[i])
    const stake = BigInt(stakeMinor)
    const chosen = []
    let foundAtDepth = 0
    const dfs = (idx, prodNum, prodDen, depth) => {
      if (explored > maxExplored || foundAtDepth >= perDepthCap) return
      explored++
      const remaining = depth - chosen.length
      if (remaining === 0) {
        if (stake * prodNum >= targetReturnMinor * prodDen) { results.push({ bookmaker, legs: chosen.map(c => ({ ...c })) }); foundAtDepth++ }
        return
      }
      if (sortedFixtures.length - idx < remaining) return
      // Upper bound: best odds of the next `remaining` fixtures cannot reach the target → prune.
      let bNum = prodNum, bDen = prodDen
      for (let k = idx, taken = 0; k < sortedFixtures.length && taken < remaining; k++, taken++) { bNum *= sortedMax[k]; bDen *= 1_000_000n }
      if (stake * bNum < targetReturnMinor * bDen) return
      for (let k = idx; k <= sortedFixtures.length - remaining; k++) {
        for (const opt of sortedFixtures[k].options) {
          // Skip supersets of an already-qualifying smaller set: if the partial product already qualifies
          // with fewer than `depth` legs, this branch is not minimal.
          const pn = prodNum * opt.scaled, pd = prodDen * 1_000_000n
          if (remaining > 1 && stake * pn >= targetReturnMinor * pd) continue
          chosen.push(opt)
          dfs(k + 1, pn, pd, depth)
          chosen.pop()
        }
      }
    }
    for (let depth = 1; depth <= Math.min(maxLegs, sortedFixtures.length); depth++) {
      foundAtDepth = 0
      dfs(0, 1n, 1n, depth)
      if (explored > maxExplored) { truncated = true; break }
      if (results.length >= maxResults * 4 && depth >= 2) break
    }
  }

  const enriched = results.map(r => {
    const math = ticketMath(stakeMinor, r.legs.map(l => l.scaled))
    const p = jointProbability(r.legs)
    const expectedNetMinor = p === null ? null : Math.floor(Number(stakeMinor) * (p * Number(math.combinedOdds.num) / Number(math.combinedOdds.den) - 1))
    const uncertainty = r.legs.some(l => l.uncertainty === null || l.uncertainty === undefined) ? null : Math.max(...r.legs.map(l => l.uncertainty))
    return { ...r, legs: r.legs.map(({ scaled, ...l }) => l), ...math, jointProbability: p, expectedNetMinor, uncertainty, legCount: r.legs.length }
  })

  let ranked
  let basis
  if (rankingMode === 'model') {
    const withP = enriched.filter(t => t.jointProbability !== null)
    if (!withP.length) reasons.push('אין הסתברות מודל לכל הבחירות — לא ניתן לדרג לפי מודל')
    const passing = evThresholdMinor === null ? withP : withP.filter(t => t.expectedNetMinor >= evThresholdMinor)
    if (withP.length && !passing.length) reasons.push('אף שילוב לא עומד בסף התוחלת שנקבע')
    ranked = passing.sort((a, b) => (b.jointProbability - a.jointProbability) || (a.legCount - b.legCount) || ((a.uncertainty ?? 1) - (b.uncertainty ?? 1)))
    basis = 'model'
  } else {
    // Accounting-only: fewest legs, then the lowest combined odds that still meets the target.
    ranked = enriched.sort((a, b) => (a.legCount - b.legCount) || cmpRational(a.combinedOdds, b.combinedOdds))
    basis = 'accounting'
  }
  if (!ranked.length && !reasons.length) reasons.push(truncated ? 'החיפוש נעצר במגבלת החישוב' : 'אין שילוב של בחירות כשירות שמגיע ליחס הנדרש')
  return { status: ranked.length ? 'candidate' : 'no_candidate', tickets: ranked.slice(0, maxResults), explored, reasons, basis, target: rationalToDecimalString(target, 2), truncated }
}

function cmpRational(a, b) { const l = a.num * b.den, r = b.num * a.den; return l < r ? -1 : l > r ? 1 : 0 }

/** Recompute + validate a set of legs against the target; used before commit. */
export function verifyTicketMeetsTarget(stakeMinor, targetNetMinor, oddsList) {
  const ret = potentialReturnMinor(stakeMinor, oddsList)
  return rationalAtLeast(ret, BigInt(stakeMinor) + BigInt(targetNetMinor))
}
