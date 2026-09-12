// Provider wiring per environment and pilot configuration.
import { detectEnvironment } from '../config.js'
import { ApiFootballAdapter } from '../adapters/apiFootball.js'
import { TheOddsApiAdapter, SPORT_HINTS } from '../adapters/theOddsApi.js'
import { WinnerOddsProvider } from '../adapters/winner.js'
import { matchFixture } from '../adapters/normalize.js'
import { DemoFootballProvider, DemoOddsProvider } from '../demo/providers.js'
import { now as clockNow } from '../clock.js'

/** Odds API wrapped to the internal `quotesForFixtures` surface with explicit fixture matching. */
export class OddsApiQuoteProvider {
  constructor(adapter, { bookmaker, store }) { this.adapter = adapter; this.bookmaker = bookmaker; this.store = store }
  get name() { return 'the-odds-api' }
  get available() { return true }
  get lastQuota() { return this.adapter.lastQuota }
  async quotesForFixtures(fixtures) {
    const out = []
    const leagueKeys = [...new Set(fixtures.map(f => f.leagueKey))]
    const sports = await this.adapter.discoverSports(leagueKeys)
    const teams = new Map((await this.store.listTeams()).map(t => [t.id, t]))
    for (const leagueKey of leagueKeys) {
      const sportKey = sports[leagueKey]
      if (!sportKey) { for (const f of fixtures.filter(x => x.leagueKey === leagueKey)) out.push({ fixtureId: f.id, mapping: null, quotes: [], reason: `אין sport key פעיל ב-The Odds API עבור ${leagueKey} (רמז: ${SPORT_HINTS[leagueKey] || '—'})` }); continue }
      const events = await this.adapter.odds({ sportKey, bookmakers: this.bookmaker })
      for (const f of fixtures.filter(x => x.leagueKey === leagueKey)) {
        const fx = { ...f, homeTeamName: teams.get(f.homeTeamId)?.name, awayTeamName: teams.get(f.awayTeamId)?.name }
        let best = null
        for (const ev of events) { const q = matchFixture(fx, { ...ev, leagueKey }); if (q === 'auto') { best = { ev, q }; break } if (q === 'unverified' && !best) best = { ev, q } }
        if (!best) { out.push({ fixtureId: f.id, mapping: null, quotes: [], reason: 'לא נמצא אירוע תואם אצל ספק היחסים' }); continue }
        await this.store.upsertMapping({ provider: 'the-odds-api', entityType: 'fixture', externalId: best.ev.externalId, internalId: f.id, verification: best.q, meta: { home: best.ev.homeTeamName, away: best.ev.awayTeamName, kickoffUtc: best.ev.kickoffUtc } })
        const quotes = best.q === 'auto' ? best.ev.quotes.filter(q => q.bookmaker === this.bookmaker).map(q => ({ ...q, fixtureId: f.id, fetchedAt: new Date().toISOString(), dataMode: 'live' })) : []
        out.push({ fixtureId: f.id, mapping: best.q, quotes, reason: best.q === 'auto' ? null : 'התאמה עמומה — נעצרה לבדיקה' })
      }
    }
    return out
  }
}

export function getProviders({ env = process.env, config = null, store = null, fetchImpl } = {}) {
  const info = detectEnvironment(env)
  if (info.dataMode === 'demo') {
    return { dataMode: 'demo', football: new DemoFootballProvider({ timezone: info.timezone, now: () => clockNow(env) }), odds: new DemoOddsProvider({ now: () => clockNow(env) }), winner: new WinnerOddsProvider(), oddsSource: 'demo', blocked: null }
  }
  const football = env.API_FOOTBALL_KEY ? new ApiFootballAdapter({ apiKey: env.API_FOOTBALL_KEY, fetchImpl, timezone: info.timezone }) : null
  const winner = new WinnerOddsProvider()
  const source = config?.oddsSource || 'winner'
  let odds = null, blocked = null
  if (source === 'winner') blocked = 'אין מקור מאומת ליחסי ווינר — הרכבת טופס ווינר חסומה. ניתן לבחור בהגדרות פיילוט market-paper עם The Odds API.'
  else if (source === 'odds-api') {
    if (!env.ODDS_API_KEY) blocked = 'ODDS_API_KEY חסר — לא ניתן למשוך יחסים מ-The Odds API.'
    else if (!config?.bookmaker) blocked = 'לא נבחר מפעיל ב-The Odds API בהגדרות.'
    else odds = new OddsApiQuoteProvider(new TheOddsApiAdapter({ apiKey: env.ODDS_API_KEY, fetchImpl }), { bookmaker: config.bookmaker, store })
  } else blocked = `מקור יחסים לא מוכר: ${source}`
  return { dataMode: 'live', football, odds, winner, oddsSource: source, blocked }
}
