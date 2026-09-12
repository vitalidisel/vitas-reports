// The daily scan: fixtures → quotes → analysis → eligibility → combination search → draft ticket / day status.
// Deterministic given the snapshots it writes; every exclusion reason is kept on the pilot day.
import { localDateOf, dayBoundsUtc, pilotDayNumber } from '../time.js'
import { syncFixturesForDate, refreshQuotes } from './sync.js'
import { analyzeFixture } from './analysis.js'
import { assessSelection } from '../analysis/eligibility.js'
import { findCombinations } from '../ticket/engine.js'
import { runJob } from '../jobs/runner.js'

const SELECTIONS = { '1X2': ['home', 'draw', 'away'], OU25: ['over', 'under'], BTTS: ['yes', 'no'] }

export async function runDailyScan({ store, providers, pilot, ownerId, now = new Date(), timezone = 'Asia/Jerusalem', localDate = null }) {
  const date = localDate || localDateOf(now, timezone)
  const dayNumber = pilotDayNumber(pilot.startDate, pilot.durationDays, date)
  if (!dayNumber) return { status: 'outside_pilot', localDate: date }
  const existingDay = await store.getDay(pilot.id, date)
  if (existingDay && ['committed', 'settled', 'skipped'].includes(existingDay.status)) return { status: existingDay.status, localDate: date, dayNumber, day: existingDay, note: 'היום כבר הוכרע — סריקה חוזרת אינה משנה טופס נעול' }
  const config = pilot.config
  const cutoffUtc = now.toISOString()
  const report = { localDate: date, dayNumber, cutoffUtc, steps: [], excluded: [], candidates: 0, fixtures: 0 }

  // 1. fixtures for today
  if (!providers.football) {
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'missing_info', reason: 'אין חיבור לספק משחקים (API_FOOTBALL_KEY חסר)', scan: { ...report, status: 'missing_info' } })
    return { ...report, status: 'missing_info', reason: 'אין חיבור לספק משחקים' }
  }
  const fx = await runJob(store, { provider: providers.football.name, job: `fixtures:${date}` }, () => syncFixturesForDate(store, providers.football, config.leagues, date, timezone))
  report.steps.push({ step: 'fixtures', ...fx })
  if (!fx.ok) {
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'missing_info', reason: `משיכת המשחקים נכשלה: ${fx.error || fx.reason}`, scan: { ...report, status: 'error' } })
    return { ...report, status: 'error', reason: `משיכת המשחקים נכשלה: ${fx.error || fx.reason}` }
  }
  const { startUtc, endUtc } = dayBoundsUtc(date, timezone)
  const fixtures = (await store.listFixtures({ leagueKeys: config.leagues, fromUtc: startUtc.toISOString(), toUtc: endUtc.toISOString(), dataMode: pilot.mode === 'demo' ? 'demo' : 'live' }))
  report.fixtures = fixtures.length
  if (!fixtures.length) {
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'no_fixtures', reason: 'אין משחקים היום בליגות שנבחרו', scan: { ...report, status: 'no_fixtures' } })
    return { ...report, status: 'no_fixtures' }
  }
  const upcoming = fixtures.filter(f => new Date(f.kickoffUtc) > now && ['NS', 'TBD'].includes(f.status))
  for (const f of fixtures.filter(f => !upcoming.includes(f))) report.excluded.push({ fixtureId: f.id, reasons: [new Date(f.kickoffUtc) <= now ? 'המשחק כבר החל' : `מצב משחק: ${f.status}`] })

  // 2. quotes
  if (!providers.odds) {
    for (const f of upcoming) await analyzeFixture(store, f, cutoffUtc, config, { football: providers.football })
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'missing_info', reason: providers.blocked || 'אין מקור יחסים', scan: { ...report, status: 'missing_info' } })
    return { ...report, status: 'missing_info', reason: providers.blocked || 'אין מקור יחסים', analysed: upcoming.length }
  }
  const qr = await runJob(store, { provider: providers.odds.name, job: `quotes:${date}` }, () => refreshQuotes(store, providers.odds, upcoming))
  report.steps.push({ step: 'quotes', ...qr })
  if (!qr.ok) {
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'missing_info', reason: `משיכת היחסים נכשלה: ${qr.error || qr.reason}`, scan: { ...report, status: 'error' } })
    return { ...report, status: 'error', reason: `משיכת היחסים נכשלה: ${qr.error || qr.reason}` }
  }
  const quotes = await store.latestQuotes(upcoming.map(f => f.id), { bookmaker: config.bookmaker })

  // 3. analysis + 4. eligibility
  const candidates = []
  for (const f of upcoming) {
    const fresh = await store.getFixture(f.id)
    const analysis = await analyzeFixture(store, fresh, cutoffUtc, config, { football: providers.football })
    const minSample = Math.min(analysis.inputs.home.windows.w10.sample, analysis.inputs.away.windows.w10.sample)
    const reasonsForFixture = []
    for (const market of config.markets) for (const selection of SELECTIONS[market]) {
      const quote = quotes.find(q => q.fixtureId === f.id && q.market === market && q.selection === selection) || null
      const verdict = assessSelection({ fixture: fresh, quote, analysis: { cutoffUtc, minSample }, rules: { nowUtc: cutoffUtc, localDate: date, quoteTtlMinutes: config.quoteTtlMinutes, minSample: config.minSample, bookmaker: config.bookmaker } })
      if (!verdict.eligible) { reasonsForFixture.push({ market, selection, reasons: verdict.reasons }); continue }
      const p = analysis.probabilities?.[market]?.[selection] ?? null
      candidates.push({ fixtureId: f.id, market, selection, odds: quote.odds, bookmaker: quote.bookmaker, quoteId: quote.id, analysisId: analysis.id, probability: p, uncertainty: p === null ? null : analysis.uncertainties?.overall ?? null })
    }
    if (reasonsForFixture.length) report.excluded.push({ fixtureId: f.id, selections: reasonsForFixture })
  }
  report.candidates = candidates.length

  // 5. combinations
  const search = findCombinations({ candidates, stakeMinor: config.stakeMinor, targetNetMinor: config.targetNetMinor, maxLegs: config.maxLegs, rankingMode: config.rankingMode, evThresholdMinor: config.evThresholdMinor })
  report.search = { status: search.status, explored: search.explored, reasons: search.reasons, basis: search.basis, target: search.target, options: search.tickets.length }
  if (search.status !== 'candidate') {
    await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'no_candidate', reason: search.reasons.join(' · '), scan: { ...report, status: 'no_candidate' } })
    return { ...report, status: 'no_candidate' }
  }
  const best = search.tickets[0]
  const legs = best.legs.map(l => ({ fixtureId: l.fixtureId, market: l.market, selection: l.selection, odds: l.odds, acceptedOdds: l.odds, bookmaker: l.bookmaker, lockedQuoteId: l.quoteId, lockedAnalysisId: l.analysisId, probability: l.probability, outcome: 'pending' }))
  const meta = { basis: search.basis, jointProbability: best.jointProbability, expectedNetMinor: best.expectedNetMinor, uncertainty: best.uncertainty, breakEvenProbability: best.breakEvenProbability, modelVersion: config.modelEnabled ? config.modelVersion : null, independenceAssumption: best.jointProbability !== null, alternatives: search.tickets.length, cutoffUtc, configVersion: pilot.configVersion }
  let ticket
  const draft = existingDay?.ticketId ? await store.getTicket(existingDay.ticketId) : null
  if (draft && draft.state === 'draft') ticket = await store.updateTicket(draft.id, { legs, combinedOdds: best.combinedOddsText, potentialReturnMinor: best.potentialReturnMinorFloor, basis: search.basis, meta })
  else ticket = await store.createTicket({ pilotId: pilot.id, ownerId, localDate: date, mode: pilot.mode, stakeMinor: config.stakeMinor, legs, combinedOdds: best.combinedOddsText, potentialReturnMinor: best.potentialReturnMinorFloor, basis: search.basis, meta })
  await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber, status: 'draft', ticketId: ticket.id, reason: null, scan: { ...report, status: 'candidate' } })
  return { ...report, status: 'candidate', ticket }
}
