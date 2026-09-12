import { handler } from '../../../../lib/pilot30/server.js'
import { trackingSummary } from '../../../../lib/pilot30/services/tracking.js'
export const dynamic = 'force-dynamic'
export const GET = handler(async (_req, ctx) => ({ ...(await trackingSummary({ store: ctx.store, pilot: ctx.pilot, now: ctx.now, timezone: ctx.timezone })), pilot: { id: ctx.pilot.id, mode: ctx.pilot.mode, startDate: ctx.pilot.startDate, durationDays: ctx.pilot.durationDays }, dataMode: ctx.envInfo.dataMode }), { needPilot: true })
