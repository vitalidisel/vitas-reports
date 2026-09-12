import { handler } from '../../../../lib/pilot30/server.js'
import { dayBoundsUtc, localDateOf, isLocalDate } from '../../../../lib/pilot30/time.js'
export const dynamic = 'force-dynamic'
export const GET = handler(async (req, ctx) => {
  const url = new URL(req.url)
  const date = isLocalDate(url.searchParams.get('date')) ? url.searchParams.get('date') : localDateOf(ctx.now, ctx.timezone)
  const leagues = ctx.pilot?.config.leagues || null
  const { startUtc, endUtc } = dayBoundsUtc(date, ctx.timezone)
  const dataMode = ctx.envInfo.dataMode === 'demo' ? 'demo' : 'live'
  const fixtures = await ctx.store.listFixtures({ leagueKeys: leagues, fromUtc: startUtc.toISOString(), toUtc: endUtc.toISOString(), dataMode })
  const teams = new Map((await ctx.store.listTeams()).map(t => [t.id, t]))
  const leaguesById = new Map((await ctx.store.listLeagues()).map(l => [l.key, l]))
  const quotes = await ctx.store.latestQuotes(fixtures.map(f => f.id), { bookmaker: ctx.pilot?.config.bookmaker || null })
  const day = ctx.pilot ? await ctx.store.getDay(ctx.pilot.id, date) : null
  const excluded = new Map((day?.scan?.excluded || []).map(e => [e.fixtureId, e]))
  const list = []
  for (const f of fixtures) {
    const analysis = await ctx.store.latestAnalysis(f.id)
    const q = quotes.filter(x => x.fixtureId === f.id)
    list.push({ id: f.id, leagueKey: f.leagueKey, leagueName: leaguesById.get(f.leagueKey)?.nameHe || f.leagueKey, kickoffUtc: f.kickoffUtc, status: f.status, ftHome: f.ftHome, ftAway: f.ftAway, homeTeam: teams.get(f.homeTeamId)?.nameHe || teams.get(f.homeTeamId)?.name || f.homeTeamId, awayTeam: teams.get(f.awayTeamId)?.nameHe || teams.get(f.awayTeamId)?.name || f.awayTeamId, mappingVerified: f.mappingVerified !== false, quotes: q.length, quoteUpdatedAt: q.length ? q.map(x => x.sourceUpdatedAt).sort().slice(-1)[0] : null, analysed: Boolean(analysis), hasProbability: Boolean(analysis?.probabilities), lineups: f.lineups?.status || 'unknown', excluded: excluded.get(f.id) || null, dataMode: f.dataMode })
  }
  return { date, fixtures: list, lastSync: (await ctx.store.listRuns({ limit: 20 })).find(r => r.job === `fixtures:${date}`) || null, dataMode: ctx.envInfo.dataMode, leagues: [...leaguesById.values()].filter(l => !leagues || leagues.includes(l.key)).map(l => ({ key: l.key, nameHe: l.nameHe || l.name })) }
})
