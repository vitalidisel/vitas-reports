import { handler } from '../../../../lib/pilot30/server.js'
import { todayPayload } from '../../../../lib/pilot30/services/today.js'
export const dynamic = 'force-dynamic'
export const GET = handler(async (_req, ctx) => todayPayload({ store: ctx.store, pilot: ctx.pilot, providers: ctx.providers, now: ctx.now, timezone: ctx.timezone, envInfo: ctx.envInfo }))
