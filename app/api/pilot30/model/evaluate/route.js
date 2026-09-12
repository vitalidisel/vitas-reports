// Walk-forward evaluation on stored league history. Writes a model_run row; never changes ranking by itself.
import { handler, readJson } from '../../../../../lib/pilot30/server.js'
import { walkForward, chronologicalSplit } from '../../../../../lib/pilot30/analysis/evaluate.js'
import { MODEL_VERSION, DEFAULT_PARAMS } from '../../../../../lib/pilot30/analysis/poisson.js'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const POST = handler(async (req, ctx) => {
  const body = await readJson(req)
  const leagues = body.leagues || ctx.pilot?.config.leagues || []
  const dataMode = ctx.envInfo.dataMode === 'demo' ? 'demo' : 'live'
  const history = await ctx.store.listFixtures({ leagueKeys: leagues, toUtc: ctx.now.toISOString(), dataMode })
  const split = chronologicalSplit(history)
  const validation = walkForward([...split.train, ...split.validation], { params: DEFAULT_PARAMS })
  const test = walkForward(history, { params: DEFAULT_PARAMS, minTrain: split.train.length + split.validation.length })
  const run = await ctx.store.insertModelRun({ version: MODEL_VERSION, trainingCutoff: split.validation.slice(-1)[0]?.kickoffUtc || null, params: DEFAULT_PARAMS, metrics: { validation, test, sizes: { train: split.train.length, validation: split.validation.length, test: split.test.length }, note: 'ניסיוני. אין backtest רווחיות: אין snapshots של יחסים היסטוריים.' } })
  return { run }
})
