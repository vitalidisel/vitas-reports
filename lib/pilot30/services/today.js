// Composes the "Today" screen payload.
import { pilotState } from './pilot.js'
import { summarizeLedger } from '../ticket/ledger.js'
import { targetOdds, rationalToDecimalString } from '../money.js'
import { minutesBetween } from '../time.js'

export async function todayPayload({ store, pilot, providers, now = new Date(), timezone = 'Asia/Jerusalem', envInfo }) {
  const st = pilotState(pilot, now, timezone)
  if (!pilot) return { pilot: null, state: st }
  const [day, tickets, ledger, runs] = await Promise.all([store.getDay(pilot.id, st.today), store.listTickets(pilot.id), store.listLedger(pilot.id), store.listRuns({ limit: 10 })])
  const ticket = day?.ticketId ? await store.getTicket(day.ticketId) : null
  const fixturesById = {}
  const teams = new Map((await store.listTeams()).map(t => [t.id, t]))
  let staleQuotes = false
  if (ticket && ticket.state === 'draft') for (const leg of ticket.legs) {
    const q = leg.lockedQuoteId ? await store.getQuote(leg.lockedQuoteId) : null
    if (!q || !q.sourceUpdatedAt || minutesBetween(q.sourceUpdatedAt, now.toISOString()) > pilot.config.quoteTtlMinutes || minutesBetween(q.fetchedAt, now.toISOString()) > pilot.config.quoteTtlMinutes) staleQuotes = true
  }
  if (ticket) for (const leg of ticket.legs) { const f = await store.getFixture(leg.fixtureId); if (f) fixturesById[f.id] = { ...f, homeTeamName: teams.get(f.homeTeamId)?.nameHe || teams.get(f.homeTeamId)?.name || f.homeTeamId, awayTeamName: teams.get(f.awayTeamId)?.nameHe || teams.get(f.awayTeamId)?.name || f.awayTeamId } }
  const c = pilot.config
  const lastScan = runs.find(r => r.job.startsWith('fixtures:') || r.job.startsWith('quotes:')) || null
  return {
    pilot: { id: pilot.id, mode: pilot.mode, startDate: pilot.startDate, durationDays: pilot.durationDays, configVersion: pilot.configVersion, config: c },
    state: st,
    day: day ? { status: day.status, reason: day.reason, scan: day.scan ? { status: day.scan.status, cutoffUtc: day.scan.cutoffUtc, fixtures: day.scan.fixtures, candidates: day.scan.candidates, excluded: day.scan.excluded, search: day.scan.search, reason: day.scan.reason } : null } : null,
    ticket: ticket ? { ...ticket, fixtures: fixturesById, staleQuotes } : null,
    serverNow: now.toISOString(),
    target: { stakeMinor: c.stakeMinor, targetNetMinor: c.targetNetMinor, requiredReturnMinor: c.stakeMinor + c.targetNetMinor, requiredOdds: rationalToDecimalString(targetOdds(c.stakeMinor, c.targetNetMinor), 2) },
    budget: { dailyMinor: c.dailyBudgetMinor, pilotMinor: c.pilotBudgetMinor, ...summarizeLedger(ledger, tickets) },
    sources: { football: providers.football?.name || null, odds: providers.odds?.name || null, oddsSource: providers.oddsSource, blocked: providers.blocked, bookmaker: c.bookmaker, lastScan: lastScan ? { at: lastScan.startedAt, status: lastScan.status, error: lastScan.error || null } : null },
    dataMode: envInfo.dataMode,
  }
}
