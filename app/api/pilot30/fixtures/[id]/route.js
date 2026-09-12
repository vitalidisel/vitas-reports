import { handler } from '../../../../../lib/pilot30/server.js'
import { HttpError } from '../../../../../lib/pilot30/auth.js'
import { analyzeFixture } from '../../../../../lib/pilot30/services/analysis.js'
import { assessSelection } from '../../../../../lib/pilot30/analysis/eligibility.js'
import { combinedOdds, breakEvenProbability } from '../../../../../lib/pilot30/money.js'
import { localDateOf, minutesBetween } from '../../../../../lib/pilot30/time.js'
import { DEFAULTS } from '../../../../../lib/pilot30/config.js'
export const dynamic = 'force-dynamic'
const SELECTIONS = { '1X2': ['home', 'draw', 'away'], OU25: ['over', 'under'], BTTS: ['yes', 'no'] }

export const GET = handler(async (_req, ctx, params) => {
  const f = await ctx.store.getFixture(params.id)
  if (!f) throw new HttpError(404, 'משחק לא נמצא')
  const config = ctx.pilot?.config || { ...DEFAULTS, modelEnabled: false, bookmaker: null, minSample: 5 }
  const cutoffUtc = ctx.now.toISOString()
  let analysis = await ctx.store.latestAnalysis(f.id)
  if (!analysis || minutesBetween(analysis.cutoffUtc, cutoffUtc) > 30 || new Date(analysis.cutoffUtc) > new Date(f.kickoffUtc)) {
    // Fresh snapshot, but never with a cutoff after kickoff — for finished games we keep the last pre-match snapshot.
    if (new Date(f.kickoffUtc) > ctx.now) analysis = await analyzeFixture(ctx.store, f, cutoffUtc, config, { football: ctx.providers.football })
    else if (!analysis) analysis = await analyzeFixture(ctx.store, f, f.kickoffUtc, config, { football: null })
  }
  const teams = new Map((await ctx.store.listTeams()).map(t => [t.id, t]))
  const league = (await ctx.store.listLeagues()).find(l => l.key === f.leagueKey)
  const quotes = await ctx.store.latestQuotes([f.id], { bookmaker: config.bookmaker || null })
  const today = localDateOf(ctx.now, ctx.timezone)
  const markets = []
  for (const market of config.markets || DEFAULTS.markets) for (const selection of SELECTIONS[market]) {
    const quote = quotes.find(q => q.market === market && q.selection === selection) || null
    const verdict = assessSelection({ fixture: f, quote, analysis: { cutoffUtc: analysis.cutoffUtc, minSample: Math.min(analysis.inputs.home.windows.w10.sample, analysis.inputs.away.windows.w10.sample) }, rules: { nowUtc: cutoffUtc, localDate: today, quoteTtlMinutes: config.quoteTtlMinutes, minSample: config.minSample, bookmaker: config.bookmaker || null } })
    markets.push({ market, selection, odds: quote?.odds ?? null, bookmaker: quote?.bookmaker ?? null, status: quote?.status ?? null, sourceUpdatedAt: quote?.sourceUpdatedAt ?? null, fetchedAt: quote?.fetchedAt ?? null, breakEven: quote ? breakEvenProbability(combinedOdds([quote.odds])) : null, probability: analysis.probabilities?.[market]?.[selection] ?? null, eligible: verdict.eligible, reasons: verdict.reasons })
  }
  const name = id => teams.get(id)?.nameHe || teams.get(id)?.name || id
  const withNames = list => list.map(m => ({ ...m, opponentName: name(m.opponentId) }))
  return {
    fixture: { ...f, homeTeamName: name(f.homeTeamId), awayTeamName: name(f.awayTeamId), leagueName: league?.nameHe || league?.name || f.leagueKey },
    analysis: { id: analysis.id, cutoffUtc: analysis.cutoffUtc, modelVersion: analysis.modelVersion, modelNote: analysis.modelNote || null, probabilities: analysis.probabilities, uncertainties: analysis.uncertainties, missingData: analysis.missingData, sources: analysis.sources, inputs: { ...analysis.inputs, home: { ...analysis.inputs.home, last10: withNames(analysis.inputs.home.last10) }, away: { ...analysis.inputs.away, last10: withNames(analysis.inputs.away.last10) }, h2h: analysis.inputs.h2h.map(h => ({ ...h, homeName: name(h.homeTeamId), awayName: name(h.awayTeamId) })) } },
    markets, dataMode: ctx.envInfo.dataMode, oddsBlocked: ctx.providers.blocked, serverNow: cutoffUtc,
  }
})
