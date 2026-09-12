import { handler } from '../../../../../lib/pilot30/server.js'
import { trackingSummary, trackingCsv } from '../../../../../lib/pilot30/services/tracking.js'
export const dynamic = 'force-dynamic'
export const GET = handler(async (_req, ctx) => {
  const s = await trackingSummary({ store: ctx.store, pilot: ctx.pilot, now: ctx.now, timezone: ctx.timezone })
  return new Response(trackingCsv(s, ctx.pilot), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="pilot30-${ctx.pilot.mode}-${ctx.pilot.startDate}.csv"` } })
}, { needPilot: true })
