import { handler, readJson } from '../../../../../lib/pilot30/server.js'
import { changeConfig } from '../../../../../lib/pilot30/services/pilot.js'
export const dynamic = 'force-dynamic'
export const POST = handler(async (req, ctx) => {
  const body = await readJson(req)
  const pilot = await changeConfig(ctx.store, ctx.pilot, body, { now: ctx.now, timezone: ctx.timezone })
  return { pilot }
}, { needPilot: true })
