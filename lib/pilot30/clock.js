// Server clock. In demo mode only, PILOT30_DEMO_NOW (ISO instant) freezes "now" so QA and screenshots can
// exercise a full day (fixtures upcoming, quotes fresh) at any real hour. Ignored completely in live mode.
import { detectEnvironment } from './config.js'
export function now(env = process.env) {
  const fixed = env.PILOT30_DEMO_NOW
  if (fixed && detectEnvironment(env).dataMode === 'demo') { const d = new Date(fixed); if (!Number.isNaN(d.getTime())) return d }
  return new Date()
}
