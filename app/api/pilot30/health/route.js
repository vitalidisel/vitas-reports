import { handler } from '../../../../lib/pilot30/server.js'
import { FEASIBILITY_CHECK } from '../../../../lib/pilot30/adapters/winner.js'
export const dynamic = 'force-dynamic'
export const GET = handler(async (_req, ctx) => {
  const runs = await ctx.store.listRuns({ limit: 40 })
  const leagues = await ctx.store.listLeagues()
  const mappings = (await ctx.store.listMappings()).filter(m => m.verification === 'unverified')
  const models = await ctx.store.listModelRuns()
  const now = ctx.now.getTime()
  const staleThresholdH = 26
  const lastOk = job => runs.find(r => r.job.startsWith(job) && r.status === 'ok') || null
  const jobs = ['fixtures:', 'quotes:', 'results', 'lineups', 'reconcile', 'discover'].map(j => { const r = lastOk(j); return { job: j.replace(':', ''), lastOk: r?.startedAt || null, stale: r ? (now - new Date(r.startedAt).getTime()) / 3.6e6 > staleThresholdH : true, lastError: runs.find(x => x.job.startsWith(j) && x.status === 'error') || null } })
  return {
    dataMode: ctx.envInfo.dataMode, connections: ctx.envInfo.connections, winner: FEASIBILITY_CHECK, oddsBlocked: ctx.providers.blocked,
    runs: runs.map(r => ({ id: r.id, provider: r.provider, job: r.job, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status, counts: r.counts, error: r.error || null, credits: r.credits || null })),
    jobs, leagues: leagues.map(l => ({ key: l.key, nameHe: l.nameHe, season: l.season, providerIds: l.providerIds || {}, historySyncedAt: l.historySyncedAt || null })),
    unverifiedMappings: mappings, modelRuns: models.slice(0, 5), storeKind: ctx.store.kind, seededAt: ctx.store.seededAt || null,
  }
})
