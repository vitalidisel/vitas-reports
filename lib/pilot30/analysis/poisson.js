// Experimental Poisson baseline (attack/defence strength, home advantage, time decay).
// Fitted by iterative weighted maximum-likelihood updates on league history before a training cutoff.
// Returns null probabilities when the sample is insufficient. No ad-hoc adjustments (injuries, "motivation").
import { finishedBefore } from './metrics.js'

export const MODEL_VERSION = 'poisson-td-0.1-experimental'
export const DEFAULT_PARAMS = Object.freeze({ decayPerDay: 0.006, minTeamMatches: 8, maxGoals: 10, iterations: 60, ridge: 0.02 })

export function fitPoisson(fixtures, trainingCutoffUtc, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params }
  const rows = finishedBefore(fixtures, trainingCutoffUtc)
  const cut = new Date(trainingCutoffUtc).getTime()
  const teams = new Map()
  const w = rows.map(f => Math.exp(-p.decayPerDay * (cut - new Date(f.kickoffUtc).getTime()) / 86_400_000))
  for (const f of rows) for (const t of [f.homeTeamId, f.awayTeamId]) teams.set(t, (teams.get(t) || 0) + 1)
  const ids = [...teams.keys()]
  if (!rows.length) return { version: MODEL_VERSION, params: p, trainingCutoffUtc, teams: {}, homeAdvantage: null, sample: 0, attack: {}, defence: {} }
  const attack = Object.fromEntries(ids.map(i => [i, 1])), defence = Object.fromEntries(ids.map(i => [i, 1]))
  let home = 1.2
  const totalW = w.reduce((s, x) => s + x, 0)
  const avgGoals = rows.reduce((s, f, i) => s + w[i] * (f.ftHome + f.ftAway), 0) / (2 * totalW) || 1
  for (let it = 0; it < p.iterations; it++) {
    // attack_i = Σ w·gf / Σ w·(defence_opp·home_factor·avg)
    const num = {}, den = {}
    for (const i of ids) { num[i] = p.ridge; den[i] = p.ridge }
    rows.forEach((f, k) => {
      num[f.homeTeamId] += w[k] * f.ftHome; den[f.homeTeamId] += w[k] * avgGoals * home * defence[f.awayTeamId]
      num[f.awayTeamId] += w[k] * f.ftAway; den[f.awayTeamId] += w[k] * avgGoals * defence[f.homeTeamId]
    })
    for (const i of ids) attack[i] = num[i] / den[i]
    const dn = {}, dd = {}
    for (const i of ids) { dn[i] = p.ridge; dd[i] = p.ridge }
    rows.forEach((f, k) => {
      dn[f.awayTeamId] += w[k] * f.ftHome; dd[f.awayTeamId] += w[k] * avgGoals * home * attack[f.homeTeamId]
      dn[f.homeTeamId] += w[k] * f.ftAway; dd[f.homeTeamId] += w[k] * avgGoals * attack[f.awayTeamId]
    })
    for (const i of ids) defence[i] = dn[i] / dd[i]
    let hn = 0, hd = 0
    rows.forEach((f, k) => { hn += w[k] * f.ftHome; hd += w[k] * avgGoals * attack[f.homeTeamId] * defence[f.awayTeamId] })
    home = hd > 0 ? hn / hd : home
    // normalise so mean attack = mean defence = 1
    const ma = ids.reduce((s, i) => s + attack[i], 0) / ids.length, md = ids.reduce((s, i) => s + defence[i], 0) / ids.length
    for (const i of ids) { attack[i] /= ma; defence[i] /= md }
  }
  return { version: MODEL_VERSION, params: p, trainingCutoffUtc, avgGoals, homeAdvantage: home, sample: rows.length, teams: Object.fromEntries(ids.map(i => [i, teams.get(i)])), attack, defence }
}

function poissonPmf(lambda, k) { let v = Math.exp(-lambda); for (let i = 1; i <= k; i++) v *= lambda / i; return v }

/** Probabilities for the three MVP markets, or nulls with a reason when the sample is too small. */
export function predict(model, homeTeamId, awayTeamId) {
  const p = model.params
  const nh = model.teams[homeTeamId] || 0, na = model.teams[awayTeamId] || 0
  if (model.homeAdvantage === null || nh < p.minTeamMatches || na < p.minTeamMatches) {
    return { version: model.version, probabilities: null, sample: { home: nh, away: na }, reason: 'מדגם אימון לא מספיק לאחת הקבוצות', lambda: null }
  }
  const lh = model.avgGoals * model.homeAdvantage * model.attack[homeTeamId] * model.defence[awayTeamId]
  const la = model.avgGoals * model.attack[awayTeamId] * model.defence[homeTeamId]
  let pHome = 0, pDraw = 0, pAway = 0, pOver = 0, pBtts = 0, mass = 0
  for (let h = 0; h <= p.maxGoals; h++) for (let a = 0; a <= p.maxGoals; a++) {
    const q = poissonPmf(lh, h) * poissonPmf(la, a)
    mass += q
    if (h > a) pHome += q; else if (h < a) pAway += q; else pDraw += q
    if (h + a > 2.5) pOver += q
    if (h > 0 && a > 0) pBtts += q
  }
  const residual = 1 - mass
  // Uncertainty proxy: smaller samples → larger. Reported, never used to tweak probabilities.
  const uncertainty = Math.min(1, Math.max(0, 1 - Math.min(nh, na) / 40))
  return {
    version: model.version, lambda: { home: lh, away: la }, residualMass: residual, sample: { home: nh, away: na }, uncertainty,
    probabilities: { '1X2': { home: pHome / mass, draw: pDraw / mass, away: pAway / mass }, OU25: { over: pOver / mass, under: 1 - pOver / mass }, BTTS: { yes: pBtts / mass, no: 1 - pBtts / mass } },
  }
}
