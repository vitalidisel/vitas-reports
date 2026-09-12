// Provider → store synchronisation for fixtures, history and results.
import { LEAGUE_CATALOG } from '../config.js'
import { localDateOf } from '../time.js'
import { DEMO_LEAGUES } from '../demo/seed.js'

const internalFixtureId = (provider, externalId) => (provider === 'demo' ? externalId : `af-${externalId}`)
const internalTeamId = (provider, externalId) => (provider === 'demo' ? externalId : `af-${externalId}`)

/** Ensure league rows + provider ids exist for the pilot's leagues (discovery is cached in the store). */
export async function ensureLeagues(store, football, leagueKeys) {
  const existing = new Map((await store.listLeagues()).map(l => [l.key, l]))
  const missing = leagueKeys.filter(k => !existing.get(k)?.providerIds?.[football.name])
  if (!missing.length) return leagueKeys.map(k => existing.get(k))
  const catalog = [...LEAGUE_CATALOG, ...DEMO_LEAGUES].filter(l => missing.includes(l.key))
  const discovered = await football.discoverLeagues(catalog)
  for (const d of discovered) {
    const base = catalog.find(l => l.key === d.key)
    const row = await store.upsertLeague({ key: d.key, name: base.name, nameHe: base.nameHe, country: base.country, season: d.season, providerIds: { ...(existing.get(d.key)?.providerIds || {}), [football.name]: d.providerId }, coverage: d.coverage || null, dataMode: football.name === 'demo' ? 'demo' : 'live' })
    if (d.providerId) await store.upsertMapping({ provider: football.name, entityType: 'league', externalId: String(d.providerId), internalId: d.key, verification: 'verified', meta: { season: d.season } })
    existing.set(d.key, row)
  }
  return leagueKeys.map(k => existing.get(k)).filter(Boolean)
}

async function upsertNormalizedFixture(store, football, league, nf, timezone) {
  const dataMode = football.name === 'demo' ? 'demo' : 'live'
  const homeId = internalTeamId(football.name, nf.homeTeam.externalId), awayId = internalTeamId(football.name, nf.awayTeam.externalId)
  if (dataMode === 'live') {
    for (const [id, t] of [[homeId, nf.homeTeam], [awayId, nf.awayTeam]]) {
      await store.upsertTeam({ id, name: t.name, leagueKey: league.key, providerIds: { [football.name]: t.externalId }, dataMode })
      await store.upsertMapping({ provider: football.name, entityType: 'team', externalId: t.externalId, internalId: id, verification: 'verified' })
    }
  }
  const id = internalFixtureId(football.name, nf.externalId)
  const now = new Date().toISOString()
  const row = await store.upsertFixture({ id, leagueKey: league.key, season: nf.season, homeTeamId: homeId, awayTeamId: awayId, kickoffUtc: nf.kickoffUtc, localDate: localDateOf(new Date(nf.kickoffUtc), timezone), status: nf.status, ftHome: nf.ftHome, ftAway: nf.ftAway, source: nf.source, sourceUpdatedAt: now, fetchedAt: now, mappingVerified: true, lineups: nf.lineups ?? undefined, dataMode })
  if (dataMode === 'live') await store.upsertMapping({ provider: football.name, entityType: 'fixture', externalId: nf.externalId, internalId: id, verification: 'verified' })
  return row
}

/** Fixtures of the pilot leagues for one local date. Returns {fixtures, counts}. */
export async function syncFixturesForDate(store, football, leagueKeys, localDate, timezone) {
  const leagues = await ensureLeagues(store, football, leagueKeys)
  const fixtures = []
  for (const league of leagues) {
    const providerId = league.providerIds?.[football.name]
    if (!providerId) continue
    const list = await football.fixturesByDate({ leagueId: providerId, season: league.season, date: localDate })
    for (const nf of list) {
      // The provider's date filter uses the provider timezone; keep only fixtures whose *Israel* date matches.
      if (localDateOf(new Date(nf.kickoffUtc), timezone) !== localDate) continue
      fixtures.push(await upsertNormalizedFixture(store, football, league, nf, timezone))
    }
  }
  return { fixtures, counts: { leagues: leagues.length, fixtures: fixtures.length }, credits: football.lastQuota || null }
}

/** Season history for a league (cached: skipped when synced in the last `maxAgeHours`). */
export async function syncLeagueHistory(store, football, leagueKey, timezone, { maxAgeHours = 24 } = {}) {
  const [league] = await ensureLeagues(store, football, [leagueKey])
  if (!league?.providerIds?.[football.name]) return { skipped: true, reason: 'no provider id' }
  if (football.name === 'demo') return { skipped: true, reason: 'demo history is seeded' }
  if (league.historySyncedAt && (Date.now() - new Date(league.historySyncedAt).getTime()) / 3.6e6 < maxAgeHours) return { skipped: true, reason: 'fresh' }
  const list = await football.fixturesBySeason({ leagueId: league.providerIds[football.name], season: league.season })
  let n = 0
  for (const nf of list) { await upsertNormalizedFixture(store, football, league, nf, timezone); n++ }
  await store.upsertLeague({ key: league.key, historySyncedAt: new Date().toISOString() })
  return { counts: { fixtures: n }, credits: football.lastQuota || null }
}

/** Refresh status/score for specific fixtures (results job). */
export async function refreshResults(store, football, fixtureIds) {
  if (!fixtureIds.length) return { updated: [] }
  const mappings = football.name === 'demo' ? fixtureIds.map(id => ({ externalId: id, internalId: id })) : (await store.listMappings()).filter(m => m.provider === football.name && m.entityType === 'fixture' && fixtureIds.includes(m.internalId))
  const fresh = await football.fixturesByIds(mappings.map(m => m.externalId))
  const updated = []
  const now = new Date().toISOString()
  for (const nf of fresh) {
    const m = mappings.find(x => x.externalId === nf.externalId)
    if (!m) continue
    updated.push(await store.upsertFixture({ id: m.internalId, status: nf.status, ftHome: nf.ftHome, ftAway: nf.ftAway, sourceUpdatedAt: now, fetchedAt: now }))
  }
  return { updated, counts: { fixtures: updated.length }, credits: football.lastQuota || null }
}

/** Store fresh quotes for fixtures via the odds provider. Returns per-fixture mapping + count. */
export async function refreshQuotes(store, odds, fixtures) {
  const results = await odds.quotesForFixtures(fixtures)
  let n = 0
  for (const r of results) {
    for (const q of r.quotes) { await store.insertQuote({ ...q, fetchedAt: q.fetchedAt || new Date().toISOString() }); n++ }
    if (r.mapping === 'unverified') await store.upsertFixture({ id: r.fixtureId, mappingVerified: false })
  }
  return { results, counts: { quotes: n }, credits: odds.lastQuota || null }
}
