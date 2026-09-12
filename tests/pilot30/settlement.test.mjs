import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settleLeg, settleTicket } from '../../lib/pilot30/ticket/settlement.js'
import { summarizeLedger } from '../../lib/pilot30/ticket/ledger.js'

const ft = (h, a, status = 'FT') => ({ status, ftHome: h, ftAway: a })

test('1X2 / OU25 / BTTS outcomes on the 90-minute score', () => {
  assert.equal(settleLeg(ft(2, 1), '1X2', 'home'), 'won')
  assert.equal(settleLeg(ft(1, 1), '1X2', 'draw'), 'won')
  assert.equal(settleLeg(ft(0, 1), '1X2', 'home'), 'lost')
  assert.equal(settleLeg(ft(2, 1), 'OU25', 'over'), 'won')
  assert.equal(settleLeg(ft(1, 1), 'OU25', 'over'), 'lost')
  assert.equal(settleLeg(ft(1, 1), 'OU25', 'under'), 'won')
  assert.equal(settleLeg(ft(1, 1), 'BTTS', 'yes'), 'won')
  assert.equal(settleLeg(ft(3, 0), 'BTTS', 'yes'), 'lost')
})

test('extra time is ignored: AET uses the fulltime score passed in', () => {
  assert.equal(settleLeg(ft(1, 1, 'AET'), '1X2', 'draw'), 'won')
})

test('postponed/cancelled/abandoned go to pending_review, never lost', () => {
  for (const s of ['PST', 'CANC', 'ABD', 'SUSP', 'INT']) assert.equal(settleLeg(ft(null, null, s), '1X2', 'home'), 'pending_review')
  assert.equal(settleLeg(ft(null, null, 'FT'), '1X2', 'home'), 'pending_review')
  assert.equal(settleLeg(ft(0, 0, 'NS'), '1X2', 'home'), 'pending')
  assert.equal(settleLeg(ft(1, 0), 'CORNERS', 'over'), 'pending_review')
})

test('ticket state from legs', () => {
  assert.equal(settleTicket(['won', 'won']), 'won')
  assert.equal(settleTicket(['won', 'lost', 'pending']), 'lost')
  assert.equal(settleTicket(['won', 'pending_review']), 'pending_review')
  assert.equal(settleTicket(['won', 'pending']), 'pending')
  assert.equal(settleTicket([]), 'pending_review')
})

test('ledger summary uses closed tickets only and excludes void from win rate', () => {
  const tickets = [
    { id: 't1', state: 'won', stakeMinor: 1000, actualReturnMinor: 21000 },
    { id: 't2', state: 'lost', stakeMinor: 1000, actualReturnMinor: 0 },
    { id: 't3', state: 'void', stakeMinor: 1000, actualReturnMinor: 1000 },
    { id: 't4', state: 'pending', stakeMinor: 1000, actualReturnMinor: null },
    { id: 't5', state: 'draft', stakeMinor: 1000, actualReturnMinor: null },
  ]
  const entries = [
    { kind: 'debit', amountMinor: 1000 }, { kind: 'debit', amountMinor: 1000 }, { kind: 'debit', amountMinor: 1000 }, { kind: 'debit', amountMinor: 1000 },
    { kind: 'credit', amountMinor: 21000 }, { kind: 'refund', amountMinor: 1000 },
  ]
  const s = summarizeLedger(entries, tickets)
  assert.equal(s.spentMinor, 4000)
  assert.equal(s.returnsMinor, 22000)
  assert.equal(s.netCashflowMinor, 18000)
  assert.equal(s.openMinor, 1000)
  assert.equal(s.realisedNetMinor, 22000 - 3000)
  assert.equal(s.winRate, 0.5)
  assert.equal(s.closedCount, 3)
})
