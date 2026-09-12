// Team-name normalisation and fixture matching across providers.
// A match is accepted automatically only when league, kickoff (±10 min), home/away order and
// normalised names all agree. Anything weaker is recorded as 'unverified' and stops for review.
const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'club', 'de', 'the', 'ac', 'as', 'ss', 'us', 'ssc', 'rc', 'sv', 'tsg', 'vfb', 'vfl', 'fsv', 'bsc', 'ud', 'cd', 'rcd', 'og', 'ol', 'sco', 'aj'])
export function normalizeTeamName(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).join(' ').trim()
}
export function namesAgree(a, b) {
  const x = normalizeTeamName(a), y = normalizeTeamName(b)
  if (!x || !y) return false
  if (x === y) return true
  // one contains the other as whole words (e.g. "manchester united" vs "manchester united fc" after stop-word removal)
  return x.split(' ').every(w => y.split(' ').includes(w)) || y.split(' ').every(w => x.split(' ').includes(w))
}
/**
 * @returns {'auto'|'unverified'|null} match quality between an internal fixture and a provider event.
 */
export function matchFixture(fixture, event, { toleranceMinutes = 10 } = {}) {
  if (fixture.leagueKey !== event.leagueKey) return null
  const dt = Math.abs(new Date(fixture.kickoffUtc) - new Date(event.kickoffUtc)) / 60_000
  if (dt > 24 * 60) return null
  const homeOk = namesAgree(fixture.homeTeamName, event.homeTeamName), awayOk = namesAgree(fixture.awayTeamName, event.awayTeamName)
  if (homeOk && awayOk && dt <= toleranceMinutes) return 'auto'
  if ((homeOk || awayOk) && dt <= toleranceMinutes) return 'unverified'
  if (homeOk && awayOk) return 'unverified' // names agree but kickoff differs → review
  return null
}
