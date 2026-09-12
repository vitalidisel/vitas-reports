// Fictional demo world: two invented leagues, invented teams, generated history and quotes.
// Everything is tagged dataMode:'demo'. It never mixes with a paper/manual-real pilot.
import { rng, hashString, poissonSample } from './rng.js'
import { localDateOf, dayBoundsUtc, addDays } from '../time.js'
import { DEFAULTS } from '../config.js'
import { DEMO_OWNER_ID } from '../auth.js'

export const DEMO_BOOKMAKER = 'demo-book'
export const DEMO_LEAGUES = [
  { key: 'demo-a', name: 'Demo League A', nameHe: 'ליגת הדגמה א׳', country: 'Demo', season: 2026, dataMode: 'demo' },
  { key: 'demo-b', name: 'Demo League B', nameHe: 'ליגת הדגמה ב׳', country: 'Demo', season: 2026, dataMode: 'demo' },
]
const TEAM_NAMES = {
  'demo-a': ['נחל צפון', 'הפועל גבעה', 'מכבי עמק', 'בית"ר חוף', 'עירוני מדבר', 'אגודת שדות', 'הכוח כרמים', 'שמשון פסגה', 'בני מישור', 'מ.ס. נמל'],
  'demo-b': ['הפועל יער', 'מכבי גשר', 'עירוני מפרץ', 'בית"ר מעיין', 'אליצור מצוק', 'צעירי בקעה', 'הפועל רכס', 'מכבי מגדל', 'עירוני שלולית', 'בני סלע'],
}

export function demoTeams() {
  const out = []
  for (const l of DEMO_LEAGUES) TEAM_NAMES[l.key].forEach((name, i) => {
    const r = rng(hashString(`${l.key}:${i}`))
    out.push({ id: `${l.key}-t${i + 1}`, name, nameHe: name, leagueKey: l.key, dataMode: 'demo', attack: 0.75 + r() * 0.6, defence: 0.75 + r() * 0.6 })
  })
  return out
}
const strengthOf = (() => { const m = new Map(demoTeams().map(t => [t.id, t])); return id => m.get(id) })()

export function lambdas(homeId, awayId) {
  const h = strengthOf(homeId), a = strengthOf(awayId)
  return { home: 1.35 * 1.18 * h.attack * a.defence, away: 1.35 * a.attack * h.defence }
}

/** Double round-robin schedule for a 10-team league, 18 rounds. */
function roundRobin(teamIds) {
  const n = teamIds.length, rounds = []
  const arr = [...teamIds]
  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; pairs.push(r % 2 ? [a, b] : [b, a]) }
    rounds.push(pairs)
    arr.splice(1, 0, arr.pop())
  }
  return [...rounds, ...rounds.map(rd => rd.map(([a, b]) => [b, a]))]
}

/** Historical fixtures: 18 rounds, one round every 7 days ending ~8 days before `today`. */
export function demoHistory(today, timezone) {
  const out = []
  for (const l of DEMO_LEAGUES) {
    const ids = TEAM_NAMES[l.key].map((_, i) => `${l.key}-t${i + 1}`)
    const rounds = roundRobin(ids)
    rounds.forEach((pairs, ri) => {
      const date = addDays(today, -8 - (rounds.length - 1 - ri) * 7)
      pairs.forEach(([home, away], pi) => {
        const r = rng(hashString(`${l.key}:${date}:${home}:${away}`))
        const { home: lh, away: la } = lambdas(home, away)
        const kickoff = new Date(dayBoundsUtc(date, timezone).startUtc.getTime() + (16 + pi) * 3600_000).toISOString()
        out.push({ id: `demo-${l.key}-r${ri + 1}-${pi + 1}`, leagueKey: l.key, season: 2026, homeTeamId: home, awayTeamId: away, kickoffUtc: kickoff, localDate: date, status: 'FT', ftHome: poissonSample(lh, r), ftAway: poissonSample(la, r), source: 'demo', sourceUpdatedAt: kickoff, fetchedAt: kickoff, mappingVerified: true, dataMode: 'demo' })
      })
    })
  }
  return out
}

/** Fixtures for a given local date: fixed evening slots plus two "soon" slots relative to `now` (same local date only). */
export function demoFixturesForDate(localDate, timezone, now = new Date()) {
  const { startUtc } = dayBoundsUtc(localDate, timezone)
  const r = rng(hashString(`fixtures:${localDate}`))
  const out = []
  const slots = [17, 19, 20.5, 21.75, 23.5]
  for (const l of DEMO_LEAGUES) {
    const ids = [...TEAM_NAMES[l.key].map((_, i) => `${l.key}-t${i + 1}`)].sort(() => r() - 0.5)
    for (let k = 0; k < 5; k++) {
      const kick = new Date(startUtc.getTime() + slots[k] * 3600_000)
      out.push(mk(l.key, localDate, ids[2 * k], ids[2 * k + 1], kick, k))
    }
  }
  // Two fixtures shortly after "now" so the flow can be exercised at any hour, as long as they stay on this local date.
  const soonA = new Date(Math.ceil(now.getTime() / 900_000) * 900_000 + 90 * 60_000), soonB = new Date(soonA.getTime() + 105 * 60_000)
  const idsA = TEAM_NAMES['demo-a'].map((_, i) => `demo-a-t${i + 1}`), idsB = TEAM_NAMES['demo-b'].map((_, i) => `demo-b-t${i + 1}`)
  if (localDateOf(soonA, timezone) === localDate) out.push(mk('demo-a', localDate, idsA[8], idsA[9], soonA, 8))
  if (localDateOf(soonB, timezone) === localDate) out.push(mk('demo-b', localDate, idsB[8], idsB[9], soonB, 9))
  return out.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
  function mk(leagueKey, date, home, away, kick, k) {
    const finished = kick.getTime() + 115 * 60_000 < now.getTime()
    const rr = rng(hashString(`result:${date}:${home}:${away}`))
    const { home: lh, away: la } = lambdas(home, away)
    return { id: `demo-${leagueKey}-${date}-${k}`, leagueKey, season: 2026, homeTeamId: home, awayTeamId: away, kickoffUtc: kick.toISOString(), localDate: date, status: finished ? 'FT' : 'NS', ftHome: finished ? poissonSample(lh, rr) : null, ftAway: finished ? poissonSample(la, rr) : null, source: 'demo', sourceUpdatedAt: now.toISOString(), fetchedAt: now.toISOString(), mappingVerified: true, lineups: k % 3 === 0 ? { status: 'published', teams: [] } : { status: 'not_published', teams: [] }, dataMode: 'demo' }
  }
}

function poissonPmf(l, k) { let v = Math.exp(-l); for (let i = 1; i <= k; i++) v *= l / i; return v }
/** Demo bookmaker quotes: fair Poisson probabilities with a 6% margin, 2-decimal odds, recent source timestamps. */
export function demoQuotesForFixture(fixture, now = new Date()) {
  const { home: lh, away: la } = lambdas(fixture.homeTeamId, fixture.awayTeamId)
  let pH = 0, pD = 0, pA = 0, pO = 0, pB = 0
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) { const q = poissonPmf(lh, h) * poissonPmf(la, a); if (h > a) pH += q; else if (h < a) pA += q; else pD += q; if (h + a > 2.5) pO += q; if (h > 0 && a > 0) pB += q }
  const r = rng(hashString(`quotes:${fixture.id}:${localDateOf(now, 'UTC')}`))
  const odd = p => (Math.floor(100 / (p * 1.06)) / 100).toFixed(2)
  const stamp = () => new Date(now.getTime() - Math.floor(r() * 8 + 1) * 60_000).toISOString()
  const q = (market, selection, p, line = null) => ({ fixtureId: fixture.id, bookmaker: DEMO_BOOKMAKER, market, line, selection, odds: odd(p), status: 'active', source: 'demo', sourceUpdatedAt: stamp(), fetchedAt: now.toISOString(), dataMode: 'demo' })
  const list = [q('1X2', 'home', pH), q('1X2', 'draw', pD), q('1X2', 'away', pA), q('OU25', 'over', pO, 2.5), q('OU25', 'under', 1 - pO, 2.5), q('BTTS', 'yes', pB), q('BTTS', 'no', 1 - pB)]
  // One suspended market now and then, so the "suspended" state is visible in the demo.
  if (r() < 0.12) list[5].status = 'suspended'
  return list
}

export function demoPilotConfig() {
  return { ...DEFAULTS, leagues: DEMO_LEAGUES.map(l => l.key), oddsSource: 'demo', bookmaker: DEMO_BOOKMAKER, modelEnabled: true, modelVersion: 'poisson-td-0.1-experimental', rankingMode: 'accounting', apiCostMinorPerMonth: 0, minSample: 5 }
}

/** Seed the memory store: leagues, teams, history, a demo pilot that started 6 days ago with a few settled days. */
export async function seedDemo(store, { now = new Date(), timezone = 'Asia/Jerusalem' } = {}) {
  const today = localDateOf(now, timezone)
  for (const l of DEMO_LEAGUES) await store.upsertLeague(l)
  for (const t of demoTeams()) await store.upsertTeam({ id: t.id, name: t.name, nameHe: t.nameHe, leagueKey: t.leagueKey, dataMode: 'demo' })
  for (const f of demoHistory(today, timezone)) await store.upsertFixture(f)
  const startDate = addDays(today, -6)
  const pilot = await store.createPilot({ ownerId: DEMO_OWNER_ID, startDate, durationDays: 30, mode: 'demo', config: demoPilotConfig() })
  // Past days: a plausible but fictional log — 2 losses, 1 skip, 1 no-candidate, 1 win is NOT invented (no real win is claimed).
  const script = [['no_candidate', 'אין שילוב של בחירות כשירות שמגיע ליחס הנדרש'], ['committed', null], ['skipped', 'לא נמצאו משחקים עם נתונים מספיקים'], ['committed', null], ['no_fixtures', 'אין משחקים בליגות שנבחרו'], ['committed', null]]
  for (let i = 0; i < 6; i++) {
    const date = addDays(startDate, i)
    const [status, reason] = script[i]
    const day = await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber: i + 1, status, reason })
    if (status === 'committed') {
      const fx = demoFixturesForDate(date, timezone, now).filter(f => f.status === 'FT').slice(0, 3)
      for (const f of fx) await store.upsertFixture(f)
      const legs = fx.map(f => ({ fixtureId: f.id, market: '1X2', selection: 'home', odds: '2.80', acceptedOdds: '2.80', bookmaker: DEMO_BOOKMAKER, outcome: f.ftHome > f.ftAway ? 'won' : 'lost' }))
      const t = await store.createTicket({ pilotId: pilot.id, ownerId: DEMO_OWNER_ID, localDate: date, mode: 'demo', stakeMinor: 1000, legs, combinedOdds: '21.95', potentialReturnMinor: 21952, basis: 'accounting', state: 'pending' })
      const at = new Date(dayBoundsUtc(date, timezone).startUtc.getTime() + 12 * 3600_000).toISOString()
      await store.updateTicket(t.id, { committedAt: at })
      await store.insertLedger({ pilotId: pilot.id, ticketId: t.id, kind: 'debit', amountMinor: 1000, at, idempotencyKey: `stake:${t.id}` })
      const won = legs.length === 3 && legs.every(l => l.outcome === 'won')
      await store.updateTicket(t.id, { state: won ? 'won' : 'lost', settledAt: new Date(new Date(at).getTime() + 12 * 3600_000).toISOString(), actualReturnMinor: won ? 21952 : 0 })
      if (won) await store.insertLedger({ pilotId: pilot.id, ticketId: t.id, kind: 'credit', amountMinor: 21952, at, idempotencyKey: `settle:${t.id}` })
      await store.upsertDay({ pilotId: pilot.id, localDate: date, dayNumber: i + 1, status: 'settled', ticketId: t.id })
      void day
    }
  }
  await store.startRun({ provider: 'demo', job: 'seed', status: 'ok', counts: { leagues: 2, teams: 20 } }).then(r => store.finishRun(r.id, { status: 'ok' }))
  store.seededAt = now.toISOString()
  return pilot
}
