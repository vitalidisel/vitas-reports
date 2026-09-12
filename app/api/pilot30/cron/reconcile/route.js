// Next morning: reconcile open tickets / result corrections; flags pending_review tickets for the owner.
import { handler } from '../../../../../lib/pilot30/server.js'
import { runJob } from '../../../../../lib/pilot30/jobs/runner.js'
import { settleOpenTickets } from '../../../../../lib/pilot30/services/settle.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export const GET = handler(async (_req, ctx) => {
  if (!ctx.pilot) return { skipped: 'no active pilot' }
  return runJob(ctx.store, { provider: ctx.providers.football?.name || 'none', job: 'reconcile' }, async () => {
    const s = await settleOpenTickets({ store: ctx.store, pilot: ctx.pilot, football: ctx.providers.football, now: ctx.now })
    const review = (await ctx.store.listTickets(ctx.pilot.id)).filter(t => t.state === 'pending_review').map(t => t.id)
    return { ...s, counts: { ...s.counts, pendingReview: review.length }, pendingReview: review }
  })
}, { cron: true })
