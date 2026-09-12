// API-Football (API-Sports direct). Base https://v3.football.api-sports.io, key in x-apisports-key (server only).
// League/season ids are discovered at runtime, never hard-coded. HTTP 200 may still carry `errors`.
import { fetchJson, ProviderError } from './http.js'
import { LEAGUE_CATALOG } from '../config.js'
import { localDateOf } from '../time.js'

export const PROVIDER = 'api-football'
const BASE = 'https://v3.football.api-sports.io'

export class ApiFootballAdapter {
  constructor({ apiKey, fetchImpl, timezone = 'Asia/Jerusalem' } = {}) {
    if (!apiKey) throw new ProviderError('API_FOOTBALL_KEY missing', { provider: PROVIDER })
    this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.timezone = timezone; this.lastQuota = null
  }
  get name() { return PROVIDER }
  async _get(path, params = {}) {
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    const { json, headers } = await fetchJson(url.toString(), { headers: { 'x-apisports-key': this.apiKey }, provider: PROVIDER, fetchImpl: this.fetchImpl })
    this.lastQuota = { limit: headers.get('x-ratelimit-requests-limit'), remaining: headers.get('x-ratelimit-requests-remaining'), at: new Date().toISOString() }
    return parseEnvelope(json)
  }
  /** Discover league ids and current seasons for the catalog; returns [{key, providerId, season, coverage}]. */
  async discoverLeagues(catalog = LEAGUE_CATALOG) {
    const out = []
    for (const league of catalog) {
      const { response } = await this._get('/leagues', { name: league.name, country: league.country, type: 'league' })
      const hit = response.find(r => r.league?.type === 'League' && r.country?.name === league.country) || response[0]
      if (!hit) { out.push({ key: league.key, providerId: null, season: null, coverage: null, error: 'league not found' }); continue }
      const season = hit.seasons?.find(s => s.current) || hit.seasons?.slice(-1)[0]
      out.push({ key: league.key, providerId: hit.league.id, season: season?.year ?? null, coverage: season?.coverage ?? null, providerName: hit.league.name })
    }
    return out
  }
  /** Fixtures for one league/season/date (date in the provider's timezone param). */
  async fixturesByDate({ leagueId, season, date }) {
    const { response } = await this._get('/fixtures', { league: leagueId, season, date, timezone: this.timezone })
    return response.map(r => normalizeFixture(r, this.timezone))
  }
  /** All fixtures of a league season (history). */
  async fixturesBySeason({ leagueId, season }) {
    const { response } = await this._get('/fixtures', { league: leagueId, season, timezone: this.timezone })
    return response.map(r => normalizeFixture(r, this.timezone))
  }
  async fixturesByIds(ids) {
    const out = []
    for (let i = 0; i < ids.length; i += 20) {
      const { response } = await this._get('/fixtures', { ids: ids.slice(i, i + 20).join('-'), timezone: this.timezone })
      out.push(...response.map(r => normalizeFixture(r, this.timezone)))
    }
    return out
  }
  async lineups(fixtureId) {
    const { response } = await this._get('/fixtures/lineups', { fixture: fixtureId })
    if (!response.length) return { status: 'not_published', teams: [] }
    return { status: 'published', teams: response.map(t => ({ teamId: String(t.team?.id), formation: t.formation ?? null, startXI: (t.startXI || []).map(p => p.player?.name).filter(Boolean) })) }
  }
  async injuries({ leagueId, season, date }) {
    const { response } = await this._get('/injuries', { league: leagueId, season, date })
    return response.map(r => ({ fixtureId: String(r.fixture?.id), teamId: String(r.team?.id), player: r.player?.name, reason: r.player?.reason ?? null, type: r.player?.type ?? null }))
  }
  async standings({ leagueId, season }) {
    const { response } = await this._get('/standings', { league: leagueId, season })
    const table = response[0]?.league?.standings?.[0] || []
    return table.map(r => ({ rank: r.rank, teamId: String(r.team?.id), points: r.points, played: r.all?.played ?? null, goalsFor: r.all?.goals?.for ?? null, goalsAgainst: r.all?.goals?.against ?? null }))
  }
  async bookmakers() { const { response } = await this._get('/odds/bookmakers'); return response.map(b => ({ id: b.id, name: b.name })) }
  /** One smoke call to validate the key: returns account status without the key. */
  async smoke() { const { response, errors } = await this._get('/status'); return { ok: !errors.length, account: response?.account?.firstname ? 'present' : 'unknown', subscription: response?.subscription?.plan ?? null, requests: response?.requests ?? null, errors } }
}

/** API-Football wraps everything in {get, parameters, errors, results, paging, response}; errors may be {} or []. */
export function parseEnvelope(json) {
  if (!json || typeof json !== 'object') throw new ProviderError('api-football: empty body', { provider: PROVIDER })
  const errs = json.errors
  const errors = Array.isArray(errs) ? errs : errs && typeof errs === 'object' ? Object.entries(errs).map(([k, v]) => `${k}: ${v}`) : []
  if (errors.length) throw new ProviderError(`api-football: ${errors.join('; ')}`, { provider: PROVIDER, retryable: /rate|limit/i.test(errors.join(' ')) })
  return { response: json.response || [], paging: json.paging || { current: 1, total: 1 }, results: json.results ?? (json.response || []).length, errors }
}

export function normalizeFixture(r, timezone) {
  const kickoffUtc = new Date(r.fixture.date).toISOString()
  return {
    externalId: String(r.fixture.id),
    leagueExternalId: String(r.league?.id),
    season: r.league?.season ?? null,
    kickoffUtc,
    localDate: localDateOf(new Date(kickoffUtc), timezone),
    status: r.fixture?.status?.short || 'TBD',
    homeTeam: { externalId: String(r.teams?.home?.id), name: r.teams?.home?.name },
    awayTeam: { externalId: String(r.teams?.away?.id), name: r.teams?.away?.name },
    // fulltime = 90' + injury time; extratime/penalty are separate and never used for 90' markets.
    ftHome: r.score?.fulltime?.home ?? null,
    ftAway: r.score?.fulltime?.away ?? null,
    round: r.league?.round ?? null,
    source: PROVIDER,
  }
}
