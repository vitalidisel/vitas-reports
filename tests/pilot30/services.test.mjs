import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStore } from '../../lib/pilot30/store/memory.js'
import { seedDemo, demoFixturesForDate } from '../../lib/pilot30/demo/seed.js'
import { DemoFootballProvider, DemoOddsProvider } from '../../lib/pilot30/demo/providers.js'
import { WinnerOddsProvider } from '../../lib/pilot30/adapters/winner.js'
import { runDailyScan } from '../../lib/pilot30/services/scan.js'
import { commitTicket, skipDay, resolveReview } from '../../lib/pilot30/services/tickets.js'
import { settleOpenTickets } from '../../lib/pilot30/services/settle.js'
import { trackingSummary, trackingCsv } from '../../lib/pilot30/services/tracking.js'
import { validatePilotInput, changeConfig } from '../../lib/pilot30/services/pilot.js'
import { DEMO_OWNER_ID } from '../../lib/pilot30/auth.js'
import { localDateOf } from '../../lib/pilot30/time.js'

const TZ = 'Asia/Jerusalem'
// A fixed "now" at 10:00 Israel time so the demo day has plenty of upcoming fixtures.
const NOW = new Date('2026-09-12T07:00:00Z')

async function world() {
  const store = new MemoryStore()
  const pilot = await seedDemo(store, { now: NOW, timezone: TZ })
  const providers = { dataMode: 'demo', football: new DemoFootballProvider({ timezone: TZ, now: () => NOW }), odds: new DemoOddsProvider({ now: () => NOW }), winner: new WinnerOddsProvider(), oddsSource: 'demo', blocked: null }
  return { store, pilot, providers }
}

test('scan produces a draft candidate (or an explicit no_candidate) and records exclusions', async () => {
  const { store, pilot, providers } = await world()
  const r = await runDailyScan({ store, providers, pilot, ownerId: DEMO_OWNER_ID, now: NOW, timezone: TZ })
  assert.ok(['candidate', 'no_candidate'].includes(r.status), r.status)
  assert.ok(r.fixtures > 0)
  const day = await store.getDay(pilot.id, localDateOf(NOW, TZ))
  assert.ok(day)
  assert.ok(day.scan.search)
  if (r.status === 'candidate') {
    assert.equal(day.status, 'draft')
    assert.ok(r.ticket.legs.length >= 1 && r.ticket.legs.length <= 8)
    assert.ok(Number(r.ticket.potentialReturnMinor) >= 21000)
    // draft is never charged
    assert.equal((await store.listLedger(pilot.id)).filter(e => e.ticketId === r.ticket.id).length, 0)
  }
})

test('commit charges once, is idempotent, survives concurrent calls, blocks a second ticket on the same day', async () => {
  const { store, pilot, providers } = await world()
  const r = await runDailyScan({ store, providers, pilot, ownerId: DEMO_OWNER_ID, now: NOW, timezone: TZ })
  assert.equal(r.status, 'candidate', 'demo world must yield a candidate for this test: ' + JSON.stringify(r.search))
  const before = await store.listLedger(pilot.id)
  const results = await Promise.all([1, 2, 3].map(() => commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: r.ticket.id, now: NOW, timezone: TZ })))
  assert.equal(results.filter(x => !x.alreadyCommitted).length, 1)
  assert.equal(results.filter(x => x.alreadyCommitted).length, 2)
  const after = await store.listLedger(pilot.id)
  assert.equal(after.length - before.length, 1)
  assert.equal((await store.getTicket(r.ticket.id)).state, 'pending')
  // Another draft on the same day cannot be committed
  const other = await store.createTicket({ pilotId: pilot.id, ownerId: DEMO_OWNER_ID, localDate: r.localDate, mode: 'demo', stakeMinor: 1000, legs: r.ticket.legs })
  await assert.rejects(() => commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: other.id, now: NOW, timezone: TZ }), /כבר קיים טופס/)
  // Re-scan does not touch a committed day
  const again = await runDailyScan({ store, providers, pilot, ownerId: DEMO_OWNER_ID, now: NOW, timezone: TZ })
  assert.equal(again.status, 'committed')
  // Skip is refused after commit
  await assert.rejects(() => skipDay({ store, pilot, now: NOW, timezone: TZ, reason: 'x' }), /כבר התחייבנו/)
})

test('stale quotes block commitment; re-scan refreshes them', async () => {
  const { store, pilot, providers } = await world()
  const r = await runDailyScan({ store, providers, pilot, ownerId: DEMO_OWNER_ID, now: NOW, timezone: TZ })
  assert.equal(r.status, 'candidate')
  const later = new Date(NOW.getTime() + 45 * 60_000) // beyond the 30-minute TTL
  await assert.rejects(() => commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: r.ticket.id, now: later, timezone: TZ }), e => e.extra?.stale === true)
  assert.equal((await store.getTicket(r.ticket.id)).state, 'draft')
  const providers2 = { ...providers, odds: new DemoOddsProvider({ now: () => later }), football: new DemoFootballProvider({ timezone: TZ, now: () => later }) }
  const r2 = await runDailyScan({ store, providers: providers2, pilot, ownerId: DEMO_OWNER_ID, now: later, timezone: TZ })
  assert.equal(r2.status, 'candidate')
  assert.equal(r2.ticket.id, r.ticket.id, 'draft is updated in place, not duplicated')
  const c = await commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: r2.ticket.id, now: later, timezone: TZ })
  assert.equal(c.alreadyCommitted, false)
})

test('a fixture that already kicked off cannot be committed retroactively', async () => {
  const { store, pilot, providers } = await world()
  const r = await runDailyScan({ store, providers, pilot, ownerId: DEMO_OWNER_ID, now: NOW, timezone: TZ })
  assert.equal(r.status, 'candidate')
  // Move one leg's kickoff into the past while quotes stay fresh: the kickoff check must fire.
  const legFixture = r.ticket.legs[0].fixtureId
  await store.upsertFixture({ id: legFixture, kickoffUtc: new Date(NOW.getTime() - 60_000).toISOString() })
  await assert.rejects(() => commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: r.ticket.id, now: NOW, timezone: TZ }), /כבר החל/)
  assert.equal((await store.getTicket(r.ticket.id)).state, 'draft')
})

test('skip is a day state with a reason and no charge', async () => {
  const { store, pilot } = await world()
  const day = await skipDay({ store, pilot, now: NOW, timezone: TZ, reason: 'אין נתונים מספיקים' })
  assert.equal(day.status, 'skipped')
  assert.equal((await store.listLedger(pilot.id)).filter(e => e.at === NOW.toISOString()).length, 0)
})

test('budget cap: the 31st committed stake is refused', async () => {
  const { store, pilot } = await world()
  // Fabricate 30 committed tickets (300 ₪) on distinct past dates, then try one more today.
  for (let i = 0; i < 30; i++) {
    const t = await store.createTicket({ pilotId: pilot.id, ownerId: DEMO_OWNER_ID, localDate: `2025-01-${String(i + 1).padStart(2, '0')}`, mode: 'demo', stakeMinor: 1000, legs: [], state: 'lost' })
    void t
  }
  const today = localDateOf(NOW, TZ)
  const t = await store.createTicket({ pilotId: pilot.id, ownerId: DEMO_OWNER_ID, localDate: today, mode: 'demo', stakeMinor: 1000, legs: [{ fixtureId: 'x', market: '1X2', selection: 'home', odds: '21', bookmaker: 'demo-book' }] })
  await assert.rejects(() => commitTicket({ store, pilot, ownerId: DEMO_OWNER_ID, ticketId: t.id, now: NOW, timezone: TZ }), /תקציב הפיילוט/)
})

test('settlement: won credits once (re-run does not double-credit), lost pays zero, postponed → pending_review → manual void refunds', async () => {
  const { store, pilot, providers } = await world()
  const today = localDateOf(NOW, TZ)
  const fx = demoFixturesForDate(today, TZ, NOW).filter(f => f.status === 'NS').slice(0, 3)
  for (const f of fx) await store.upsertFixture(f)
  const mk = async (legs) => {
    const t = await store.createTicket({ pilotId: pilot.id, ownerId: DEMO_OWNER_ID, localDate: today, mode: 'demo', stakeMinor: 1000, legs, potentialReturnMinor: 21000 })
    await store.updateTicket(t.id, { state: 'pending', committedAt: NOW.toISOString() })
    await store.insertLedger({ pilotId: pilot.id, ticketId: t.id, kind: 'debit', amountMinor: 1000, at: NOW.toISOString(), idempotencyKey: `stake:${t.id}` })
    return t
  }
  const won = await mk([{ fixtureId: fx[0].id, market: '1X2', selection: 'home', acceptedOdds: '21', bookmaker: 'demo-book' }])
  const lost = await mk([{ fixtureId: fx[1].id, market: 'OU25', selection: 'over', acceptedOdds: '21', bookmaker: 'demo-book' }])
  const review = await mk([{ fixtureId: fx[2].id, market: 'BTTS', selection: 'yes', acceptedOdds: '21', bookmaker: 'demo-book' }])
  await store.upsertFixture({ id: fx[0].id, status: 'FT', ftHome: 2, ftAway: 0 })
  await store.upsertFixture({ id: fx[1].id, status: 'FT', ftHome: 1, ftAway: 1 })
  await store.upsertFixture({ id: fx[2].id, status: 'PST', ftHome: null, ftAway: null })
  const s1 = await settleOpenTickets({ store, pilot, football: null, now: NOW, refresh: false })
  assert.equal(s1.settled.length, 3)
  assert.equal((await store.getTicket(won.id)).state, 'won')
  assert.equal((await store.getTicket(won.id)).actualReturnMinor, 21000)
  assert.equal((await store.getTicket(lost.id)).state, 'lost')
  assert.equal((await store.getTicket(review.id)).state, 'pending_review')
  const credits1 = (await store.listLedger(pilot.id)).filter(e => e.kind === 'credit' && e.ticketId === won.id)
  assert.equal(credits1.length, 1)
  await settleOpenTickets({ store, pilot, football: null, now: NOW, refresh: false })
  assert.equal((await store.listLedger(pilot.id)).filter(e => e.kind === 'credit' && e.ticketId === won.id).length, 1)
  const v = await resolveReview({ store, pilot, ticketId: review.id, resolution: 'void', note: 'נדחה', now: NOW })
  assert.equal(v.state, 'void')
  assert.equal((await store.listLedger(pilot.id)).filter(e => e.kind === 'refund' && e.ticketId === review.id).length, 1)
  const summary = await trackingSummary({ store, pilot, now: NOW, timezone: TZ })
  assert.equal(summary.summary.winRate, summary.summary.wonCount / (summary.summary.wonCount + summary.summary.lostCount))
  const csv = trackingCsv(summary, pilot)
  assert.ok(csv.startsWith('﻿day,local_date'))
  assert.equal(csv.trim().split('\n').length, 31)
})

test('pilot input validation and locked config after start', async () => {
  const bad = validatePilotInput({ startDate: 'nope', stakeMinor: 5000, dailyBudgetMinor: 1000 }, { dataMode: 'live' })
  assert.ok(bad.errors.length >= 2)
  const ok = validatePilotInput({ startDate: '2026-10-01', mode: 'paper', oddsSource: 'winner' }, { dataMode: 'live' })
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.value.config.targetNetMinor, 20000)
  assert.equal(ok.value.config.stakeMinor + ok.value.config.targetNetMinor, 21000)
  const { store, pilot } = await world()
  await assert.rejects(() => changeConfig(store, pilot, { targetNetMinor: 19000 }, { now: NOW, timezone: TZ }), /לא ניתן לשנות/)
  const v2 = await changeConfig(store, pilot, { maxLegs: 6, reason: 'test' }, { now: NOW, timezone: TZ })
  assert.equal(v2.configVersion, 2)
  assert.equal(v2.config.maxLegs, 6)
  assert.equal(v2.config.targetNetMinor, 20000)
})
