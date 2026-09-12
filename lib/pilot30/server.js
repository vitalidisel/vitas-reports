// Next.js glue: resolves store, environment, owner and providers for a request; uniform error envelope.
import { requireOwner, requireCron, toResponse, HttpError } from './auth.js'
import { getStore } from './store/index.js'
import { getProviders } from './services/providers.js'
import { detectEnvironment } from './config.js'
import { now as clockNow } from './clock.js'

export async function context(request, { cron = false, needPilot = false } = {}) {
  const envInfo = detectEnvironment()
  const who = cron ? requireCron(request) : await requireOwner(request)
  const store = await getStore()
  const pilot = await store.getActivePilot(who.ownerId)
  if (needPilot && !pilot) throw new HttpError(404, 'אין פיילוט פעיל. פתח פיילוט במסך ההגדרות.', { code: 'no_pilot' })
  const providers = getProviders({ config: pilot?.config || null, store })
  return { envInfo, ownerId: who.ownerId, store, pilot, providers, timezone: envInfo.timezone, now: clockNow() }
}

/** Wrap a handler: `(request, ctx, routeParams) => any` → Response with error handling. */
export function handler(fn, opts = {}) {
  return async (request, route) => {
    try {
      const ctx = await context(request, opts)
      const out = await fn(request, ctx, await resolveParams(route))
      return out instanceof Response ? out : Response.json({ ok: true, ...out })
    } catch (e) { return toResponse(e) }
  }
}
async function resolveParams(route) { const p = route?.params; return p && typeof p.then === 'function' ? await p : p || {} }

export async function readJson(request) { try { return await request.json() } catch { return {} } }
