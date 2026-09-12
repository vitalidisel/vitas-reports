// Pilot lifecycle: creation with validation, current-day state, config versions.
import { DEFAULTS, PILOT_MODES, LEAGUE_CATALOG } from '../config.js'
import { HttpError } from '../auth.js'
import { localDateOf, pilotDayNumber, isLocalDate, addDays } from '../time.js'
import { DEMO_LEAGUES } from '../demo/seed.js'

export function validatePilotInput(input, { dataMode }) {
  const errors = []
  const mode = input.mode || (dataMode === 'demo' ? 'demo' : 'paper')
  if (!PILOT_MODES.includes(mode)) errors.push('מצב פיילוט לא חוקי')
  if (dataMode === 'demo' && mode !== 'demo') errors.push('ללא בסיס נתונים ניתן להריץ רק פיילוט demo')
  if (dataMode === 'live' && mode === 'demo') errors.push('פיילוט demo אינו נשמר בבסיס הנתונים האמיתי')
  if (!isLocalDate(input.startDate)) errors.push('תאריך התחלה חסר או לא תקין')
  const stakeMinor = Number(input.stakeMinor ?? DEFAULTS.stakeMinor)
  const dailyBudgetMinor = Number(input.dailyBudgetMinor ?? DEFAULTS.dailyBudgetMinor)
  const pilotBudgetMinor = Number(input.pilotBudgetMinor ?? DEFAULTS.pilotBudgetMinor)
  const targetNetMinor = Number(input.targetNetMinor ?? DEFAULTS.targetNetMinor)
  const durationDays = Number(input.durationDays ?? DEFAULTS.durationDays)
  if (!Number.isInteger(stakeMinor) || stakeMinor <= 0) errors.push('סכום לטופס חייב להיות מספר שלם חיובי באגורות')
  if (!Number.isInteger(dailyBudgetMinor) || dailyBudgetMinor < stakeMinor) errors.push('תקציב יומי חייב להיות לפחות סכום הטופס')
  if (!Number.isInteger(pilotBudgetMinor) || pilotBudgetMinor < dailyBudgetMinor) errors.push('תקציב הפיילוט חייב להיות לפחות התקציב היומי')
  if (!Number.isInteger(targetNetMinor) || targetNetMinor <= 0) errors.push('יעד רווח נטו חייב להיות חיובי')
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) errors.push('משך הפיילוט לא תקין')
  const known = new Set([...LEAGUE_CATALOG.map(l => l.key), ...DEMO_LEAGUES.map(l => l.key)])
  const leagues = Array.isArray(input.leagues) && input.leagues.length ? input.leagues : (mode === 'demo' ? DEMO_LEAGUES.map(l => l.key) : DEFAULTS.leagues)
  if (leagues.some(k => !known.has(k))) errors.push('ליגה לא מוכרת ברשימה')
  const commitmentPolicy = input.commitmentPolicy || DEFAULTS.commitmentPolicy
  if (!['manual', 'auto-sim'].includes(commitmentPolicy)) errors.push('מדיניות התחייבות לא חוקית')
  if (commitmentPolicy === 'auto-sim' && mode === 'manual-real') errors.push('התחייבות אוטומטית מותרת בסימולציה בלבד')
  const rankingMode = input.rankingMode || DEFAULTS.rankingMode
  if (!['accounting', 'model'].includes(rankingMode)) errors.push('מצב דירוג לא חוקי')
  const modelEnabled = Boolean(input.modelEnabled ?? (mode === 'demo'))
  if (rankingMode === 'model' && !modelEnabled) errors.push('דירוג לפי מודל דורש הפעלת המודל הניסיוני')
  const oddsSource = input.oddsSource || (mode === 'demo' ? 'demo' : 'winner')
  if (!['winner', 'odds-api', 'demo'].includes(oddsSource)) errors.push('מקור יחסים לא חוקי')
  if (oddsSource === 'demo' && mode !== 'demo') errors.push('מקור יחסי demo מותר רק בפיילוט demo')
  if (oddsSource === 'odds-api' && !input.bookmaker) errors.push('יש לבחור מפעיל מזוהה ב-The Odds API')
  const maxLegs = Number(input.maxLegs ?? DEFAULTS.maxLegs)
  if (!Number.isInteger(maxLegs) || maxLegs < 1 || maxLegs > 20) errors.push('תקרת בחירות לא תקינה')
  const config = {
    stakeMinor, dailyBudgetMinor, pilotBudgetMinor, targetNetMinor, durationDays, leagues, markets: DEFAULTS.markets, maxLegs,
    commitmentPolicy, rankingMode, modelEnabled, modelVersion: modelEnabled ? 'poisson-td-0.1-experimental' : null,
    evThresholdMinor: input.evThresholdMinor === undefined || input.evThresholdMinor === null ? null : Number(input.evThresholdMinor),
    oddsSource, bookmaker: input.bookmaker || (oddsSource === 'demo' ? 'demo-book' : null),
    quoteTtlMinutes: Number(input.quoteTtlMinutes ?? DEFAULTS.quoteTtlMinutes), lineupTtlMinutes: DEFAULTS.lineupTtlMinutes,
    minSample: Number(input.minSample ?? 5), apiCostMinorPerMonth: Number(input.apiCostMinorPerMonth ?? 0),
  }
  return { errors, value: { mode, startDate: input.startDate, durationDays, config } }
}

export async function createPilot(store, ownerId, input, { dataMode }) {
  const existing = await store.getActivePilot(ownerId)
  if (existing) throw new HttpError(409, 'כבר קיים פיילוט פעיל. סיים אותו לפני פתיחת פיילוט חדש.')
  const { errors, value } = validatePilotInput(input, { dataMode })
  if (errors.length) throw new HttpError(400, errors.join(' · '), { errors })
  return store.createPilot({ ownerId, ...value })
}

/** Where are we in the pilot right now? */
export function pilotState(pilot, now, timezone) {
  const today = localDateOf(now, timezone)
  if (!pilot) return { today, hasPilot: false }
  const dayNumber = pilotDayNumber(pilot.startDate, pilot.durationDays, today)
  const endDate = addDays(pilot.startDate, pilot.durationDays - 1)
  return { today, hasPilot: true, dayNumber, started: today >= pilot.startDate, ended: today > endDate, endDate, locked: today >= pilot.startDate }
}

/** Config changes create a new version; budget/target/mode never change retroactively once the pilot started. */
export async function changeConfig(store, pilot, patch, { now, timezone }) {
  const st = pilotState(pilot, now, timezone)
  const frozen = ['stakeMinor', 'dailyBudgetMinor', 'pilotBudgetMinor', 'targetNetMinor', 'durationDays', 'oddsSource', 'bookmaker']
  if (st.locked) for (const k of frozen) if (k in patch && patch[k] !== pilot.config[k]) throw new HttpError(409, `לא ניתן לשנות ${k} אחרי תחילת הפיילוט. פתח פיילוט נפרד.`)
  const merged = { ...pilot.config, ...patch }
  const { errors, value } = validatePilotInput({ ...merged, mode: pilot.mode, startDate: pilot.startDate }, { dataMode: pilot.mode === 'demo' ? 'demo' : 'live' })
  if (errors.length) throw new HttpError(400, errors.join(' · '), { errors })
  return store.addConfigVersion(pilot.id, value.config, patch.reason || null)
}

export async function endPilot(store, pilot) { return store.updatePilot(pilot.id, { status: 'ended', endedAt: new Date().toISOString() }) }
