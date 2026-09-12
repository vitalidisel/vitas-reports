import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teamProfile, teamMatches, finishedBefore } from '../../lib/pilot30/analysis/metrics.js'
import { assessSelection, REASON } from '../../lib/pilot30/analysis/eligibility.js'
import { fitPoisson, predict } from '../../lib/pilot30/analysis/poisson.js'
import { walkForward } from '../../lib/pilot30/analysis/evaluate.js'

function mkFixtures() {
  const out = []
  let i = 0
  for (let d = 1; d <= 60; d++) {
    const day = String(d).padStart(2, '0')
    out.push({ id: 'f' + (i++), leagueKey: 'L', homeTeamId: d % 2 ? 'A' : 'B', awayTeamId: d % 2 ? 'B' : 'A', kickoffUtc: `2026-01-${day > 31 ? '31' : day}T18:00:00Z`, status: 'FT', ftHome: d % 3, ftAway: d % 2 })
  }
  return out
}

test('history window never includes fixtures at or after the cutoff', () => {
  const fx = [
    { id: '1', homeTeamId: 'A', awayTeamId: 'B', kickoffUtc: '2026-01-01T18:00:00Z', status: 'FT', ftHome: 1, ftAway: 0 },
    { id: '2', homeTeamId: 'A', awayTeamId: 'B', kickoffUtc: '2026-01-10T18:00:00Z', status: 'FT', ftHome: 2, ftAway: 0 },
    { id: '3', homeTeamId: 'A', awayTeamId: 'B', kickoffUtc: '2026-01-10T18:00:00Z', status: 'NS', ftHome: null, ftAway: null },
    { id: '4', homeTeamId: 'A', awayTeamId: 'B', kickoffUtc: '2026-01-20T18:00:00Z', status: 'FT', ftHome: 0, ftAway: 3 },
  ]
  const ms = teamMatches(fx, 'A', '2026-01-10T18:00:00Z')
  assert.deepEqual(ms.map(m => m.fixtureId), ['1'])
  assert.equal(finishedBefore(fx, '2026-02-01T00:00:00Z').length, 3)
})

test('team profile computes windows, form and null on empty sample', () => {
  const fx = mkFixtures()
  const target = { homeTeamId: 'A', awayTeamId: 'B', kickoffUtc: '2026-02-01T18:00:00Z' }
  const p = teamProfile(fx, 'A', target, '2026-02-01T00:00:00Z')
  assert.equal(p.windows.w10.sample, 10)
  assert.equal(p.form10.length, 10)
  assert.equal(p.venue, 'home')
  assert.ok(p.restDays > 0)
  const empty = teamProfile(fx, 'Z', target, '2026-02-01T00:00:00Z')
  assert.equal(empty.windows.w5.sample, 0)
  assert.equal(empty.windows.w5.gfPerGame, null)
  assert.equal(empty.restDays, null)
})

test('eligibility: stale odds, suspended market, kickoff passed, not today', () => {
  const now = '2026-03-01T10:00:00Z'
  const fixture = { kickoffUtc: '2026-03-01T18:00:00Z', status: 'NS', mappingVerified: true, localDate: '2026-03-01' }
  const good = { odds: '1.9', status: 'active', sourceUpdatedAt: '2026-03-01T09:50:00Z', fetchedAt: '2026-03-01T09:55:00Z', bookmaker: 'demo' }
  const rules = { nowUtc: now, localDate: '2026-03-01', quoteTtlMinutes: 30, minSample: 5, bookmaker: 'demo' }
  assert.equal(assessSelection({ fixture, quote: good, analysis: { cutoffUtc: now, minSample: 10 }, rules }).eligible, true)
  assert.ok(assessSelection({ fixture, quote: { ...good, sourceUpdatedAt: '2026-03-01T09:00:00Z' }, analysis: null, rules }).reasons.includes(REASON.QUOTE_STALE_SOURCE))
  assert.ok(assessSelection({ fixture, quote: { ...good, fetchedAt: '2026-03-01T08:00:00Z' }, analysis: null, rules }).reasons.includes(REASON.QUOTE_STALE_FETCH))
  assert.ok(assessSelection({ fixture, quote: { ...good, status: 'suspended' }, analysis: null, rules }).reasons.includes(REASON.QUOTE_SUSPENDED))
  assert.ok(assessSelection({ fixture, quote: null, analysis: null, rules }).reasons.includes(REASON.NO_QUOTE))
  assert.ok(assessSelection({ fixture: { ...fixture, kickoffUtc: '2026-03-01T09:00:00Z' }, quote: good, analysis: null, rules }).reasons.includes(REASON.KICKOFF_PASSED))
  assert.ok(assessSelection({ fixture: { ...fixture, localDate: '2026-03-02' }, quote: good, analysis: null, rules }).reasons.includes(REASON.NOT_TODAY))
  assert.ok(assessSelection({ fixture: { ...fixture, mappingVerified: false }, quote: good, analysis: null, rules }).reasons.includes(REASON.MAPPING_UNVERIFIED))
  assert.ok(assessSelection({ fixture, quote: good, analysis: { cutoffUtc: now, minSample: 2 }, rules }).reasons.includes(REASON.SAMPLE_TOO_SMALL))
})

test('poisson: probabilities sum to 1, null when sample insufficient', () => {
  const fx = mkFixtures()
  const model = fitPoisson(fx, '2026-02-01T00:00:00Z')
  assert.equal(model.sample, 60)
  const pr = predict(model, 'A', 'B')
  assert.ok(pr.probabilities)
  const s = pr.probabilities['1X2']
  assert.ok(Math.abs(s.home + s.draw + s.away - 1) < 1e-9)
  assert.ok(pr.residualMass < 1e-6)
  assert.equal(predict(model, 'A', 'Z').probabilities, null)
  assert.equal(predict(fitPoisson([], '2026-02-01T00:00:00Z'), 'A', 'B').probabilities, null)
})

test('walk-forward evaluation produces finite metrics', () => {
  const r = walkForward(mkFixtures(), { step: 10, minTrain: 20, params: { minTeamMatches: 5 } })
  assert.ok(r.n > 0)
  assert.ok(Number.isFinite(r.brier) && r.brier >= 0 && r.brier <= 2)
  assert.ok(Number.isFinite(r.logLoss))
  assert.equal(r.calibration.length, 10)
})
