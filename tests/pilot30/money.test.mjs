import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOdds, combinedOdds, potentialReturnMinor, rationalAtLeast, targetOdds, rationalToDecimalString, breakEvenProbability, floorMinor, formatMinor } from '../../lib/pilot30/money.js'
import { ticketMath, verifyTicketMeetsTarget } from '../../lib/pilot30/ticket/engine.js'

test('target odds for 10 ₪ stake and 200 ₪ net is exactly 21.00', () => {
  const t = targetOdds(1000, 20000)
  assert.equal(rationalToDecimalString(t, 2), '21.00')
})

test('odds 21 with 10 ₪ returns 210 ₪ and net 200 ₪', () => {
  const m = ticketMath(1000, ['21'])
  assert.equal(m.potentialReturnMinorFloor, 21000)
  assert.equal(m.potentialNetMinorFloor, 20000)
  assert.equal(m.combinedOddsText, '21.00')
  assert.ok(Math.abs(m.breakEvenProbability - 1 / 21) < 1e-12)
})

test('product of legs is exact — no floating drift', () => {
  // 1.1^8 = 2.14358881 exactly
  const r = combinedOdds(Array(8).fill('1.1'))
  assert.equal(rationalToDecimalString(r, 8), '2.14358881')
  const ret = potentialReturnMinor(1000, ['3.5', '2', '3'])
  assert.equal(floorMinor(ret), 21000)
  assert.ok(rationalAtLeast(ret, 21000))
  assert.ok(!rationalAtLeast(potentialReturnMinor(1000, ['3.5', '2', '2.99']), 21000))
})

test('minimum is checked before rounding', () => {
  // 20.999 * 10 = 209.99 → below 210 even though it displays as 21.00 with 2 decimals rounded up; we floor.
  assert.ok(!verifyTicketMeetsTarget(1000, 20000, ['20.999']))
  assert.equal(rationalToDecimalString(combinedOdds(['20.999']), 2), '20.99')
  assert.ok(verifyTicketMeetsTarget(1000, 20000, ['21.000001']))
})

test('parseOdds rejects invalid or ≤1 odds', () => {
  assert.throws(() => parseOdds('1'))
  assert.throws(() => parseOdds('abc'))
  assert.throws(() => parseOdds(null))
  assert.equal(parseOdds('1.83'), 1_830_000n)
})

test('formatMinor', () => {
  assert.equal(formatMinor(21000), '210')
  assert.equal(formatMinor(1005), '10.05')
  assert.equal(formatMinor(-350), '-3.50')
})

test('breakEvenProbability of 1.80 is 0.5555…', () => {
  assert.ok(Math.abs(breakEvenProbability(combinedOdds(['1.80'])) - 0.5555555) < 1e-6)
})
