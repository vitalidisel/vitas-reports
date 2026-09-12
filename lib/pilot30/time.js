// Timezone helpers. Storage is UTC; the pilot day is defined in Asia/Jerusalem (or APP_TIMEZONE).
// No external dependency: Intl handles DST for the IANA zone.

const DAY_MS = 86_400_000

function partsOf(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const out = {}
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

/** Offset (minutes) of `timeZone` from UTC at the given instant. */
export function offsetMinutesAt(date, timeZone) {
  const p = partsOf(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** 'YYYY-MM-DD' of the instant in the zone. */
export function localDateOf(date, timeZone) {
  const p = partsOf(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function isLocalDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) }

/** UTC instant of local midnight (start of `localDate`) in the zone. Handles DST transitions. */
export function localMidnightUtc(localDate, timeZone) {
  if (!isLocalDate(localDate)) throw new Error(`invalid local date: ${localDate}`)
  const [y, m, d] = localDate.split('-').map(Number)
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  // Two fixed-point iterations are enough for any real offset change (DST shifts by 1h).
  for (let i = 0; i < 3; i++) {
    const off = offsetMinutesAt(new Date(guess), timeZone)
    const next = Date.UTC(y, m - 1, d, 0, 0, 0) - off * 60_000
    if (next === guess) break
    guess = next
  }
  return new Date(guess)
}

/** Half-open UTC range [start, end) covering the local calendar day. */
export function dayBoundsUtc(localDate, timeZone) {
  const start = localMidnightUtc(localDate, timeZone)
  const end = localMidnightUtc(addDays(localDate, 1), timeZone)
  return { startUtc: start, endUtc: end }
}

export function addDays(localDate, n) {
  const [y, m, d] = localDate.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * DAY_MS
  const x = new Date(t)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS)
}

/** 1-based day number of `localDate` within a pilot, or null when outside [start, start+duration). */
export function pilotDayNumber(startDate, durationDays, localDate) {
  const n = diffDays(startDate, localDate) + 1
  return n >= 1 && n <= durationDays ? n : null
}

/** Display helpers (Israel time). */
export function formatDateTimeIL(date, timeZone = 'Asia/Jerusalem') {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('he-IL', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}
export function formatTimeIL(date, timeZone = 'Asia/Jerusalem') {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('he-IL', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}
export function minutesBetween(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 60_000 }
