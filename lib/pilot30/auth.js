// Owner-only access. Live mode: Supabase session token → auth.getUser → must equal OWNER_USER_ID.
// Demo mode (no database): a fixed demo owner; nothing private exists in that mode.
import { createClient } from '@supabase/supabase-js'
import { detectEnvironment } from './config.js'

export const DEMO_OWNER_ID = 'demo-owner'

export class HttpError extends Error { constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra } }

export async function requireOwner(request, env = process.env) {
  const envInfo = detectEnvironment(env)
  if (envInfo.dataMode === 'demo') return { ownerId: DEMO_OWNER_ID, dataMode: 'demo', envInfo }
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new HttpError(401, 'נדרשת התחברות')
  if (!env.OWNER_USER_ID) throw new HttpError(503, 'OWNER_USER_ID לא מוגדר בשרת')
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, 'ההתחברות אינה תקפה')
  if (data.user.id !== env.OWNER_USER_ID) throw new HttpError(403, 'המשתמש אינו הבעלים של הפיילוט')
  return { ownerId: data.user.id, email: data.user.email, dataMode: 'live', envInfo }
}

export function requireCron(request, env = process.env) {
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.replace(/^Bearer\s+/i, '').trim()
  if (!env.CRON_SECRET || bearer !== env.CRON_SECRET) throw new HttpError(401, 'Unauthorized')
  return { ownerId: env.OWNER_USER_ID || DEMO_OWNER_ID }
}

/** Uniform JSON error envelope for route handlers. */
export function toResponse(err) {
  if (err instanceof HttpError) return Response.json({ ok: false, error: err.message, ...err.extra }, { status: err.status })
  const code = err?.code
  const status = code === 'not_found' ? 404 : code ? 409 : 500
  return Response.json({ ok: false, error: redact(err?.message || 'שגיאה פנימית'), code: code || null }, { status })
}

const SECRET_NAMES = ['API_FOOTBALL_KEY', 'ODDS_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']
/** Strip any configured secret value from a string before it reaches logs or responses. */
export function redact(text, env = process.env) {
  let out = String(text)
  for (const n of SECRET_NAMES) { const v = env[n]; if (v && v.length >= 6) out = out.split(v).join(`[${n}]`) }
  return out.replace(/apiKey=[^&\s]+/gi, 'apiKey=[redacted]')
}
