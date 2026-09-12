'use client'
// Small shared building blocks: badges, state boxes, notices.
import { STATE_HE } from '../lib/format'

const TONE = { draft: 'amber', committed: 'amber', pending: 'amber', pending_review: 'amber', won: 'green', lost: 'red', void: 'gray', skipped: 'gray', no_candidate: 'gray', no_fixtures: 'gray', missing_info: 'red', open: '', settled: '', missed: 'gray', today: '', future: 'gray' }
export function Badge({ state, children, tone }) { return <span className={`p30-status ${tone || TONE[state] || ''}`}>{children ?? STATE_HE[state] ?? state}</span> }

export function StateBox({ kind = 'empty', title, children, action }) {
  return <div className={`p30-state ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{title ? <h3>{title}</h3> : null}<div>{children}</div>{action ? <div style={{ marginTop: 12 }}>{action}</div> : null}</div>
}
export function Loading({ lines = 3 }) { return <div aria-busy="true" aria-label="טוען"><div className="p30-skeleton" style={{ height: 22, width: '45%', marginBottom: 12 }} />{Array.from({ length: lines }, (_, i) => <div key={i} className="p30-skeleton" style={{ height: 14, marginBottom: 8, width: `${90 - i * 12}%` }} />)}</div> }
export function ErrorBox({ error, retry }) {
  const msg = error?.message || String(error)
  return <StateBox kind="error" title={error?.status === 401 ? 'נדרשת התחברות' : error?.status === 403 ? 'אין הרשאה' : 'הפעולה נכשלה'} action={retry ? <button type="button" className="p30-btn compact" onClick={retry}>נסה שוב</button> : null}>{msg}</StateBox>
}
export function DemoBanner({ dataMode }) { return dataMode === 'demo' ? <p className="p30-notice amber" role="status">מצב הדגמה: אין בסיס נתונים ואין מפתחות API. כל הליגות, הקבוצות, היחסים והתוצאות כאן פיקטיביים ומתאפסים עם הפעלת השרת מחדש. ראה “בריאות המערכת” לרשימת החיבורים החסרים.</p> : null }
export function Notice({ tone = '', children }) { return <p className={`p30-notice ${tone}`}>{children}</p> }
