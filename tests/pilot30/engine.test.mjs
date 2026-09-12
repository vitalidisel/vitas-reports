import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCombinations } from '../../lib/pilot30/ticket/engine.js'

const c = (fixtureId, odds, extra = {}) => ({ fixtureId, market: '1X2', selection: 'home', odds, bookmaker: 'demo', quoteId: 'q' + fixtureId, analysisId: 'a' + fixtureId, probability: null, uncertainty: null, ...extra })

test('returns no_candidate when the product cannot reach 21', () => {
  const r = findCombinations({ candidates: [c('1', '1.5'), c('2', '1.6'), c('3', '1.7')], stakeMinor: 1000, targetNetMinor: 20000 })
  assert.equal(r.status, 'no_candidate')
  assert.equal(r.tickets.length, 0)
})

test('finds a qualifying combination and prefers fewer legs', () => {
  const r = findCombinations({ candidates: [c('1', '3.5'), c('2', '2'), c('3', '3'), c('4', '7'), c('5', '1.5')], stakeMinor: 1000, targetNetMinor: 20000 })
  assert.equal(r.status, 'candidate')
  assert.equal(r.basis, 'accounting')
  const best = r.tickets[0]
  assert.equal(best.legCount, 2)              // 3.5 × 7 = 24.5 or 3 × 7 = 21
  assert.equal(best.combinedOddsText, '21.00') // lowest combined odds among 2-leg solutions
  assert.equal(best.potentialReturnMinorFloor, 21000)
  assert.equal(best.potentialNetMinorFloor, 20000)
})

test('never uses two selections from the same fixture', () => {
  const r = findCombinations({ candidates: [c('1', '5'), c('1', '5', { market: 'OU25', selection: 'over' }), c('2', '4.2')], stakeMinor: 1000, targetNetMinor: 20000 })
  assert.equal(r.status, 'candidate')
  for (const t of r.tickets) assert.equal(new Set(t.legs.map(l => l.fixtureId)).size, t.legs.length)
})

test('never mixes bookmakers on one ticket', () => {
  const r = findCombinations({ candidates: [c('1', '5', { bookmaker: 'A' }), c('2', '5', { bookmaker: 'B' })], stakeMinor: 1000, targetNetMinor: 20000 })
  assert.equal(r.status, 'no_candidate')
})

test('respects the max legs cap', () => {
  const cands = Array.from({ length: 10 }, (_, i) => c(String(i), '1.5'))
  assert.equal(findCombinations({ candidates: cands, stakeMinor: 1000, targetNetMinor: 20000, maxLegs: 7 }).status, 'no_candidate') // 1.5^7 = 17.1
  const r = findCombinations({ candidates: cands, stakeMinor: 1000, targetNetMinor: 20000, maxLegs: 8 })
  assert.equal(r.status, 'candidate') // 1.5^8 = 25.6
  assert.equal(r.tickets[0].legCount, 8)
})

test('model ranking requires probabilities and applies the EV threshold', () => {
  const cands = [c('1', '5', { probability: 0.3, uncertainty: 0.2 }), c('2', '5', { probability: 0.25, uncertainty: 0.2 }), c('3', '30', { probability: null })]
  const r = findCombinations({ candidates: cands, stakeMinor: 1000, targetNetMinor: 20000, rankingMode: 'model', evThresholdMinor: 0 })
  // 5×5 = 25 with joint p 0.075 → expected net = 1000*(0.075*25-1) = 875 ≥ 0 → passes; fixture 3 has no p → excluded
  assert.equal(r.status, 'candidate')
  assert.equal(r.tickets[0].legCount, 2)
  assert.ok(Math.abs(r.tickets[0].jointProbability - 0.075) < 1e-12)
  assert.equal(r.tickets[0].expectedNetMinor, 875)
  const strict = findCombinations({ candidates: cands, stakeMinor: 1000, targetNetMinor: 20000, rankingMode: 'model', evThresholdMinor: 1000 })
  assert.equal(strict.status, 'no_candidate')
})

test('missing probability is null, not zero', () => {
  const r = findCombinations({ candidates: [c('1', '21')], stakeMinor: 1000, targetNetMinor: 20000 })
  assert.equal(r.tickets[0].jointProbability, null)
  assert.equal(r.tickets[0].expectedNetMinor, null)
})

test('a realistic day (12 fixtures × 7 selections) is searched to completion and prefers the tightest small ticket', () => {
  const odds = { home: ['1.26', '1.63', '2.10', '2.45', '3.05', '4.13', '5.20', '1.90', '2.70', '3.40', '1.45', '6.10'], draw: ['4.68', '3.90', '3.30', '3.25', '3.40', '3.60', '4.10', '3.50', '3.30', '3.45', '4.40', '4.80'], away: ['9.50', '5.10', '3.20', '2.75', '2.20', '1.80', '1.55', '3.80', '2.50', '2.05', '6.40', '1.50'] }
  const cands = []
  for (let i = 0; i < 12; i++) {
    for (const sel of ['home', 'draw', 'away']) cands.push(c(String(i), odds[sel][i], { selection: sel }))
    cands.push(c(String(i), '1.85', { market: 'OU25', selection: 'over' }), c(String(i), '1.95', { market: 'OU25', selection: 'under' }), c(String(i), '1.75', { market: 'BTTS', selection: 'yes' }), c(String(i), '2.05', { market: 'BTTS', selection: 'no' }))
  }
  const r = findCombinations({ candidates: cands, stakeMinor: 1000, targetNetMinor: 20000, maxLegs: 8 })
  assert.equal(r.status, 'candidate')
  assert.equal(r.truncated, false)
  assert.equal(r.tickets[0].legCount, 2)
  // brute-force the true minimum 2-leg product ≥ 21 (different fixtures) and compare
  let best = Infinity
  for (const a of cands) for (const b of cands) if (a.fixtureId < b.fixtureId) { const p = Number(a.odds) * Number(b.odds); if (p >= 21 && p < best) best = p }
  assert.equal(r.tickets[0].combinedOddsText, (Math.floor(best * 100 + 1e-9) / 100).toFixed(2))
})
