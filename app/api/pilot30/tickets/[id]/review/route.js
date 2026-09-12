import { handler, readJson } from '../../../../../../lib/pilot30/server.js'
import { resolveReview } from '../../../../../../lib/pilot30/services/tickets.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (req, ctx, params) => {
  const body = await readJson(req)
  return { ticket: await resolveReview({ store: ctx.store, pilot: ctx.pilot, ticketId: params.id, resolution: body.resolution, note: body.note || '', now: ctx.now }) }
}, { needPilot: true })
