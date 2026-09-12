// Contract tests against sample provider responses (no network). Real smoke calls need real keys.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ApiFootballAdapter, parseEnvelope, normalizeFixture } from '../../lib/pilot30/adapters/apiFootball.js'
import { TheOddsApiAdapter, normalizeEvent } from '../../lib/pilot30/adapters/theOddsApi.js'
import { WinnerOddsProvider } from '../../lib/pilot30/adapters/winner.js'
import { matchFixture, normalizeTeamName } from '../../lib/pilot30/adapters/normalize.js'
import { fetchJson, ProviderError } from '../../lib/pilot30/adapters/http.js'
import { redact } from '../../lib/pilot30/auth.js'

const load = f => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'))
const fakeFetch = (routes) => async (url, opts) => {
  const u = new URL(url)
  const hit = routes.find(r => u.pathname.endsWith(r.path))
  if (!hit) return { ok: false, status: 404, text: async () => 'not found', headers: new Headers() }
  hit.calls = (hit.calls || 0) + 1; hit.lastUrl = url; hit.lastHeaders = opts.headers
  return { ok: true, status: 200, text: async () => JSON.stringify(hit.body), headers: new Headers(hit.headers || {}) }
}

test('api-football: key goes in the header, envelope errors surface, fixtures normalise with 90-minute score', async () => {
  const routes = [{ path: '/fixtures', body: load('api-football-fixtures.json'), headers: { 'x-ratelimit-requests-limit': '100', 'x-ratelimit-requests-remaining': '97' } }, { path: '/leagues', body: load('api-football-leagues.json') }]
  const a = new ApiFootballAdapter({ apiKey: 'k-test', fetchImpl: fakeFetch(routes) })
  const fx = await a.fixturesByDate({ leagueId: 39, season: 2026, date: '2026-09-12' })
  assert.equal(routes[0].lastHeaders['x-apisports-key'], 'k-test')
  assert.ok(!routes[0].lastUrl.includes('k-test'), 'key must not be in the URL')
  assert.equal(fx.length, 2)
  assert.equal(fx[0].externalId, '1234567'); assert.equal(fx[0].status, 'NS'); assert.equal(fx[0].localDate, '2026-09-12'); assert.equal(fx[0].kickoffUtc, '2026-09-12T14:00:00.000Z')
  assert.equal(fx[1].status, 'AET'); assert.equal(fx[1].ftHome, 1); assert.equal(fx[1].ftAway, 1) // fulltime, not extratime
  assert.equal(a.lastQuota.remaining, '97')
  const leagues = await a.discoverLeagues([{ key: 'premier-league', name: 'Premier League', country: 'England' }])
  assert.equal(leagues[0].providerId, 39); assert.equal(leagues[0].season, 2026); assert.equal(leagues[0].coverage.fixtures.lineups, true)
  assert.throws(() => parseEnvelope(load('api-football-error.json')), /Missing application key/)
})

test('the-odds-api: apiKey param, event normalisation keeps only the 2.5 line and mapped markets', async () => {
  const routes = [{ path: '/v4/sports', body: load('odds-api-sports.json') }, { path: '/v4/sports/soccer_epl/odds', body: load('odds-api-odds.json'), headers: { 'x-requests-remaining': '480', 'x-requests-used': '20' } }]
  const a = new TheOddsApiAdapter({ apiKey: 'odds-secret', fetchImpl: fakeFetch(routes) })
  const sports = await a.discoverSports(['premier-league', 'la-liga', 'serie-a', 'ligue-1'])
  assert.deepEqual(sports, { 'premier-league': 'soccer_epl', 'la-liga': 'soccer_spain_la_liga', 'serie-a': null, 'ligue-1': null })
  const events = await a.odds({ sportKey: 'soccer_epl', bookmakers: 'pinnacle' })
  assert.ok(routes[1].lastUrl.includes('apiKey=odds-secret'))
  assert.equal(events.length, 1)
  const q = events[0].quotes
  assert.deepEqual(q.filter(x => x.bookmaker === 'pinnacle').map(x => `${x.market}:${x.selection}:${x.odds}`).sort(), ['1X2:away:2.45', '1X2:draw:3.55', '1X2:home:2.9', 'BTTS:no:2.2', 'BTTS:yes:1.66', 'OU25:over:1.83', 'OU25:under:2.05'].sort())
  assert.ok(q.every(x => x.sourceUpdatedAt))
  assert.equal(a.lastQuota.remaining, '480')
  assert.equal(redact('failed https://x/?apiKey=odds-secret&x=1', { ODDS_API_KEY: 'odds-secret' }), 'failed https://x/?apiKey=[redacted]&x=1')
})

test('fixture matching: exact league+names+kickoff → auto; partial → unverified; other league → null', () => {
  const fx = { leagueKey: 'premier-league', kickoffUtc: '2026-09-12T14:00:00Z', homeTeamName: 'Manchester United', awayTeamName: 'Liverpool' }
  const ev = normalizeEvent(load('odds-api-odds.json')[0])
  assert.equal(matchFixture(fx, { ...ev, leagueKey: 'premier-league' }), 'auto')
  assert.equal(matchFixture({ ...fx, awayTeamName: 'Everton' }, { ...ev, leagueKey: 'premier-league' }), 'unverified')
  assert.equal(matchFixture(fx, { ...ev, leagueKey: 'la-liga' }), null)
  assert.equal(matchFixture(fx, { ...ev, leagueKey: 'premier-league', kickoffUtc: '2026-09-12T19:00:00Z' }), 'unverified')
  assert.equal(normalizeTeamName('Manchester United FC'), 'manchester united')
  assert.equal(normalizeTeamName('Atlético de Madrid'), 'atletico madrid')
})

test('winner provider is explicitly unavailable', async () => {
  const w = new WinnerOddsProvider()
  assert.equal(w.available, false)
  assert.equal(w.status.feasibility.result, 'unavailable')
  await assert.rejects(() => w.odds(), /unavailable/)
})

test('http client retries 5xx/429 with backoff and gives up on 4xx', async () => {
  let n = 0
  const flaky = async () => { n++; return { ok: n >= 3, status: n >= 3 ? 200 : 503, text: async () => (n >= 3 ? '{"ok":1}' : 'down'), headers: new Headers() } }
  const r = await fetchJson('https://x/', { fetchImpl: flaky, retries: 3, backoffMs: 1 })
  assert.equal(r.json.ok, 1); assert.equal(n, 3)
  let m = 0
  await assert.rejects(() => fetchJson('https://x/', { fetchImpl: async () => { m++; return { ok: false, status: 401, text: async () => 'nope', headers: new Headers() } }, retries: 3, backoffMs: 1 }), e => e instanceof ProviderError && e.status === 401)
  assert.equal(m, 1)
})
