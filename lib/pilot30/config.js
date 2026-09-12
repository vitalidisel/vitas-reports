// PILOT30 — configuration, environment detection and product constants.
// Server-only: never import from client components (it reads process.env).

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jerusalem'

// Product rules (spec §2). Money is in agorot (minor units), never floats.
export const DEFAULTS = Object.freeze({
  durationDays: 30,
  stakeMinor: 1000,          // 10 ₪ per ticket
  dailyBudgetMinor: 1000,    // 10 ₪ per day
  pilotBudgetMinor: 30000,   // 300 ₪ per pilot
  targetNetMinor: 20000,     // 200 ₪ net profit on a winning ticket
  maxLegs: 8,                // product default; never above operator cap (unverified)
  leagues: ['premier-league', 'la-liga', 'bundesliga', 'serie-a', 'ligue-1'],
  markets: ['1X2', 'OU25', 'BTTS'],
  commitmentPolicy: 'manual', // 'manual' | 'auto-sim' (paper only, explicit opt-in)
  rankingMode: 'accounting',  // 'accounting' | 'model'
  evThreshold: null,          // expected-net threshold (minor units) used only in 'model' mode
  quoteTtlMinutes: 30,        // quote older than this (source or fetch) blocks commitment
  lineupTtlMinutes: 120,
})

export const LEAGUE_CATALOG = Object.freeze([
  { key: 'premier-league', name: 'Premier League', nameHe: 'ליגה אנגלית', country: 'England' },
  { key: 'la-liga', name: 'La Liga', nameHe: 'ליגה ספרדית', country: 'Spain' },
  { key: 'bundesliga', name: 'Bundesliga', nameHe: 'ליגה גרמנית', country: 'Germany' },
  { key: 'serie-a', name: 'Serie A', nameHe: 'ליגה איטלקית', country: 'Italy' },
  { key: 'ligue-1', name: 'Ligue 1', nameHe: 'ליגה צרפתית', country: 'France' },
])

export const PILOT_MODES = Object.freeze(['paper', 'manual-real', 'demo'])
export const TICKET_STATES = Object.freeze(['draft', 'committed', 'pending', 'won', 'lost', 'void', 'pending_review'])
export const DAY_STATES = Object.freeze(['open', 'draft', 'committed', 'skipped', 'no_candidate', 'missing_info', 'settled', 'no_fixtures'])


/**
 * Describes which integrations are configured. Values only — never the secrets themselves.
 * `dataMode` is 'demo' when there is no database: the app then runs on an in-memory store
 * seeded with fictional data and every screen carries the demo badge.
 */
export function detectEnvironment(env = process.env) {
  const hasDb = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  const hasAnon = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const forcedDemo = env.PILOT30_DEMO === '1' || env.PILOT30_DEMO === 'true'
  const dataMode = !hasDb || forcedDemo ? 'demo' : 'live'
  return {
    dataMode,
    timezone: env.APP_TIMEZONE || 'Asia/Jerusalem',
    connections: {
      database: { configured: hasDb, required: true, envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
      auth: { configured: hasAnon && Boolean(env.OWNER_USER_ID), required: true, envVars: ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'OWNER_USER_ID'] },
      apiFootball: { configured: Boolean(env.API_FOOTBALL_KEY), required: true, envVars: ['API_FOOTBALL_KEY'] },
      oddsApi: { configured: Boolean(env.ODDS_API_KEY), required: false, envVars: ['ODDS_API_KEY'] },
      winner: { configured: false, required: false, envVars: ['WINNER_PROVIDER'], note: 'לא אותר מקור API מאומת ליחסי ווינר. המתאם קיים במצב unavailable.' },
      scheduler: { configured: Boolean(env.CRON_SECRET), required: true, envVars: ['CRON_SECRET'] },
      llm: { configured: false, required: false, envVars: [], note: 'אופציונלי, לא נדרש לגרסה הראשונה.' },
    },
  }
}
