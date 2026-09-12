// Descriptive pre-match metrics. Pure functions over historical fixtures.
// A fixture record: { id, leagueKey, season, homeTeamId, awayTeamId, kickoffUtc, status, ftHome, ftAway }
// Only fixtures with kickoffUtc < cutoff and final status are used — the future never leaks in.
import { FINAL_STATUSES } from '../ticket/settlement.js'

export function finishedBefore(fixtures, cutoffUtc) {
  const cut = new Date(cutoffUtc).getTime()
  return fixtures.filter(f => FINAL_STATUSES.has(f.status) && Number.isInteger(f.ftHome) && Number.isInteger(f.ftAway) && new Date(f.kickoffUtc).getTime() < cut)
    .sort((a, b) => new Date(b.kickoffUtc) - new Date(a.kickoffUtc))
}

export function teamMatches(fixtures, teamId, cutoffUtc, { venue = 'any', limit = Infinity } = {}) {
  return finishedBefore(fixtures, cutoffUtc)
    .filter(f => (venue === 'home' ? f.homeTeamId === teamId : venue === 'away' ? f.awayTeamId === teamId : f.homeTeamId === teamId || f.awayTeamId === teamId))
    .slice(0, limit)
    .map(f => {
      const home = f.homeTeamId === teamId
      const gf = home ? f.ftHome : f.ftAway, ga = home ? f.ftAway : f.ftHome
      return { fixtureId: f.id, kickoffUtc: f.kickoffUtc, home, opponentId: home ? f.awayTeamId : f.homeTeamId, gf, ga, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D' }
    })
}

function summarize(ms) {
  if (!ms.length) return { sample: 0, wins: null, draws: null, losses: null, gfPerGame: null, gaPerGame: null, cleanSheets: null, failedToScore: null, points: null, ppg: null }
  const wins = ms.filter(m => m.result === 'W').length, draws = ms.filter(m => m.result === 'D').length, losses = ms.length - wins - draws
  const gf = ms.reduce((s, m) => s + m.gf, 0), ga = ms.reduce((s, m) => s + m.ga, 0)
  return { sample: ms.length, wins, draws, losses, gfPerGame: gf / ms.length, gaPerGame: ga / ms.length, cleanSheets: ms.filter(m => m.ga === 0).length, failedToScore: ms.filter(m => m.gf === 0).length, points: wins * 3 + draws, ppg: (wins * 3 + draws) / ms.length }
}

/** Rest days since the previous finished match, null when unknown. */
export function restDays(fixtures, teamId, kickoffUtc) {
  const last = teamMatches(fixtures, teamId, kickoffUtc, { limit: 1 })[0]
  return last ? (new Date(kickoffUtc) - new Date(last.kickoffUtc)) / 86_400_000 : null
}

/** Average points-per-game of the opponents faced in the window (strength-of-schedule proxy). */
export function opponentStrength(fixtures, matches, cutoffUtc) {
  const vals = matches.map(m => summarize(teamMatches(fixtures, m.opponentId, cutoffUtc, { limit: 20 })).ppg).filter(v => v !== null)
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

/** Full descriptive block for one team ahead of a fixture. */
export function teamProfile(fixtures, teamId, fixture, cutoffUtc) {
  const venue = fixture.homeTeamId === teamId ? 'home' : 'away'
  const last10 = teamMatches(fixtures, teamId, cutoffUtc, { limit: 10 })
  return {
    teamId,
    venue,
    form10: last10.map(m => m.result).reverse().join(''),   // oldest → newest; the UI renders LTR with newest on the left
    last10: last10.map(m => ({ ...m })),
    windows: { w5: summarize(teamMatches(fixtures, teamId, cutoffUtc, { limit: 5 })), w10: summarize(last10), w20: summarize(teamMatches(fixtures, teamId, cutoffUtc, { limit: 20 })) },
    venueSplit: summarize(teamMatches(fixtures, teamId, cutoffUtc, { venue, limit: 10 })),
    restDays: restDays(fixtures, teamId, fixture.kickoffUtc),
    opponentStrength: opponentStrength(fixtures, last10, cutoffUtc),
  }
}

/** Head-to-head: secondary context only. */
export function headToHead(fixtures, homeId, awayId, cutoffUtc, limit = 5) {
  return finishedBefore(fixtures, cutoffUtc).filter(f => (f.homeTeamId === homeId && f.awayTeamId === awayId) || (f.homeTeamId === awayId && f.awayTeamId === homeId)).slice(0, limit)
    .map(f => ({ fixtureId: f.id, kickoffUtc: f.kickoffUtc, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, ftHome: f.ftHome, ftAway: f.ftAway }))
}
