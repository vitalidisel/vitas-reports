import { handler, readJson } from '../../../../../../lib/pilot30/server.js'
import { commitTicket } from '../../../../../../lib/pilot30/services/tickets.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (req, ctx, params) => {
  const body = await readJson(req)
  const r = await commitTicket({ store: ctx.store, pilot: ctx.pilot, ownerId: ctx.ownerId, ticketId: params.id, now: ctx.now, timezone: ctx.timezone, confirmedOdds: body.confirmedOdds || null, actor: 'user' })
  return { ticket: r.ticket, alreadyCommitted: r.alreadyCommitted }
}, { needPilot: true })
