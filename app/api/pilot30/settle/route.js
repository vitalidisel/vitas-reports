import { handler } from '../../../../lib/pilot30/server.js'
import { settleOpenTickets } from '../../../../lib/pilot30/services/settle.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (_req, ctx) => settleOpenTickets({ store: ctx.store, pilot: ctx.pilot, football: ctx.providers.football, now: ctx.now }), { needPilot: true })
