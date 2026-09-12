// Commit / skip / review. Commitment is manual by default; auto-sim only for paper pilots that opted in.
import { HttpError } from '../auth.js'
import { localDateOf, pilotDayNumber, minutesBetween } from '../time.js'
import { verifyTicketMeetsTarget } from '../ticket/engine.js'
import { parseOdds } from '../money.js'

/**
 * Commit a draft ticket. Idempotent: a second call returns the same committed ticket.
 * `confirmedOdds` (manual-real only): [{fixtureId, market, selection, odds}] the user actually received.
 */
export async function commitTicket({ store, pilot, ownerId, ticketId, now = new Date(), timezone = 'Asia/Jerusalem', confirmedOdds = null, actor = 'user' }) {
  const config = pilot.config
  if (actor === 'auto' && !(pilot.mode === 'paper' && config.commitmentPolicy === 'auto-sim')) throw new HttpError(403, 'התחייבות אוטומטית מותרת רק בפיילוט paper עם מדיניות auto-sim')
  const today = localDateOf(now, timezone)
  const result = await store.commitTicket({ ticketId, pilotId: pilot.id, validate: async ({ ticket, committedOnDay, totalCommitted }) => {
    if (ticket.ownerId !== ownerId || ticket.pilotId !== pilot.id) throw new HttpError(403, 'הטופס אינו שייך לפיילוט זה')
    if (ticket.localDate !== today) throw new HttpError(409, 'ניתן להתחייב רק לטופס של היום הנוכחי (שעון ישראל)')
    if (!pilotDayNumber(pilot.startDate, pilot.durationDays, today)) throw new HttpError(409, 'היום מחוץ לטווח הפיילוט')
    if (committedOnDay) throw new HttpError(409, 'כבר קיים טופס שהתחייבנו אליו היום')
    if (ticket.stakeMinor > config.dailyBudgetMinor) throw new HttpError(409, 'הסכום חורג מהתקציב היומי')
    if (totalCommitted + ticket.stakeMinor > config.pilotBudgetMinor) throw new HttpError(409, 'הסכום חורג מתקציב הפיילוט')
    if (!ticket.legs?.length) throw new HttpError(409, 'טופס ללא בחירות')
    const nowIso = now.toISOString()
    const legs = []
    for (const leg of ticket.legs) {
      const fixture = await store.getFixture(leg.fixtureId)
      if (!fixture) throw new HttpError(409, `משחק ${leg.fixtureId} לא נמצא`)
      if (new Date(fixture.kickoffUtc) <= now) throw new HttpError(409, `המשחק ${leg.fixtureId} כבר החל — אין התחייבות רטרואקטיבית`)
      if (fixture.localDate !== today) throw new HttpError(409, `המשחק ${leg.fixtureId} אינו מתחיל היום`)
      if (!['NS', 'TBD'].includes(fixture.status)) throw new HttpError(409, `מצב המשחק ${leg.fixtureId}: ${fixture.status}`)
      if (fixture.mappingVerified === false) throw new HttpError(409, `התאמת המשחק ${leg.fixtureId} לספק לא אומתה`)
      const quote = leg.lockedQuoteId ? await store.getQuote(leg.lockedQuoteId) : null
      if (pilot.mode === 'manual-real') {
        const c = confirmedOdds?.find(x => x.fixtureId === leg.fixtureId && x.market === leg.market && x.selection === leg.selection)
        if (!c) throw new HttpError(400, 'במצב manual-real יש לאשר את היחס שהתקבל בפועל לכל בחירה', { missingConfirmation: leg })
        parseOdds(c.odds)
        legs.push({ ...leg, acceptedOdds: String(c.odds), userConfirmed: true })
      } else {
        if (!quote) throw new HttpError(409, `אין snapshot יחס נעול לבחירה ${leg.fixtureId}/${leg.market}`)
        if (quote.status !== 'active') throw new HttpError(409, `השוק ${leg.market} במשחק ${leg.fixtureId} מושעה`)
        if (!quote.sourceUpdatedAt || minutesBetween(quote.sourceUpdatedAt, nowIso) > config.quoteTtlMinutes) throw new HttpError(409, `היחס ל-${leg.fixtureId}/${leg.market} ישן (TTL ${config.quoteTtlMinutes} דק׳) — יש להריץ סריקה מחדש`, { stale: true })
        if (minutesBetween(quote.fetchedAt, nowIso) > config.quoteTtlMinutes) throw new HttpError(409, `היחס ל-${leg.fixtureId}/${leg.market} נמשך לפני יותר מ-${config.quoteTtlMinutes} דק׳ — יש להריץ סריקה מחדש`, { stale: true })
        legs.push({ ...leg, acceptedOdds: String(quote.odds) })
      }
    }
    if (new Set(legs.map(l => l.fixtureId)).size !== legs.length) throw new HttpError(409, 'שתי בחירות מאותו משחק')
    if (new Set(legs.map(l => l.bookmaker)).size !== 1) throw new HttpError(409, 'בחירות ממפעילים שונים באותו טופס')
    if (!verifyTicketMeetsTarget(ticket.stakeMinor, config.targetNetMinor, legs.map(l => l.acceptedOdds))) throw new HttpError(409, 'היחס המשולב של היחסים שאושרו אינו מגיע ליעד')
    await store.updateTicket(ticket.id, { legs, meta: { ...(ticket.meta || {}), committedBy: actor, configVersion: pilot.configVersion } })
  } })
  await store.insertAudit({ pilotId: pilot.id, ticketId, kind: result.alreadyCommitted ? 'commit_repeat' : 'commit', payload: { actor, at: now.toISOString() } })
  return result
}

export async function skipDay({ store, pilot, now = new Date(), timezone = 'Asia/Jerusalem', reason = '' }) {
  const today = localDateOf(now, timezone)
  const dayNumber = pilotDayNumber(pilot.startDate, pilot.durationDays, today)
  if (!dayNumber) throw new HttpError(409, 'היום מחוץ לטווח הפיילוט')
  const day = await store.getDay(pilot.id, today)
  if (day && ['committed', 'settled'].includes(day.status)) throw new HttpError(409, 'כבר התחייבנו לטופס היום — אי אפשר לדלג')
  const row = await store.upsertDay({ pilotId: pilot.id, localDate: today, dayNumber, status: 'skipped', reason: reason?.trim() || 'דילוג ללא סיבה מפורטת', ticketId: day?.ticketId || null })
  await store.insertAudit({ pilotId: pilot.id, ticketId: day?.ticketId || null, kind: 'skip', payload: { reason: row.reason, at: now.toISOString() } })
  return row
}

/** Manual resolution of a pending_review ticket (postponed/abandoned legs) — an audited event, never a rewrite. */
export async function resolveReview({ store, pilot, ticketId, resolution, note = '', now = new Date() }) {
  const t = await store.getTicket(ticketId)
  if (!t || t.pilotId !== pilot.id) throw new HttpError(404, 'טופס לא נמצא')
  if (t.state !== 'pending_review') throw new HttpError(409, 'הטופס אינו ממתין לבדיקה')
  if (!['void', 'lost', 'won'].includes(resolution)) throw new HttpError(400, 'הכרעה לא חוקית')
  const at = now.toISOString()
  let actualReturnMinor = 0
  if (resolution === 'void') { actualReturnMinor = t.stakeMinor; await store.insertLedger({ pilotId: pilot.id, ticketId, kind: 'refund', amountMinor: t.stakeMinor, at, idempotencyKey: `refund:${ticketId}` }) }
  if (resolution === 'won') { actualReturnMinor = Number(t.potentialReturnMinor); await store.insertLedger({ pilotId: pilot.id, ticketId, kind: 'credit', amountMinor: actualReturnMinor, at, idempotencyKey: `settle:${ticketId}` }) }
  const updated = await store.updateTicket(ticketId, { state: resolution, settledAt: at, actualReturnMinor })
  await store.upsertDay({ pilotId: pilot.id, localDate: t.localDate, status: 'settled' })
  await store.insertAudit({ pilotId: pilot.id, ticketId, kind: 'manual_resolution', payload: { resolution, note, at } })
  return updated
}
