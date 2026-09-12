import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localDateOf, dayBoundsUtc, addDays, diffDays, pilotDayNumber, offsetMinutesAt } from '../../lib/pilot30/time.js'

const TZ = 'Asia/Jerusalem'

test('day boundaries in winter (UTC+2)', () => {
  const { startUtc, endUtc } = dayBoundsUtc('2026-01-15', TZ)
  assert.equal(startUtc.toISOString(), '2026-01-14T22:00:00.000Z')
  assert.equal(endUtc.toISOString(), '2026-01-15T22:00:00.000Z')
})

test('day boundaries in summer (UTC+3)', () => {
  const { startUtc, endUtc } = dayBoundsUtc('2026-07-01', TZ)
  assert.equal(startUtc.toISOString(), '2026-06-30T21:00:00.000Z')
  assert.equal(endUtc.toISOString(), '2026-07-01T21:00:00.000Z')
})

test('DST transition day (spring forward, 27 March 2026) is 23 hours', () => {
  const { startUtc, endUtc } = dayBoundsUtc('2026-03-27', TZ)
  assert.equal(startUtc.toISOString(), '2026-03-26T22:00:00.000Z')
  assert.equal(endUtc.toISOString(), '2026-03-27T21:00:00.000Z')
  assert.equal((endUtc - startUtc) / 3.6e6, 23)
})

test('DST transition day (fall back, 25 October 2026) is 25 hours', () => {
  const { startUtc, endUtc } = dayBoundsUtc('2026-10-25', TZ)
  assert.equal((endUtc - startUtc) / 3.6e6, 25)
  assert.equal(offsetMinutesAt(new Date('2026-10-24T12:00:00Z'), TZ), 180)
  assert.equal(offsetMinutesAt(new Date('2026-10-26T12:00:00Z'), TZ), 120)
})

test('a 22:30 UTC kickoff belongs to the next Israel day in winter', () => {
  assert.equal(localDateOf(new Date('2026-01-15T22:30:00Z'), TZ), '2026-01-16')
  assert.equal(localDateOf(new Date('2026-01-15T21:30:00Z'), TZ), '2026-01-15')
})

test('day arithmetic and pilot day numbers', () => {
  assert.equal(addDays('2026-02-27', 3), '2026-03-02')
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30)
  assert.equal(pilotDayNumber('2026-01-01', 30, '2026-01-01'), 1)
  assert.equal(pilotDayNumber('2026-01-01', 30, '2026-01-30'), 30)
  assert.equal(pilotDayNumber('2026-01-01', 30, '2026-01-31'), null)
  assert.equal(pilotDayNumber('2026-01-01', 30, '2025-12-31'), null)
})
