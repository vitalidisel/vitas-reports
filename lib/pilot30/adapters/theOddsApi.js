// The Odds API v4. Key is the `apiKey` query parameter (server only, redacted from errors/logs).
// Optional comparison source / market-paper pilot. Never presented as Winner odds.
import { fetchJson, ProviderError } from './http.js'

export const PROVIDER = 'the-odds-api'
const BASE = 'https://api.the-odds-api.com'
// Discovered at runtime via /v4/sports; this is only a hint used to pick the right sport for a league key.
export const SPORT_HINTS = Object.freeze({ 'premier-league': 'soccer_epl', 'la-liga': 'soccer_spain_la_liga', bundesliga: 'soccer_germany_bundesliga', 'serie-a': 'soccer_italy_serie_a', 'ligue-1': 'soccer_france_ligue_one' })
const MARKET_MAP = Object.freeze({ h2h: '1X2', totals: 'OU25', btts: 'BTTS' })

export class TheOddsApiAdapter {
  constructor({ apiKey, fetchImpl } = {}) {
    if (!apiKey) throw new ProviderError('ODDS_API_KEY missing', { provider: PROVIDER })
    this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.lastQuota = null
  }
  get name() { return PROVIDER }
  async _get(path, params = {}) {
    const url = new URL(BASE + path)
    url.searchParams.set('apiKey', this.apiKey)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    const { json, headers } = await fetchJson(url.toString(), { provider: PROVIDER, fetchImpl: this.fetchImpl })
    this.lastQuota = { remaining: headers.get('x-requests-remaining'), used: headers.get('x-requests-used'), at: new Date().toISOString() }
    return json
  }
  async sports() { return (await this._get('/v4/sports')).map(s => ({ key: s.key, title: s.title, group: s.group, active: s.active })) }
  /** Verified sport keys for our league keys (only those present and active in /v4/sports). */
  async discoverSports(leagueKeys) {
    const all = await this.sports()
    return Object.fromEntries(leagueKeys.map(k => [k, all.find(s => s.key === SPORT_HINTS[k] && s.active)?.key ?? null]))
  }
  /** Decimal odds for a sport. Returns normalised quotes grouped per event. */
  async odds({ sportKey, regions = 'eu', markets = 'h2h,totals,btts', bookmakers = null }) {
    const params = { regions, markets, oddsFormat: 'decimal', dateFormat: 'iso' }
    if (bookmakers) params.bookmakers = bookmakers
    const events = await this._get(`/v4/sports/${sportKey}/odds`, params)
    return events.map(normalizeEvent)
  }
}

/** Convert one Odds API event into {event, quotes[]}. Unsupported markets/points are skipped, never guessed. */
export function normalizeEvent(ev) {
  const quotes = []
  for (const b of ev.bookmakers || []) {
    for (const m of b.markets || []) {
      const market = MARKET_MAP[m.key]
      if (!market) continue
      for (const o of m.outcomes || []) {
        let selection = null, line = null
        if (market === '1X2') selection = o.name === ev.home_team ? 'home' : o.name === ev.away_team ? 'away' : /draw/i.test(o.name) ? 'draw' : null
        else if (market === 'OU25') { if (o.point !== 2.5) continue; line = 2.5; selection = /^over$/i.test(o.name) ? 'over' : /^under$/i.test(o.name) ? 'under' : null }
        else if (market === 'BTTS') selection = /^yes$/i.test(o.name) ? 'yes' : /^no$/i.test(o.name) ? 'no' : null
        if (!selection || typeof o.price !== 'number') continue
        quotes.push({ bookmaker: b.key, bookmakerTitle: b.title, market, line, selection, odds: String(o.price), sourceUpdatedAt: m.last_update || b.last_update || null, status: 'active', source: PROVIDER })
      }
    }
  }
  return { externalId: ev.id, sportKey: ev.sport_key, kickoffUtc: new Date(ev.commence_time).toISOString(), homeTeamName: ev.home_team, awayTeamName: ev.away_team, quotes }
}
