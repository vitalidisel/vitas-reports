'use client'
// בריאות המערכת — last runs, source availability, errors, credits, stale data. No keys shown.
import { useState } from 'react'
import { useApi, usePilot30 } from '../lib/client'
import { dateTimeIL } from '../lib/format'
import { Badge, Loading, ErrorBox, DemoBanner, StateBox } from '../components/ui'

export default function HealthPage() {
  const { api, dataMode } = usePilot30()
  const { data, error, loading, reload } = useApi('/health')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  if (loading && !data) return <section className="p30-page"><Loading lines={8} /></section>
  if (error && !data) return <section className="p30-page"><ErrorBox error={error} retry={reload} /></section>
  const act = async (label, path) => { setBusy(true); setMsg(null); try { const r = await api(path, { method: 'POST' }); setMsg(`${label}: ${JSON.stringify(r.run?.metrics ? { validation: r.run.metrics.validation?.brier, test: r.run.metrics.test?.brier, n: r.run.metrics.test?.n } : r.counts || r.scan || r)}`); reload() } catch (e) { setMsg(`${label} נכשל: ${e.message}`) } finally { setBusy(false) } }
  const names = { database: 'PostgreSQL (Supabase)', auth: 'Auth + OWNER_USER_ID', apiFootball: 'API-Football', oddsApi: 'The Odds API', winner: 'יחסי ווינר', scheduler: 'Scheduler (CRON_SECRET)', llm: 'מודל שפה (אופציונלי)' }
  return (
    <section className="p30-page" aria-labelledby="health-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">SYSTEM / HEALTH</p><h1 id="health-title">בריאות המערכת<span className="p30-dot">.</span></h1><p className="p30-sub">ריצות, זמינות מקורות, שגיאות ומכסות. מפתחות אינם מוצגים.</p></div><Badge tone={dataMode === 'demo' ? 'amber' : 'green'}>{data.storeKind === 'memory' ? 'אחסון בזיכרון (demo)' : 'PostgreSQL'}</Badge></div>
      <DemoBanner dataMode={dataMode} />
      {msg ? <p className="p30-notice" role="status">{msg}</p> : null}
      <div className="p30-two">
        <article className="p30-card"><h2>חיבורים</h2><div className="p30-table-scroll"><table><thead><tr><th>שירות</th><th>מצב</th><th>הערה</th></tr></thead><tbody>
          {Object.entries(data.connections).map(([k, v]) => <tr key={k}><td>{names[k] || k}</td><td>{v.configured ? <Badge tone="green">מחובר</Badge> : k === 'winner' ? <Badge tone="red">unavailable</Badge> : v.required ? <Badge tone="amber">חסר: {v.envVars.join(', ')}</Badge> : <Badge tone="gray">אופציונלי</Badge>}</td><td className="p30-muted">{v.note || ''}</td></tr>)}
        </tbody></table></div>{data.oddsBlocked ? <p className="p30-notice amber">{data.oddsBlocked}</p> : null}</article>
        <article className="p30-card"><h2>משימות מתוזמנות</h2><div className="p30-table-scroll"><table><thead><tr><th>משימה</th><th>ריצה תקינה אחרונה</th><th>מצב</th></tr></thead><tbody>
          {data.jobs.map(j => <tr key={j.job}><td>{j.job}</td><td>{j.lastOk ? dateTimeIL(j.lastOk) : 'טרם רצה'}</td><td>{j.lastError && (!j.lastOk || j.lastError.startedAt > j.lastOk) ? <Badge tone="red">שגיאה</Badge> : j.stale ? <Badge tone="amber">stale</Badge> : <Badge tone="green">תקין</Badge>}</td></tr>)}
        </tbody></table></div><p className="p30-muted" style={{ fontSize: 11 }}>התזמון רץ מ-GitHub Actions / Vercel Cron אל /api/pilot30/cron/* עם CRON_SECRET. זו תוכנית ליישום — הריצות מופיעות כאן רק אחרי שהתזמון הופעל בפועל.</p>
          <div className="p30-two" style={{ marginTop: 10 }}><button type="button" className="p30-btn" disabled={busy} onClick={() => act('הכרעת טפסים פתוחים', '/settle')}>הרצת settlement עכשיו</button><button type="button" className="p30-btn" disabled={busy} onClick={() => act('בדיקת מודל', '/model/evaluate')}>בדיקה כרונולוגית למודל</button></div></article>
      </div>
      <article className="p30-card"><h2>בדיקת היתכנות — יחסי ווינר</h2><p className="p30-muted" style={{ fontSize: 12 }}>בוצעה {data.winner.performedAt} · תוצאה: <b>{data.winner.result}</b></p><div className="p30-table-scroll"><table><thead><tr><th>שאלה</th><th>תשובה</th><th>מצב</th></tr></thead><tbody>{data.winner.criteria.map(c => <tr key={c.id}><td>{c.question}</td><td>{c.answer}</td><td><Badge tone={c.status === 'failed' ? 'red' : 'gray'}>{c.status}</Badge></td></tr>)}</tbody></table></div><p className="p30-notice amber">{data.winner.consequence}</p></article>
      <div className="p30-two">
        <article className="p30-card"><h2>ליגות ומיפוי ספקים</h2>{data.leagues.length ? <div className="p30-table-scroll"><table><thead><tr><th>ליגה</th><th>עונה</th><th>מזהי ספק</th><th>היסטוריה</th></tr></thead><tbody>{data.leagues.map(l => <tr key={l.key}><td>{l.nameHe || l.key}</td><td>{l.season ?? '—'}</td><td className="p30-num">{Object.entries(l.providerIds).map(([p, id]) => `${p}:${id}`).join(' · ') || '—'}</td><td>{l.historySyncedAt ? dateTimeIL(l.historySyncedAt) : (dataMode === 'demo' ? 'seed' : 'טרם')}</td></tr>)}</tbody></table></div> : <StateBox kind="empty">טרם התגלו ליגות (ריצת discover).</StateBox>}
          {data.unverifiedMappings.length ? <div className="p30-notice amber">{data.unverifiedMappings.length} התאמות עמומות ממתינות לבדיקה: {data.unverifiedMappings.map(m => `${m.provider}:${m.externalId}→${m.internalId}`).join(', ')}</div> : null}</article>
        <article className="p30-card"><h2>ריצות מודל</h2>{data.modelRuns.length ? <div className="p30-table-scroll"><table><thead><tr><th>מתי</th><th>גרסה</th><th>Brier (val / test)</th><th>log loss (test)</th><th>n</th></tr></thead><tbody>{data.modelRuns.map(m => <tr key={m.id}><td>{dateTimeIL(m.createdAt)}</td><td>{m.version}</td><td className="p30-num">{m.metrics?.validation?.brier?.toFixed(4) ?? '—'} / {m.metrics?.test?.brier?.toFixed(4) ?? '—'}</td><td className="p30-num">{m.metrics?.test?.logLoss?.toFixed(4) ?? '—'}</td><td>{m.metrics?.test?.n ?? '—'}</td></tr>)}</tbody></table></div> : <StateBox kind="empty">טרם בוצעה בדיקה כרונולוגית.</StateBox>}<p className="p30-muted" style={{ fontSize: 11 }}>Brier של ניחוש אחיד ל-1X2 הוא 0.667. אין backtest רווחיות ללא snapshots של יחסים היסטוריים.</p></article>
      </div>
      <article className="p30-card"><h2>ריצות אחרונות</h2>{data.runs.length ? <div className="p30-table-scroll"><table><thead><tr><th>התחלה</th><th>ספק</th><th>משימה</th><th>מצב</th><th>ספירות</th><th>מכסה</th><th>שגיאה</th></tr></thead><tbody>{data.runs.map(r => <tr key={r.id}><td>{dateTimeIL(r.startedAt)}</td><td>{r.provider}</td><td>{r.job}</td><td><Badge tone={r.status === 'ok' ? 'green' : r.status === 'running' ? 'amber' : 'red'}>{r.status}</Badge></td><td className="p30-num">{Object.entries(r.counts || {}).map(([k, v]) => `${k}:${v}`).join(' ')}</td><td className="p30-num">{r.credits ? Object.entries(r.credits).filter(([k]) => k !== 'at').map(([k, v]) => `${k}:${v ?? '—'}`).join(' ') : '—'}</td><td className="p30-muted">{r.error || ''}</td></tr>)}</tbody></table></div> : <StateBox kind="empty">אין ריצות עדיין.</StateBox>}</article>
    </section>
  )
}
