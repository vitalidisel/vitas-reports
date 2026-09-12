// Store selection: Supabase when configured, otherwise the in-memory demo store.
import { detectEnvironment } from '../config.js'
import { getMemoryStore } from './memory.js'
import { now as clockNow } from '../clock.js'

export async function getStore(env = process.env) {
  const { dataMode } = detectEnvironment(env)
  if (dataMode === 'demo') {
    const store = getMemoryStore()
    if (!store.seededAt) { const { seedDemo } = await import('../demo/seed.js'); await seedDemo(store, { now: clockNow(env), timezone: detectEnvironment(env).timezone }) }
    return store
  }
  if (!globalThis.__pilot30SupabaseStore) {
    const { SupabaseStore } = await import('./supabase.js')
    globalThis.__pilot30SupabaseStore = new SupabaseStore(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  }
  return globalThis.__pilot30SupabaseStore
}
