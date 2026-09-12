import { handler, readJson } from '../../../../../lib/pilot30/server.js'
import { skipDay } from '../../../../../lib/pilot30/services/tickets.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (req, ctx) => {
  const body = await readJson(req)
  return { day: await skipDay({ store: ctx.store, pilot: ctx.pilot, now: ctx.now, timezone: ctx.timezone, reason: body.reason || '' }) }
}, { needPilot: true })
