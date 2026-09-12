// Settlement of open tickets from fixture results. Idempotent: credits use `settle:<ticketId>` keys.
import { settleLeg, settleTicket, SETTLEMENT_RULE_VERSION } from '../ticket/settlement.js'
import { refreshResults } from './sync.js'
import { potentialReturnMinor, floorMinor } from '../money.js'

export async function settleOpenTickets({ store, pilot, football = null, now = new Date(), refresh = true }) {
  const tickets = (await store.listTickets(pilot.id)).filter(t => ['pending', 'committed'].includes(t.state))
  const fixtureIds = [...new Set(tickets.flatMap(t => t.legs.map(l => l.fixtureId)))]
  let refreshed = { updated: [] }
  if (refresh && football && fixtureIds.length) {
    // Only ask the provider about fixtures that should have finished (~3h after kickoff) or are unresolved.
    const due = []
    for (const id of fixtureIds) { const f = await store.getFixture(id); if (f && (new Date(f.kickoffUtc).getTime() + 3 * 3600_000 <= now.getTime())) due.push(id) }
    refreshed = await refreshResults(store, football, due)
  }
  const settled = []
  for (const t of tickets) {
    const outcomes = []
    const legs = []
    for (const leg of t.legs) {
      const f = await store.getFixture(leg.fixtureId)
      const outcome = settleLeg(f, leg.market, leg.selection)
      outcomes.push(outcome)
      legs.push({ ...leg, outcome, settlementRuleVersion: SETTLEMENT_RULE_VERSION })
    }
    const state = settleTicket(outcomes)
    if (state === 'pending') { await store.updateTicket(t.id, { legs }); continue }
    const at = now.toISOString()
    if (state === 'won') {
      const ret = floorMinor(potentialReturnMinor(t.stakeMinor, legs.map(l => l.acceptedOdds)))
      await store.insertLedger({ pilotId: pilot.id, ticketId: t.id, kind: 'credit', amountMinor: ret, at, idempotencyKey: `settle:${t.id}` })
      await store.updateTicket(t.id, { legs, state, settledAt: at, actualReturnMinor: ret })
      await store.upsertDay({ pilotId: pilot.id, localDate: t.localDate, status: 'settled' })
    } else if (state === 'lost') {
      await store.updateTicket(t.id, { legs, state, settledAt: at, actualReturnMinor: 0 })
      await store.upsertDay({ pilotId: pilot.id, localDate: t.localDate, status: 'settled' })
    } else {
      await store.updateTicket(t.id, { legs, state: 'pending_review' })
    }
    await store.insertAudit({ pilotId: pilot.id, ticketId: t.id, kind: 'settle', payload: { state, outcomes, at, rule: SETTLEMENT_RULE_VERSION } })
    settled.push({ ticketId: t.id, state })
  }
  return { settled, counts: { checked: tickets.length, settled: settled.length, refreshed: refreshed.updated.length }, credits: refreshed.credits || null }
}
