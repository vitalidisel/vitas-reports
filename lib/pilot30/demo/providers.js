// Demo providers with the same surface as the live adapters. They only produce fictional data.
import { DEMO_LEAGUES, demoFixturesForDate, demoQuotesForFixture, DEMO_BOOKMAKER } from './seed.js'

export class DemoFootballProvider {
  constructor({ timezone = 'Asia/Jerusalem', now = () => new Date() } = {}) { this.timezone = timezone; this.now = now; this.lastQuota = null }
  get name() { return 'demo' }
  async discoverLeagues() { return DEMO_LEAGUES.map(l => ({ key: l.key, providerId: l.key, season: 2026, coverage: { lineups: true, injuries: false, statistics: false } })) }
  async fixturesByDate({ leagueId, date }) {
    return demoFixturesForDate(date, this.timezone, this.now()).filter(f => f.leagueKey === leagueId).map(f => ({
      externalId: f.id, leagueExternalId: f.leagueKey, season: f.season, kickoffUtc: f.kickoffUtc, localDate: f.localDate, status: f.status,
      homeTeam: { externalId: f.homeTeamId, name: f.homeTeamId }, awayTeam: { externalId: f.awayTeamId, name: f.awayTeamId }, ftHome: f.ftHome, ftAway: f.ftAway, source: 'demo', lineups: f.lineups,
    }))
  }
  async fixturesByIds(ids) {
    const out = []
    for (const id of ids) { const m = id.match(/^demo-(demo-[ab])-(\d{4}-\d{2}-\d{2})-/); if (!m) continue; const f = demoFixturesForDate(m[2], this.timezone, this.now()).find(x => x.id === id); if (f) out.push({ externalId: f.id, status: f.status, ftHome: f.ftHome, ftAway: f.ftAway, kickoffUtc: f.kickoffUtc, source: 'demo' }) }
    return out
  }
  async lineups(fixtureId) { return /-[036]$/.test(fixtureId) ? { status: 'published', teams: [] } : { status: 'not_published', teams: [] } }
  async smoke() { return { ok: true, demo: true } }
}

export class DemoOddsProvider {
  constructor({ now = () => new Date() } = {}) { this.now = now; this.lastQuota = null }
  get name() { return 'demo' }
  get bookmaker() { return DEMO_BOOKMAKER }
  get available() { return true }
  async quotesForFixtures(fixtures) { return fixtures.map(f => ({ fixtureId: f.id, mapping: 'auto', quotes: demoQuotesForFixture(f, this.now()) })) }
}
