// ~75 and ~45 minutes before kickoff of candidate fixtures: refresh lineups status (no invention when missing).
import { handler } from '../../../../../lib/pilot30/server.js'
import { runJob } from '../../../../../lib/pilot30/jobs/runner.js'
import { localDateOf } from '../../../../../lib/pilot30/time.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export const GET = handler(async (_req, ctx) => {
  if (!ctx.pilot || !ctx.providers.football) return { skipped: 'no pilot or provider' }
  const day = await ctx.store.getDay(ctx.pilot.id, localDateOf(ctx.now, ctx.timezone))
  const ticket = day?.ticketId ? await ctx.store.getTicket(day.ticketId) : null
  if (!ticket) return { skipped: 'no candidate ticket today' }
  const r = await runJob(ctx.store, { provider: ctx.providers.football.name, job: 'lineups' }, async () => {
    let n = 0
    for (const leg of ticket.legs) {
      const f = await ctx.store.getFixture(leg.fixtureId)
      const minutes = (new Date(f.kickoffUtc) - ctx.now) / 60_000
      if (minutes < 0 || minutes > 90) continue
      const lineups = await ctx.providers.football.lineups(f.id.replace(/^af-/, ''))
      await ctx.store.upsertFixture({ id: f.id, lineups: { ...lineups, fetchedAt: ctx.now.toISOString() } }); n++
    }
    return { counts: { fixtures: n }, credits: ctx.providers.football.lastQuota || null }
  })
  return r
}, { cron: true })
