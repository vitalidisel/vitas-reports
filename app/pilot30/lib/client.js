'use client'
// Client data layer: status probe, owner session (Supabase Auth in live mode), authenticated fetch, hooks.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const Ctx = createContext(null)

export class ApiError extends Error { constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.body = body || {}; this.code = body?.code || null } }

export function Pilot30Provider({ children }) {
  const [status, setStatus] = useState(null)      // /api/pilot30/status payload
  const [statusError, setStatusError] = useState(null)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const sbRef = useRef(null)

  const refreshStatus = useCallback(async () => {
    try { const r = await fetch('/api/pilot30/status', { cache: 'no-store' }); const j = await r.json(); setStatus(j); setStatusError(null); return j } catch (e) { setStatusError(e.message); return null }
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  useEffect(() => {
    let unsub = null
    ;(async () => {
      if (!status) return
      if (status.dataMode !== 'live' || !status.supabase?.url || !status.supabase?.anonKey) { setAuthReady(true); return }
      const { createClient } = await import('@supabase/supabase-js')
      if (!sbRef.current) sbRef.current = createClient(status.supabase.url, status.supabase.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pilot30-auth' } })
      const sb = sbRef.current
      const { data } = await sb.auth.getSession()
      setSession(data.session || null)
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
      unsub = () => sub.subscription.unsubscribe()
      setAuthReady(true)
    })()
    return () => { if (unsub) unsub() }
  }, [status])

  const token = session?.access_token || null
  const api = useCallback(async (path, { method = 'GET', body, raw = false } = {}) => {
    const headers = { accept: 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(`/api/pilot30${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
    if (raw) return res
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    if (!res.ok || json?.ok === false) throw new ApiError(res.status, json)
    return json
  }, [token])

  const signIn = useCallback(async (email) => {
    const sb = sbRef.current; if (!sb) throw new Error('Auth לא מוגדר')
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/pilot30` : undefined } })
    if (error) throw error
  }, [])
  const signOut = useCallback(async () => { await sbRef.current?.auth.signOut(); setSession(null) }, [])

  const value = useMemo(() => ({ status, statusError, refreshStatus, session, token, authReady, api, signIn, signOut, dataMode: status?.dataMode || null, needsLogin: status?.dataMode === 'live' && authReady && !session }), [status, statusError, refreshStatus, session, token, authReady, api, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePilot30() { return useContext(Ctx) }

/** Fetch + state for a GET endpoint. Re-runs when `deps` change or when reload() is called. */
export function useApi(path, deps = [], { enabled = true } = {}) {
  const { api, authReady, needsLogin } = usePilot30()
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !authReady || needsLogin) return
    let alive = true
    setState(s => ({ ...s, loading: true }))
    api(path).then(data => alive && setState({ data, error: null, loading: false })).catch(error => alive && setState(s => ({ data: s.data, error, loading: false })))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, api, authReady, needsLogin, enabled, tick, ...deps])
  return { ...state, reload: () => setTick(t => t + 1) }
}
