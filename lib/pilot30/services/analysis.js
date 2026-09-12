// Per-fixture analysis snapshot: descriptive metrics + optional experimental model + missing-data list.
import { teamProfile, headToHead } from '../analysis/metrics.js'
import { fitPoisson, predict, MODEL_VERSION } from '../analysis/poisson.js'
import { dataCompleteness } from '../analysis/eligibility.js'

const modelCache = new Map()

export async function getLeagueModel(store, leagueKey, cutoffUtc, dataMode) {
  const key = `${leagueKey}|${cutoffUtc.slice(0, 13)}`
  if (modelCache.has(key)) return modelCache.get(key)
  const history = await store.listFixtures({ leagueKeys: [leagueKey], toUtc: cutoffUtc, dataMode })
  const model = fitPoisson(history, cutoffUtc)
  modelCache.set(key, model)
  if (modelCache.size > 50) modelCache.delete(modelCache.keys().next().value)
  return model
}

/**
 * Builds and stores an analysis snapshot for `fixture` with everything known strictly before `cutoffUtc`.
 */
export async function analyzeFixture(store, fixture, cutoffUtc, config, { football = null } = {}) {
  const history = await store.listFixtures({ leagueKeys: [fixture.leagueKey], toUtc: cutoffUtc, dataMode: fixture.dataMode })
  const home = teamProfile(history, fixture.homeTeamId, fixture, cutoffUtc)
  const away = teamProfile(history, fixture.awayTeamId, fixture, cutoffUtc)
  const h2h = headToHead(history, fixture.homeTeamId, fixture.awayTeamId, cutoffUtc)
  let lineups = fixture.lineups || null
  if (!lineups && football && typeof football.lineups === 'function') {
    try { lineups = await football.lineups(fixture.id.replace(/^af-/, '')); await store.upsertFixture({ id: fixture.id, lineups }) } catch (e) { lineups = { status: 'error', error: e.message } }
  }
  const missing = []
  if (home.windows.w10.sample < 10) missing.push(`מדגם בית: ${home.windows.w10.sample}/10 משחקים`)
  if (away.windows.w10.sample < 10) missing.push(`מדגם חוץ: ${away.windows.w10.sample}/10 משחקים`)
  if (!lineups || lineups.status !== 'published') missing.push('הרכבים טרם פורסמו')
  if (!fixture.injuries) missing.push('אין נתוני פציעות')
  missing.push('xG: לא זמין ממקור מאומת')
  let probabilities = null, uncertainties = null, modelVersion = null, modelNote = null
  if (config.modelEnabled) {
    const model = await getLeagueModel(store, fixture.leagueKey, cutoffUtc, fixture.dataMode)
    const pr = predict(model, fixture.homeTeamId, fixture.awayTeamId)
    modelVersion = MODEL_VERSION
    if (pr.probabilities) { probabilities = pr.probabilities; uncertainties = { overall: pr.uncertainty, residualMass: pr.residualMass, sample: pr.sample, lambda: pr.lambda } }
    else modelNote = pr.reason
  } else modelNote = 'המודל הניסיוני כבוי — אין הסתברות עצמאית'
  const snapshot = await store.insertAnalysis({
    fixtureId: fixture.id, cutoffUtc,
    inputs: { home, away, h2h, lineups: lineups ? { status: lineups.status } : { status: 'unknown' }, injuries: fixture.injuries || null, completeness: dataCompleteness({ homeSample: home.windows.w10.sample >= 5, awaySample: away.windows.w10.sample >= 5, lineups: lineups?.status === 'published', injuries: Boolean(fixture.injuries) }) },
    modelVersion, probabilities, uncertainties, missingData: missing, sources: [{ source: fixture.source, sourceUpdatedAt: fixture.sourceUpdatedAt || null, fetchedAt: fixture.fetchedAt || null }],
    createdAt: new Date().toISOString(), modelNote,
  })
  return snapshot
}
