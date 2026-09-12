import { handler, readJson } from '../../../../lib/pilot30/server.js'
import { createPilot, pilotState } from '../../../../lib/pilot30/services/pilot.js'
import { LEAGUE_CATALOG, DEFAULTS } from '../../../../lib/pilot30/config.js'
import { DEMO_LEAGUES } from '../../../../lib/pilot30/demo/seed.js'
export const dynamic = 'force-dynamic'

export const GET = handler(async (_req, ctx) => {
  const versions = ctx.pilot ? await ctx.store.listConfigVersions(ctx.pilot.id) : []
  const pilots = await ctx.store.listPilots(ctx.ownerId)
  return { pilot: ctx.pilot, state: pilotState(ctx.pilot, ctx.now, ctx.timezone), versions, pilots: pilots.map(p => ({ id: p.id, mode: p.mode, startDate: p.startDate, status: p.status, configVersion: p.configVersion })), defaults: DEFAULTS, leagues: ctx.envInfo.dataMode === 'demo' ? DEMO_LEAGUES : LEAGUE_CATALOG, dataMode: ctx.envInfo.dataMode, oddsBlocked: ctx.providers.blocked }
})

export const POST = handler(async (req, ctx) => {
  const body = await readJson(req)
  const pilot = await createPilot(ctx.store, ctx.ownerId, body, { dataMode: ctx.envInfo.dataMode })
  return { pilot }
})
