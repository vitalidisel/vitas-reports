// 09:00 Israel: discover today's fixtures + refresh league history cache (cheap when fresh).
import { handler } from '../../../../../lib/pilot30/server.js'
import { runJob } from '../../../../../lib/pilot30/jobs/runner.js'
import { syncFixturesForDate, syncLeagueHistory } from '../../../../../lib/pilot30/services/sync.js'
import { localDateOf } from '../../../../../lib/pilot30/time.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = handler(async (_req, ctx) => {
  if (!ctx.pilot) return { skipped: 'no active pilot' }
  if (!ctx.providers.football) return { skipped: 'no football provider' }
  const date = localDateOf(ctx.now, ctx.timezone)
  const history = []
  for (const key of ctx.pilot.config.leagues) history.push(await runJob(ctx.store, { provider: ctx.providers.football.name, job: `history:${key}` }, () => syncLeagueHistory(ctx.store, ctx.providers.football, key, ctx.timezone)))
  const fixtures = await runJob(ctx.store, { provider: ctx.providers.football.name, job: `fixtures:${date}` }, () => syncFixturesForDate(ctx.store, ctx.providers.football, ctx.pilot.config.leagues, date, ctx.timezone))
  if (fixtures.ok && fixtures.counts?.fixtures === 0) { const d = await ctx.store.getDay(ctx.pilot.id, date); if (!d) await ctx.store.upsertDay({ pilotId: ctx.pilot.id, localDate: date, dayNumber: 0, status: 'no_fixtures', reason: 'אין משחקים היום בליגות שנבחרו' }) }
  return { date, fixtures, history }
}, { cron: true })
