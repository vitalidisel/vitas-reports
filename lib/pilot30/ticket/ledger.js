// Ledger arithmetic (spec §9). Everything in minor units; only closed tickets count for realised P&L.
export function summarizeLedger(entries, tickets) {
  const debits = entries.filter(e => e.kind === 'debit').reduce((s, e) => s + e.amountMinor, 0)
  const credits = entries.filter(e => e.kind === 'credit').reduce((s, e) => s + e.amountMinor, 0)
  const refunds = entries.filter(e => e.kind === 'refund').reduce((s, e) => s + e.amountMinor, 0)
  const returns = credits + refunds
  const won = tickets.filter(t => t.state === 'won').length
  const lost = tickets.filter(t => t.state === 'lost').length
  const voided = tickets.filter(t => t.state === 'void').length
  const open = tickets.filter(t => ['committed', 'pending', 'pending_review'].includes(t.state))
  const openMinor = open.reduce((s, t) => s + t.stakeMinor, 0)
  const closed = tickets.filter(t => ['won', 'lost', 'void'].includes(t.state))
  const closedStake = closed.reduce((s, t) => s + t.stakeMinor, 0)
  const closedReturn = closed.reduce((s, t) => s + (t.actualReturnMinor || 0), 0)
  return {
    spentMinor: debits,
    returnsMinor: returns,
    netCashflowMinor: returns - debits,
    openMinor,
    openCount: open.length,
    realisedNetMinor: closedReturn - closedStake,           // closed tickets only
    realisedRoi: closedStake > 0 ? (closedReturn - closedStake) / closedStake : null, // denominator: closed stakes
    wonCount: won, lostCount: lost, voidCount: voided,
    winRate: won + lost > 0 ? won / (won + lost) : null,     // won/(won+lost); void/draft/skipped/pending excluded
    closedCount: closed.length,
  }
}
