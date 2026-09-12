// Chronological (walk-forward) evaluation of the experimental model: Brier score, log loss, calibration.
// Parameters are chosen on validation only; the test block is scored once with the locked version.
import { fitPoisson, predict } from './poisson.js'
import { finishedBefore } from './metrics.js'

export function brier1x2(p, outcome) { return ['home', 'draw', 'away'].reduce((s, k) => s + (p[k] - (outcome === k ? 1 : 0)) ** 2, 0) }
export function logLoss(pOutcome) { return -Math.log(Math.max(1e-12, pOutcome)) }

export function chronologicalSplit(fixtures, { train = 0.6, validation = 0.2 } = {}) {
  const rows = finishedBefore(fixtures, '2999-01-01T00:00:00Z').reverse() // oldest → newest
  const nTrain = Math.floor(rows.length * train), nVal = Math.floor(rows.length * validation)
  return { train: rows.slice(0, nTrain), validation: rows.slice(nTrain, nTrain + nVal), test: rows.slice(nTrain + nVal) }
}

/**
 * Walk-forward: for each block of `step` fixtures, fit on everything strictly before the block, predict the block.
 * Returns aggregate metrics + calibration bins for the home-win probability.
 */
export function walkForward(fixtures, { step = 20, params = {}, bins = 10, minTrain = 60 } = {}) {
  const rows = finishedBefore(fixtures, '2999-01-01T00:00:00Z').reverse()
  const scored = []
  let skipped = 0
  for (let start = minTrain; start < rows.length; start += step) {
    const cutoff = rows[start].kickoffUtc
    const model = fitPoisson(rows.slice(0, start), cutoff, params)
    for (const f of rows.slice(start, start + step)) {
      const pr = predict(model, f.homeTeamId, f.awayTeamId)
      if (!pr.probabilities) { skipped++; continue }
      const outcome = f.ftHome > f.ftAway ? 'home' : f.ftHome < f.ftAway ? 'away' : 'draw'
      const p = pr.probabilities['1X2']
      scored.push({ fixtureId: f.id, p, outcome, brier: brier1x2(p, outcome), logLoss: logLoss(p[outcome]), over: f.ftHome + f.ftAway > 2.5, pOver: pr.probabilities.OU25.over })
    }
  }
  const n = scored.length
  const calibration = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, predicted: 0, observed: 0 }))
  for (const s of scored) { const b = Math.min(bins - 1, Math.floor(s.p.home * bins)); calibration[b].n++; calibration[b].predicted += s.p.home; calibration[b].observed += s.outcome === 'home' ? 1 : 0 }
  for (const c of calibration) if (c.n) { c.predicted /= c.n; c.observed /= c.n }
  const baseline = n ? scored.reduce((s, x) => s + brier1x2({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, x.outcome), 0) / n : null
  return {
    n, skipped,
    brier: n ? scored.reduce((s, x) => s + x.brier, 0) / n : null,
    brierUniformBaseline: baseline,
    logLoss: n ? scored.reduce((s, x) => s + x.logLoss, 0) / n : null,
    over25Brier: n ? scored.reduce((s, x) => s + (x.pOver - (x.over ? 1 : 0)) ** 2, 0) / n : null,
    calibration,
  }
}
