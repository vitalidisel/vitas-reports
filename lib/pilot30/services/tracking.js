// Tracking summary + CSV export.
import { summarizeLedger } from '../ticket/ledger.js'
import { addDays, localDateOf } from '../time.js'
import { formatMinor } from '../money.js'

export async function trackingSummary({ store, pilot, now = new Date(), timezone = 'Asia/Jerusalem' }) {
  const [days, tickets, ledger] = await Promise.all([store.listDays(pilot.id), store.listTickets(pilot.id), store.listLedger(pilot.id)])
  const today = localDateOf(now, timezone)
  const byDate = new Map(days.map(d => [d.localDate, d]))
  const calendar = Array.from({ length: pilot.durationDays }, (_, i) => {
    const localDate = addDays(pilot.startDate, i)
    const d = byDate.get(localDate)
    const t = d?.ticketId ? tickets.find(x => x.id === d.ticketId) : null
    let status = d?.status || (localDate < today ? 'missed' : localDate === today ? 'today' : 'future')
    if (status === 'settled' && t) status = t.state
    return { dayNumber: i + 1, localDate, status, reason: d?.reason || null, ticketId: d?.ticketId || null, ticketState: t?.state || null, stakeMinor: t && t.state !== 'draft' ? t.stakeMinor : 0, actualReturnMinor: t?.actualReturnMinor ?? null }
  })
  const summary = summarizeLedger(ledger, tickets)
  const apiCost = Math.round((pilot.config.apiCostMinorPerMonth || 0) * pilot.durationDays / 30)
  return {
    calendar, summary: { ...summary, apiCostMinor: apiCost, netAfterOperatingMinor: summary.realisedNetMinor - apiCost },
    tickets: tickets.map(t => ({ id: t.id, localDate: t.localDate, state: t.state, stakeMinor: t.stakeMinor, combinedOdds: t.combinedOdds, potentialReturnMinor: t.potentialReturnMinor, actualReturnMinor: t.actualReturnMinor, committedAt: t.committedAt, settledAt: t.settledAt, legs: t.legs.length, basis: t.basis })),
    completedDays: calendar.filter(c => !['today', 'future', 'draft', 'open'].includes(c.status)).length,
    hasData: tickets.some(t => t.state !== 'draft'),
  }
}

export function toCsv(rows, columns) {
  const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n'
}

export function trackingCsv(summary, pilot) {
  const rows = summary.calendar.map(c => ({ day: c.dayNumber, local_date: c.localDate, status: c.status, reason: c.reason, ticket_id: c.ticketId, stake_ils: c.stakeMinor ? formatMinor(c.stakeMinor) : '', return_ils: c.actualReturnMinor === null ? '' : formatMinor(c.actualReturnMinor), data_mode: pilot.mode }))
  return toCsv(rows, ['day', 'local_date', 'status', 'reason', 'ticket_id', 'stake_ils', 'return_ils', 'data_mode'])
}
