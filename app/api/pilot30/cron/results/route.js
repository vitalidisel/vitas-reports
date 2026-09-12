// ~3h after kickoff and retries: refresh results and settle open tickets.
import { handler } from '../../../../../lib/pilot30/server.js'
import { runJob } from '../../../../../lib/pilot30/jobs/runner.js'
import { settleOpenTickets } from '../../../../../lib/pilot30/services/settle.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export const GET = handler(async (_req, ctx) => {
  if (!ctx.pilot) return { skipped: 'no active pilot' }
  return runJob(ctx.store, { provider: ctx.providers.football?.name || 'none', job: 'results' }, () => settleOpenTickets({ store: ctx.store, pilot: ctx.pilot, football: ctx.providers.football, now: ctx.now }))
}, { cron: true })
