import { handler } from '../../../../../lib/pilot30/server.js'
import { endPilot } from '../../../../../lib/pilot30/services/pilot.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (_req, ctx) => ({ pilot: await endPilot(ctx.store, ctx.pilot) }), { needPilot: true })
