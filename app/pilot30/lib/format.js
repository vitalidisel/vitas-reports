// Client-side formatting helpers (Israel time, agorot → ₪, percentages).
const TZ = 'Asia/Jerusalem'
export function ils(minor, { sign = false } = {}) {
  if (minor === null || minor === undefined) return '—'
  const n = Number(minor)
  const abs = Math.abs(n)
  const s = (abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2))
  return `${n < 0 ? '−' : sign && n > 0 ? '+' : ''}${s} ₪`
}
export function pct(p, digits = 1) { return p === null || p === undefined ? '—' : `${(p * 100).toFixed(digits)}%` }
export function timeIL(iso) { return iso ? new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '—' }
export function dateTimeIL(iso) { return iso ? new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '—' }
export function dateIL(localDate) { if (!localDate) return '—'; const [y, m, d] = localDate.split('-'); return `${d}.${m}.${y}` }
export function agoMinutes(iso, now = Date.now()) { return iso ? Math.round((now - new Date(iso).getTime()) / 60_000) : null }
export const MARKET_HE = { '1X2': 'תוצאת 90 דקות', OU25: 'מעל/מתחת 2.5 שערים', BTTS: 'שתי הקבוצות יבקיעו' }
export const SELECTION_HE = { home: 'ניצחון בית', draw: 'תיקו', away: 'ניצחון חוץ', over: 'מעל 2.5', under: 'מתחת 2.5', yes: 'כן', no: 'לא' }
export const STATE_HE = { draft: 'טיוטה', committed: 'התחייבות', pending: 'ממתין לתוצאה', won: 'זכייה', lost: 'הפסד', void: 'בוטל', pending_review: 'ממתין לבדיקה', skipped: 'דילוג', no_candidate: 'אין שילוב', no_fixtures: 'אין משחקים', missing_info: 'חסר מידע', open: 'פתוח', settled: 'הוכרע', missed: 'ללא פעולה', today: 'היום', future: 'טרם התחיל' }
export const FIXTURE_STATUS_HE = { NS: 'טרם החל', TBD: 'שעה לא סופית', '1H': 'מחצית 1', HT: 'הפסקה', '2H': 'מחצית 2', ET: 'הארכה', P: 'פנדלים', FT: 'הסתיים', AET: 'הסתיים (הארכה)', PEN: 'הסתיים (פנדלים)', PST: 'נדחה', CANC: 'בוטל', ABD: 'הופסק', SUSP: 'מושעה', INT: 'הופרע', LIVE: 'משחק חי' }
