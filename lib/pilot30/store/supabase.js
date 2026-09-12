// Supabase (PostgreSQL) store. Same contract as store/memory.js.
// Uses the service-role key on the server only, after the route has verified the owner.
import { createClient } from '@supabase/supabase-js'

const snake = s => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const toRow = o => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined) r[snake(k)] = v; return r }
const fromRow = r => { if (!r) return null; const o = {}; for (const [k, v] of Object.entries(r)) o[camel(k)] = v; return o }
const fromRows = rs => (rs || []).map(fromRow)
function must({ data, error }) { if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details }); return data }

export class SupabaseStore {
  constructor(url, serviceKey) {
    this.kind = 'supabase'
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  // ── pilots ──
  async listPilots(ownerId) { return fromRows(must(await this.sb.from('p30_pilots').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }))) }
  async getActivePilot(ownerId) { const d = must(await this.sb.from('p30_pilots').select('*').eq('owner_id', ownerId).eq('status', 'active').limit(1)); return fromRow(d[0]) }
  async getPilot(id) { const d = must(await this.sb.from('p30_pilots').select('*').eq('id', id).maybeSingle()); return fromRow(d) }
  async createPilot(p) {
    const row = fromRow(must(await this.sb.from('p30_pilots').insert(toRow({ ...p, configVersion: 1 })).select('*').single()))
    must(await this.sb.from('p30_pilot_configs').insert(toRow({ pilotId: row.id, version: 1, config: p.config })))
    return row
  }
  async updatePilot(id, patch) { return fromRow(must(await this.sb.from('p30_pilots').update(toRow(patch)).eq('id', id).select('*').single())) }
  async addConfigVersion(pilotId, config, reason) {
    const p = await this.getPilot(pilotId)
    const version = p.configVersion + 1
    must(await this.sb.from('p30_pilot_configs').insert(toRow({ pilotId, version, config, reason })))
    return this.updatePilot(pilotId, { config, configVersion: version })
  }
  async listConfigVersions(pilotId) { return fromRows(must(await this.sb.from('p30_pilot_configs').select('*').eq('pilot_id', pilotId).order('version'))) }
  // ── days ──
  async getDay(pilotId, localDate) { return fromRow(must(await this.sb.from('p30_pilot_days').select('*').eq('pilot_id', pilotId).eq('local_date', localDate).maybeSingle())) }
  async upsertDay(day) {
    const cur = await this.getDay(day.pilotId, day.localDate)
    const row = toRow({ ...(cur || {}), ...day, updatedAt: new Date().toISOString() })
    delete row.id
    return fromRow(must(await this.sb.from('p30_pilot_days').upsert(row, { onConflict: 'pilot_id,local_date' }).select('*').single()))
  }
  async listDays(pilotId) { return fromRows(must(await this.sb.from('p30_pilot_days').select('*').eq('pilot_id', pilotId).order('local_date'))) }
  // ── reference data ──
  async upsertLeague(l) { return fromRow(must(await this.sb.from('p30_leagues').upsert(toRow(l), { onConflict: 'key' }).select('*').single())) }
  async listLeagues() { return fromRows(must(await this.sb.from('p30_leagues').select('*'))) }
  async upsertTeam(t) { return fromRow(must(await this.sb.from('p30_teams').upsert(toRow(t), { onConflict: 'id' }).select('*').single())) }
  async getTeam(id) { return fromRow(must(await this.sb.from('p30_teams').select('*').eq('id', id).maybeSingle())) }
  async listTeams() { return fromRows(must(await this.sb.from('p30_teams').select('*'))) }
  async upsertFixture(f) { return fromRow(must(await this.sb.from('p30_fixtures').upsert(toRow({ ...f, updatedAt: new Date().toISOString() }), { onConflict: 'id' }).select('*').single())) }
  async getFixture(id) { return fromRow(must(await this.sb.from('p30_fixtures').select('*').eq('id', id).maybeSingle())) }
  async listFixtures({ leagueKeys = null, fromUtc = null, toUtc = null, statuses = null, dataMode = null } = {}) {
    let q = this.sb.from('p30_fixtures').select('*').order('kickoff_utc')
    if (leagueKeys) q = q.in('league_key', leagueKeys)
    if (fromUtc) q = q.gte('kickoff_utc', fromUtc)
    if (toUtc) q = q.lt('kickoff_utc', toUtc)
    if (statuses) q = q.in('status', statuses)
    if (dataMode) q = q.eq('data_mode', dataMode)
    return fromRows(must(await q.limit(5000)))
  }
  async upsertMapping(m) { return fromRow(must(await this.sb.from('p30_provider_mappings').upsert(toRow(m), { onConflict: 'provider,entity_type,external_id' }).select('*').single())) }
  async getMapping(provider, entityType, externalId) { return fromRow(must(await this.sb.from('p30_provider_mappings').select('*').eq('provider', provider).eq('entity_type', entityType).eq('external_id', String(externalId)).maybeSingle())) }
  async listMappings() { return fromRows(must(await this.sb.from('p30_provider_mappings').select('*'))) }
  // ── snapshots ──
  async insertQuote(q) { return fromRow(must(await this.sb.from('p30_quote_snapshots').insert(toRow(q)).select('*').single())) }
  async getQuote(id) { return fromRow(must(await this.sb.from('p30_quote_snapshots').select('*').eq('id', id).maybeSingle())) }
  async latestQuotes(fixtureIds, { bookmaker = null } = {}) {
    if (!fixtureIds.length) return []
    let q = this.sb.from('p30_quote_snapshots').select('*').in('fixture_id', fixtureIds).order('fetched_at', { ascending: false }).limit(5000)
    if (bookmaker) q = q.eq('bookmaker', bookmaker)
    const rows = fromRows(must(await q))
    const latest = new Map()
    for (const r of rows) { const k = `${r.fixtureId}|${r.bookmaker}|${r.market}|${r.line ?? ''}|${r.selection}`; if (!latest.has(k)) latest.set(k, r) }
    return [...latest.values()]
  }
  async insertAnalysis(a) { return fromRow(must(await this.sb.from('p30_analysis_snapshots').insert(toRow(a)).select('*').single())) }
  async getAnalysis(id) { return fromRow(must(await this.sb.from('p30_analysis_snapshots').select('*').eq('id', id).maybeSingle())) }
  async latestAnalysis(fixtureId) { const d = must(await this.sb.from('p30_analysis_snapshots').select('*').eq('fixture_id', fixtureId).order('cutoff_utc', { ascending: false }).limit(1)); return fromRow(d[0]) }
  // ── tickets ──
  async _legs(ticketId) { return fromRows(must(await this.sb.from('p30_ticket_legs').select('*').eq('ticket_id', ticketId).order('position'))) }
  async _withLegs(t) { if (!t) return null; return { ...t, legs: await this._legs(t.id) } }
  async _writeLegs(ticketId, legs) {
    must(await this.sb.from('p30_ticket_legs').delete().eq('ticket_id', ticketId))
    if (legs?.length) must(await this.sb.from('p30_ticket_legs').insert(legs.map((l, i) => toRow({ ticketId, fixtureId: l.fixtureId, market: l.market, selection: l.selection, lockedQuoteId: l.lockedQuoteId || l.quoteId || null, lockedAnalysisId: l.lockedAnalysisId || l.analysisId || null, acceptedOdds: l.acceptedOdds || l.odds, bookmaker: l.bookmaker, outcome: l.outcome || 'pending', settlementRuleVersion: l.settlementRuleVersion || null, position: i }))))
  }
  async createTicket(t) {
    const { legs = [], ...rest } = t
    const row = fromRow(must(await this.sb.from('p30_tickets').insert(toRow({ state: 'draft', ...rest })).select('*').single()))
    await this._writeLegs(row.id, legs)
    return { ...row, legs: await this._legs(row.id) }
  }
  async updateTicket(id, patch) {
    const { legs, ...rest } = patch
    const row = fromRow(must(await this.sb.from('p30_tickets').update(toRow({ ...rest, updatedAt: new Date().toISOString() })).eq('id', id).select('*').single()))
    if (legs) await this._writeLegs(id, legs)
    return { ...row, legs: await this._legs(id) }
  }
  async getTicket(id) { return this._withLegs(fromRow(must(await this.sb.from('p30_tickets').select('*').eq('id', id).maybeSingle()))) }
  async listTickets(pilotId) {
    const rows = fromRows(must(await this.sb.from('p30_tickets').select('*').eq('pilot_id', pilotId).order('created_at')))
    if (!rows.length) return []
    const legs = fromRows(must(await this.sb.from('p30_ticket_legs').select('*').in('ticket_id', rows.map(r => r.id)).order('position')))
    return rows.map(r => ({ ...r, legs: legs.filter(l => l.ticketId === r.id) }))
  }
  async committedStakeTotal(pilotId) { const d = must(await this.sb.from('p30_tickets').select('stake_minor').eq('pilot_id', pilotId).neq('state', 'draft')); return d.reduce((s, r) => s + r.stake_minor, 0) }
  async commitTicket({ ticketId, pilotId, validate }) {
    const t = await this.getTicket(ticketId)
    if (!t) throw Object.assign(new Error('ticket not found'), { code: 'not_found' })
    if (t.state !== 'draft') return { ticket: t, alreadyCommitted: true, ledgerEntry: null }
    const pilot = await this.getPilot(pilotId)
    const day = await this.getDay(pilotId, t.localDate)
    const committedOnDay = (await this.listTickets(pilotId)).some(x => x.localDate === t.localDate && x.state !== 'draft')
    await validate({ ticket: t, day, committedOnDay, totalCommitted: await this.committedStakeTotal(pilotId), pilot, store: this })
    // Money invariants are re-checked atomically inside the database function.
    const res = must(await this.sb.rpc('p30_commit_ticket', { p_ticket_id: ticketId, p_owner_id: t.ownerId, p_daily_budget_minor: pilot.config.dailyBudgetMinor, p_pilot_budget_minor: pilot.config.pilotBudgetMinor }))
    if (!res.ok) throw Object.assign(new Error(res.code), { code: res.code })
    const ticket = await this.getTicket(ticketId)
    const ledgerEntry = fromRow(must(await this.sb.from('p30_ledger_entries').select('*').eq('idempotency_key', `stake:${ticketId}`).maybeSingle()))
    return { ticket, ledgerEntry, alreadyCommitted: Boolean(res.alreadyCommitted) }
  }
  async insertLedger(e) {
    const { data, error } = await this.sb.from('p30_ledger_entries').insert(toRow(e)).select('*').single()
    if (error && error.code === '23505') return fromRow(must(await this.sb.from('p30_ledger_entries').select('*').eq('idempotency_key', e.idempotencyKey).single()))
    if (error) throw new Error(error.message)
    return fromRow(data)
  }
  async listLedger(pilotId) { return fromRows(must(await this.sb.from('p30_ledger_entries').select('*').eq('pilot_id', pilotId).order('at'))) }
  async insertAudit(ev) { return fromRow(must(await this.sb.from('p30_audit_events').insert(toRow(ev)).select('*').single())) }
  async listAudit(pilotId) { return fromRows(must(await this.sb.from('p30_audit_events').select('*').eq('pilot_id', pilotId).order('at'))) }
  // ── jobs ──
  async acquireLock(job, ttlMs = 10 * 60_000) { return Boolean(must(await this.sb.rpc('p30_acquire_lock', { p_job: job, p_ttl_seconds: Math.ceil(ttlMs / 1000) }))) }
  async releaseLock(job) { must(await this.sb.from('p30_job_locks').delete().eq('job', job)) }
  async startRun(r) { return fromRow(must(await this.sb.from('p30_sync_runs').insert(toRow({ status: 'running', counts: {}, ...r })).select('*').single())) }
  async finishRun(id, patch) { return fromRow(must(await this.sb.from('p30_sync_runs').update(toRow({ endedAt: new Date().toISOString(), ...patch })).eq('id', id).select('*').single())) }
  async listRuns({ limit = 50 } = {}) { return fromRows(must(await this.sb.from('p30_sync_runs').select('*').order('started_at', { ascending: false }).limit(limit))) }
  async insertModelRun(m) { return fromRow(must(await this.sb.from('p30_model_runs').insert(toRow(m)).select('*').single())) }
  async listModelRuns() { return fromRows(must(await this.sb.from('p30_model_runs').select('*').order('created_at', { ascending: false }))) }
}
