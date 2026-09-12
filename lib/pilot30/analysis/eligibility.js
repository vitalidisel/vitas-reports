// Data-quality gate. A selection is eligible only when every input is present, fresh and unambiguous.
// This is a *data* judgement, never a "chance to win".
import { minutesBetween } from '../time.js'

export const REASON = Object.freeze({
  NO_QUOTE: 'אין יחס לשוק זה',
  QUOTE_SUSPENDED: 'השוק מושעה אצל המפעיל',
  QUOTE_STALE_SOURCE: 'היחס לא עודכן במקור מעבר ל-TTL',
  QUOTE_STALE_FETCH: 'היחס נמשך לפני יותר מ-TTL',
  QUOTE_NO_SOURCE_TIME: 'למקור אין זמן עדכון — לא ניתן לאמת עדכניות',
  MAPPING_UNVERIFIED: 'התאמת המשחק לספק לא אומתה',
  KICKOFF_PASSED: 'המשחק כבר החל',
  NOT_TODAY: 'המשחק לא מתחיל היום (שעון ישראל)',
  SAMPLE_TOO_SMALL: 'מדגם היסטורי קטן מדי',
  FIXTURE_NOT_SCHEDULED: 'המשחק אינו במצב מתוכנן',
  WRONG_BOOKMAKER: 'מפעיל שונה מזה שנבחר לפיילוט',
  ANALYSIS_AFTER_KICKOFF: 'ה-cutoff של הניתוח מאוחר מפתיחת המשחק',
})

/**
 * @param {object} p
 * @param {object} p.fixture   {kickoffUtc, status, mappingVerified, localDate}
 * @param {object|null} p.quote {odds, status, sourceUpdatedAt, fetchedAt, bookmaker}
 * @param {object} p.analysis {cutoffUtc, minSample:number|null}
 * @param {object} p.rules    {nowUtc, localDate, quoteTtlMinutes, minSample, bookmaker}
 */
export function assessSelection({ fixture, quote, analysis, rules }) {
  const reasons = []
  if (!quote) reasons.push(REASON.NO_QUOTE)
  else {
    if (quote.status && quote.status !== 'active') reasons.push(REASON.QUOTE_SUSPENDED)
    if (rules.bookmaker && quote.bookmaker !== rules.bookmaker) reasons.push(REASON.WRONG_BOOKMAKER)
    if (!quote.sourceUpdatedAt) reasons.push(REASON.QUOTE_NO_SOURCE_TIME)
    else if (minutesBetween(quote.sourceUpdatedAt, rules.nowUtc) > rules.quoteTtlMinutes) reasons.push(REASON.QUOTE_STALE_SOURCE)
    if (!quote.fetchedAt || minutesBetween(quote.fetchedAt, rules.nowUtc) > rules.quoteTtlMinutes) reasons.push(REASON.QUOTE_STALE_FETCH)
  }
  if (fixture.mappingVerified === false) reasons.push(REASON.MAPPING_UNVERIFIED)
  if (new Date(fixture.kickoffUtc) <= new Date(rules.nowUtc)) reasons.push(REASON.KICKOFF_PASSED)
  if (rules.localDate && fixture.localDate !== rules.localDate) reasons.push(REASON.NOT_TODAY)
  if (fixture.status && fixture.status !== 'NS' && fixture.status !== 'TBD') reasons.push(REASON.FIXTURE_NOT_SCHEDULED)
  if (analysis) {
    if (analysis.cutoffUtc && new Date(analysis.cutoffUtc) > new Date(fixture.kickoffUtc)) reasons.push(REASON.ANALYSIS_AFTER_KICKOFF)
    if (rules.minSample && (analysis.minSample === null || analysis.minSample < rules.minSample)) reasons.push(REASON.SAMPLE_TOO_SMALL)
  }
  return { eligible: reasons.length === 0, reasons }
}

/** Data-quality score 0..1 = share of inputs present. Named on purpose: it is not a win probability. */
export function dataCompleteness(parts) {
  const keys = Object.keys(parts)
  if (!keys.length) return 0
  return keys.filter(k => parts[k]).length / keys.length
}
