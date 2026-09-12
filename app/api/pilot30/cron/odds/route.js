// Odds + analysis + candidate: runs the daily scan (before analysis / before commitment).
import { handler } from '../../../../../lib/pilot30/server.js'
import { runDailyScan } from '../../../../../lib/pilot30/services/scan.js'
import { commitTicket } from '../../../../../lib/pilot30/services/tickets.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = handler(async (_req, ctx) => {
  if (!ctx.pilot) return { skipped: 'no active pilot' }
  const scan = await runDailyScan({ store: ctx.store, providers: ctx.providers, pilot: ctx.pilot, ownerId: ctx.ownerId, now: ctx.now, timezone: ctx.timezone })
  let auto = null
  if (scan.status === 'candidate' && ctx.pilot.mode === 'paper' && ctx.pilot.config.commitmentPolicy === 'auto-sim') {
    try { auto = await commitTicket({ store: ctx.store, pilot: ctx.pilot, ownerId: ctx.ownerId, ticketId: scan.ticket.id, now: ctx.now, timezone: ctx.timezone, actor: 'auto' }) } catch (e) { auto = { error: e.message } }
  }
  return { scan: { status: scan.status, reason: scan.reason || null, fixtures: scan.fixtures, candidates: scan.candidates }, auto }
}, { cron: true })
