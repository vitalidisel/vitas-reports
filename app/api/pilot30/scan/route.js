import { handler } from '../../../../lib/pilot30/server.js'
import { runDailyScan } from '../../../../lib/pilot30/services/scan.js'
import { todayPayload } from '../../../../lib/pilot30/services/today.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const POST = handler(async (_req, ctx) => {
  const scan = await runDailyScan({ store: ctx.store, providers: ctx.providers, pilot: ctx.pilot, ownerId: ctx.ownerId, now: ctx.now, timezone: ctx.timezone })
  const today = await todayPayload({ store: ctx.store, pilot: ctx.pilot, providers: ctx.providers, now: ctx.now, timezone: ctx.timezone, envInfo: ctx.envInfo })
  return { scan: { status: scan.status, reason: scan.reason || null, fixtures: scan.fixtures, candidates: scan.candidates, search: scan.search || null, excluded: scan.excluded || [], note: scan.note || null }, today }
}, { needPilot: true })
