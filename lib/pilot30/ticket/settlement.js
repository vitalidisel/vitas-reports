// Settlement rules for the MVP markets, based on the 90-minute (+ injury time) score only.
// Extra time and penalties never count. Anything not final and regular goes to pending_review —
// we never assume "odds 1" or an automatic loss for postponed/abandoned fixtures.
export const SETTLEMENT_RULE_VERSION = 'ft90-v1'

export const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN'])
export const REVIEW_STATUSES = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'INT', 'AWD', 'WO'])

/**
 * @param {{status:string, ftHome:number|null, ftAway:number|null}} fixture — status codes follow API-Football.
 * @returns {'won'|'lost'|'pending'|'pending_review'}
 */
export function settleLeg(fixture, market, selection) {
  if (!fixture) return 'pending_review'
  if (REVIEW_STATUSES.has(fixture.status)) return 'pending_review'
  if (!FINAL_STATUSES.has(fixture.status)) return 'pending'
  const h = fixture.ftHome, a = fixture.ftAway
  if (!Number.isInteger(h) || !Number.isInteger(a)) return 'pending_review'
  switch (market) {
    case '1X2': {
      const r = h > a ? 'home' : h < a ? 'away' : 'draw'
      if (!['home', 'draw', 'away'].includes(selection)) return 'pending_review'
      return r === selection ? 'won' : 'lost'
    }
    case 'OU25': {
      if (!['over', 'under'].includes(selection)) return 'pending_review'
      return (h + a > 2.5) === (selection === 'over') ? 'won' : 'lost'
    }
    case 'BTTS': {
      if (!['yes', 'no'].includes(selection)) return 'pending_review'
      return (h > 0 && a > 0) === (selection === 'yes') ? 'won' : 'lost'
    }
    default: return 'pending_review'
  }
}

/** Ticket state from leg outcomes. Any lost leg loses the ticket; review blocks a win. */
export function settleTicket(legOutcomes) {
  if (legOutcomes.some(o => o === 'lost')) return 'lost'
  if (legOutcomes.some(o => o === 'pending_review')) return 'pending_review'
  if (legOutcomes.some(o => o === 'pending')) return 'pending'
  return legOutcomes.length ? 'won' : 'pending_review'
}
