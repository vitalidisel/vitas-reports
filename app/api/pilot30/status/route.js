// Public (no secrets): which integrations are configured, data mode, Winner feasibility result.
import { detectEnvironment } from '../../../../lib/pilot30/config.js'
import { FEASIBILITY_CHECK } from '../../../../lib/pilot30/adapters/winner.js'
export const dynamic = 'force-dynamic'
export async function GET() {
  const env = detectEnvironment()
  return Response.json({ ok: true, dataMode: env.dataMode, timezone: env.timezone, connections: env.connections, winner: FEASIBILITY_CHECK, supabase: env.dataMode === 'live' ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } : null })
}
