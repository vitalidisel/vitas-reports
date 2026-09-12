// In-memory store. Used for demo mode (no database configured) and for tests.
// Implements the same contract as store/supabase.js, including atomic commit semantics
// (per-pilot mutex + one-committed-ticket-per-day invariant + budget cap).
import { randomUUID } from 'node:crypto'

export class MemoryStore {
  constructor() {
    this.kind = 'memory'
    this.reset()
  }
  reset() {
    this.pilots = new Map(); this.pilotConfigs = []; this.days = new Map(); this.leagues = new Map(); this.teams = new Map()
    this.fixtures = new Map(); this.mappings = new Map(); this.quotes = []; this.analyses = []; this.tickets = new Map()
    this.ledger = []; this.runs = []; this.locks = new Map(); this.modelRuns = []; this.auditEvents = []
    this._mutex = new Map()
    this.seededAt = null
  }
  _lock(key, fn) {
    const prev = this._mutex.get(key) || Promise.resolve()
    const next = prev.then(fn, fn)
    this._mutex.set(key, next.catch(() => {}))
    return next
  }
  // ── pilots ──
  async listPilots(ownerId) { return [...this.pilots.values()].filter(p => p.ownerId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  async getActivePilot(ownerId) { return (await this.listPilots(ownerId)).find(p => p.status === 'active') || null }
  async getPilot(id) { return this.pilots.get(id) || null }
  async createPilot(p) { const pilot = { id: randomUUID(), createdAt: new Date().toISOString(), status: 'active', configVersion: 1, ...p }; this.pilots.set(pilot.id, pilot); this.pilotConfigs.push({ pilotId: pilot.id, version: 1, config: pilot.config, createdAt: pilot.createdAt }); return pilot }
  async updatePilot(id, patch) { const p = this.pilots.get(id); if (!p) throw new Error('pilot not found'); Object.assign(p, patch); return p }
  async addConfigVersion(pilotId, config, reason) { const p = this.pilots.get(pilotId); p.configVersion += 1; p.config = config; this.pilotConfigs.push({ pilotId, version: p.configVersion, config, reason, createdAt: new Date().toISOString() }); return p }
  async listConfigVersions(pilotId) { return this.pilotConfigs.filter(c => c.pilotId === pilotId) }
  // ── days ──
  _dayKey(pilotId, localDate) { return `${pilotId}|${localDate}` }
  async getDay(pilotId, localDate) { return this.days.get(this._dayKey(pilotId, localDate)) || null }
  async upsertDay(day) { const k = this._dayKey(day.pilotId, day.localDate); const cur = this.days.get(k); const row = { id: cur?.id || randomUUID(), ...cur, ...day, updatedAt: new Date().toISOString() }; this.days.set(k, row); return row }
  async listDays(pilotId) { return [...this.days.values()].filter(d => d.pilotId === pilotId).sort((a, b) => a.localDate.localeCompare(b.localDate)) }
  // ── leagues / teams / fixtures ──
  async upsertLeague(l) { const cur = this.leagues.get(l.key) || {}; this.leagues.set(l.key, { ...cur, ...l }); return this.leagues.get(l.key) }
  async listLeagues() { return [...this.leagues.values()] }
  async upsertTeam(t) { const cur = this.teams.get(t.id) || {}; this.teams.set(t.id, { ...cur, ...t }); return this.teams.get(t.id) }
  async getTeam(id) { return this.teams.get(id) || null }
  async listTeams() { return [...this.teams.values()] }
  async upsertFixture(f) { const cur = this.fixtures.get(f.id) || {}; this.fixtures.set(f.id, { ...cur, ...f, updatedAt: new Date().toISOString() }); return this.fixtures.get(f.id) }
  async getFixture(id) { return this.fixtures.get(id) || null }
  async listFixtures({ leagueKeys = null, fromUtc = null, toUtc = null, statuses = null, dataMode = null } = {}) {
    return [...this.fixtures.values()].filter(f => (!leagueKeys || leagueKeys.includes(f.leagueKey)) && (!fromUtc || f.kickoffUtc >= fromUtc) && (!toUtc || f.kickoffUtc < toUtc) && (!statuses || statuses.includes(f.status)) && (!dataMode || f.dataMode === dataMode)).sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
  }
  async upsertMapping(m) { const k = `${m.provider}|${m.entityType}|${m.externalId}`; this.mappings.set(k, { ...(this.mappings.get(k) || {}), ...m }); return this.mappings.get(k) }
  async getMapping(provider, entityType, externalId) { return this.mappings.get(`${provider}|${entityType}|${externalId}`) || null }
  async listMappings() { return [...this.mappings.values()] }
  // ── snapshots ──
  async insertQuote(q) { const row = { id: randomUUID(), ...q }; this.quotes.push(row); return row }
  async getQuote(id) { return this.quotes.find(q => q.id === id) || null }
  async latestQuotes(fixtureIds, { bookmaker = null } = {}) {
    const latest = new Map()
    for (const q of this.quotes) {
      if (!fixtureIds.includes(q.fixtureId) || (bookmaker && q.bookmaker !== bookmaker)) continue
      const k = `${q.fixtureId}|${q.bookmaker}|${q.market}|${q.line ?? ''}|${q.selection}`
      if (!latest.has(k) || latest.get(k).fetchedAt < q.fetchedAt) latest.set(k, q)
    }
    return [...latest.values()]
  }
  async insertAnalysis(a) { const row = { id: randomUUID(), ...a }; this.analyses.push(row); return row }
  async getAnalysis(id) { return this.analyses.find(a => a.id === id) || null }
  async latestAnalysis(fixtureId) { return this.analyses.filter(a => a.fixtureId === fixtureId).sort((a, b) => b.cutoffUtc.localeCompare(a.cutoffUtc))[0] || null }
  // ── tickets ──
  async createTicket(t) { const row = { id: randomUUID(), createdAt: new Date().toISOString(), state: 'draft', legs: [], ...t }; this.tickets.set(row.id, row); return row }
  async updateTicket(id, patch) { const t = this.tickets.get(id); if (!t) throw new Error('ticket not found'); Object.assign(t, patch, { updatedAt: new Date().toISOString() }); return t }
  async getTicket(id) { return this.tickets.get(id) || null }
  async listTickets(pilotId) { return [...this.tickets.values()].filter(t => t.pilotId === pilotId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
  async committedStakeTotal(pilotId) { return [...this.tickets.values()].filter(t => t.pilotId === pilotId && t.state !== 'draft').reduce((s, t) => s + t.stakeMinor, 0) }
  /**
   * Atomic commit. `validate(ctx)` runs inside the pilot mutex with fresh reads and may throw.
   * Returns { ticket, ledgerEntry, alreadyCommitted }.
   */
  async commitTicket({ ticketId, pilotId, validate }) {
    return this._lock(pilotId, async () => {
      const t = this.tickets.get(ticketId)
      if (!t) throw Object.assign(new Error('ticket not found'), { code: 'not_found' })
      if (t.state !== 'draft') return { ticket: t, alreadyCommitted: true, ledgerEntry: this.ledger.find(e => e.idempotencyKey === `stake:${ticketId}`) || null }
      const day = await this.getDay(pilotId, t.localDate)
      const committedOnDay = [...this.tickets.values()].some(x => x.pilotId === pilotId && x.localDate === t.localDate && x.state !== 'draft')
      const totalCommitted = await this.committedStakeTotal(pilotId)
      const pilot = this.pilots.get(pilotId)
      await validate({ ticket: t, day, committedOnDay, totalCommitted, pilot, store: this })
      const now = new Date().toISOString()
      Object.assign(t, { state: 'pending', committedAt: now, updatedAt: now })
      const ledgerEntry = await this.insertLedger({ pilotId, ticketId, kind: 'debit', amountMinor: t.stakeMinor, at: now, idempotencyKey: `stake:${ticketId}` })
      await this.upsertDay({ pilotId, localDate: t.localDate, status: 'committed', ticketId })
      return { ticket: t, ledgerEntry, alreadyCommitted: false }
    })
  }
  async insertLedger(e) { const dup = this.ledger.find(x => x.idempotencyKey === e.idempotencyKey); if (dup) return dup; const row = { id: randomUUID(), ...e }; this.ledger.push(row); return row }
  async listLedger(pilotId) { return this.ledger.filter(e => e.pilotId === pilotId) }
  async insertAudit(ev) { const row = { id: randomUUID(), at: new Date().toISOString(), ...ev }; this.auditEvents.push(row); return row }
  async listAudit(pilotId) { return this.auditEvents.filter(e => e.pilotId === pilotId) }
  // ── sync runs / locks ──
  async acquireLock(job, ttlMs = 10 * 60_000) { const cur = this.locks.get(job); const now = Date.now(); if (cur && cur > now) return false; this.locks.set(job, now + ttlMs); return true }
  async releaseLock(job) { this.locks.delete(job) }
  async startRun(r) { const row = { id: randomUUID(), startedAt: new Date().toISOString(), status: 'running', counts: {}, ...r }; this.runs.push(row); return row }
  async finishRun(id, patch) { const r = this.runs.find(x => x.id === id); Object.assign(r, { endedAt: new Date().toISOString(), ...patch }); return r }
  async listRuns({ limit = 50 } = {}) { return [...this.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit) }
  async insertModelRun(m) { const row = { id: randomUUID(), createdAt: new Date().toISOString(), ...m }; this.modelRuns.push(row); return row }
  async listModelRuns() { return [...this.modelRuns] }
}

export function getMemoryStore() {
  if (!globalThis.__pilot30MemoryStore) globalThis.__pilot30MemoryStore = new MemoryStore()
  return globalThis.__pilot30MemoryStore
}
