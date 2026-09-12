'use client'
// היום שלי — data-component: TodayPage, TargetCard, BudgetMetrics, ResearchPipeline, DailyTicket
import Link from 'next/link'
import { useState } from 'react'
import { useApi, usePilot30 } from './lib/client'
import { ils, pct, timeIL, dateTimeIL, MARKET_HE, SELECTION_HE } from './lib/format'
import { Badge, StateBox, Loading, ErrorBox, DemoBanner, Notice } from './components/ui'

export default function TodayPage() {
  const { api, dataMode } = usePilot30()
  const { data, error, loading, reload } = useApi('/today')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [skipReason, setSkipReason] = useState('')
  const [askSkip, setAskSkip] = useState(false)
  const [confirm, setConfirm] = useState({})

  const run = async (label, fn) => { setBusy(label); setMsg(null); try { const r = await fn(); setMsg(r); reload() } catch (e) { setMsg({ error: e.message, extra: e.body }) } finally { setBusy(null) } }

  if (loading && !data) return <section className="p30-page"><Loading lines={5} /></section>
  if (error && !data) return <section className="p30-page"><ErrorBox error={error} retry={reload} /></section>
  const { pilot, state, day, ticket, target, budget, sources } = data
  if (!pilot) return (
    <section className="p30-page" aria-labelledby="today-title">
      <Heading dayNumber={null} today={state?.today} />
      <DemoBanner dataMode={dataMode} />
      <StateBox kind="empty" title="אין פיילוט פעיל" action={<Link className="p30-btn compact" href="/pilot30/settings">פתיחת פיילוט בהגדרות ←</Link>}>בחר תאריך התחלה, מצב (paper / manual-real) ותקציב. ברירת המחדל: 10 ₪ ליום, 300 ₪ לפיילוט, יעד רווח 200 ₪.</StateBox>
    </section>
  )
  const c = pilot.config
  const ttl = c.quoteTtlMinutes
  const stale = Boolean(ticket && ticket.state === 'draft' && ticket.staleQuotes)
  const scanStatus = day?.scan?.status || day?.status || null
  const outside = !state.dayNumber
  const canAct = !outside && ticket?.state === 'draft'
  const canSkip = !outside && !['committed', 'settled'].includes(day?.status) && !(ticket && ticket.state !== 'draft')
  const pipelineSteps = [
    { n: '01', title: 'משחקים ויחסים', text: sources.football ? `מקור משחקים: ${sources.football}. ${sources.odds ? `יחסים: ${sources.odds} (${c.bookmaker})` : (sources.blocked || 'אין מקור יחסים')}` : 'אין חיבור לספק משחקים', ok: Boolean(sources.football && sources.odds), fail: Boolean(!sources.football || !sources.odds) },
    { n: '02', title: 'היסטוריה והרכבים', text: day?.scan ? `${day.scan.fixtures ?? 0} משחקים נבדקו · חלונות 5/10/20 · הרכבים כשפורסמו` : 'ממתין לסריקה', ok: Boolean(day?.scan) },
    { n: '03', title: 'בדיקת הטופס', text: day?.scan?.search ? `${day.scan.candidates} בחירות כשירות · ${day.scan.search.options ?? 0} שילובים ≥ ${day.scan.search.target}` : 'ממתין לסריקה', ok: Boolean(day?.scan?.search) },
  ]
  return (
    <section className="p30-page" data-component="TodayPage" aria-labelledby="today-title">
      <Heading dayNumber={state.dayNumber} today={state.today} duration={pilot.durationDays} mode={pilot.mode} ended={state.ended} started={state.started} />
      <DemoBanner dataMode={dataMode} />
      {outside ? <Notice tone="amber">{state.ended ? `הפיילוט הסתיים ב-${state.endDate}. התוצאות במסך המעקב.` : `הפיילוט מתחיל ב-${pilot.startDate}. עד אז אין סריקה ואין טפסים.`}</Notice> : null}
      <div className="p30-dashboard-grid">
        <div className="p30-primary-column">
          <article className="p30-hero" data-component="TargetCard">
            <div><span className="p30-hero-label">יעד רווח מטופס זוכה</span><div className="p30-hero-number p30-num">₪{Math.round(target.targetNetMinor / 100)}<span> / טופס זוכה</span></div><p>היעד הוא אפשרות להחזר, לא תחזית הכנסה. אין הבטחה לטופס מתאים בכל יום.</p></div>
            <div className="p30-hero-bottom"><span>סכום לטופס <b>{ils(target.stakeMinor)}</b></span><span>החזר נדרש <b>{ils(target.requiredReturnMinor)}</b></span><span>יחס נדרש <b className="p30-num">{target.requiredOdds}</b></span></div>
          </article>
          <div className="p30-metrics" data-component="BudgetMetrics">
            <article className="p30-metric"><span>תקציב יומי</span><strong>{budget.dailyMinor / 100} <small>₪</small></strong><small>עד טופס אחד ביום</small></article>
            <article className="p30-metric"><span>תקציב הפיילוט</span><strong>{budget.pilotMinor / 100} <small>₪</small></strong><small>נוצל {ils(budget.spentMinor)} · פתוח {ils(budget.openMinor)}</small></article>
            <article className="p30-metric"><span>רווח ממומש</span><strong className="p30-num">{ils(budget.realisedNetMinor, { sign: true })}</strong><small>{budget.closedCount ? `${budget.closedCount} טפסים סגורים` : 'טרם נשמרו תוצאות'}</small></article>
          </div>
          <article className="p30-card" data-component="ResearchPipeline">
            <div className="p30-section-title"><h2>מה בודקים היום?</h2><span className="p30-muted">{sources.lastScan ? `סריקה אחרונה ${dateTimeIL(sources.lastScan.at)} · ${sources.lastScan.status === 'ok' ? 'תקין' : 'שגיאה'}` : 'טרם בוצעה סריקה'}</span></div>
            <div className="p30-pipeline">{pipelineSteps.map(s => <div key={s.n} className={s.fail ? 'fail' : s.ok ? 'done' : 'idle'}><i>{s.n}</i><h3>{s.title}</h3><p>{s.text}</p></div>)}</div>
            <button type="button" className="p30-btn primary" disabled={busy !== null || outside || ['committed', 'settled', 'skipped'].includes(day?.status)} onClick={() => run('scan', () => api('/scan', { method: 'POST' }))}>{busy === 'scan' ? 'סורק…' : 'הרצת סריקה עכשיו'} <span aria-hidden="true">←</span></button>
            {sources.blocked ? <p className="p30-notice amber" role="status">{sources.blocked}</p> : null}
            {scanStatus ? <ScanSummary day={day} /> : null}
            {msg?.error ? <p className="p30-notice red" role="alert">{msg.error}{msg.extra?.stale ? ' — היחסים התיישנו. הרץ סריקה ואז התחייב.' : ''}</p> : null}
            {msg?.scan ? <p className="p30-notice" role="status">הסריקה הסתיימה: {statusText(msg.scan.status)}{msg.scan.reason ? ` — ${msg.scan.reason}` : ''}</p> : null}
            {msg?.alreadyCommitted !== undefined ? <p className="p30-notice green" role="status">{msg.alreadyCommitted ? 'הטופס כבר היה נעול — לא בוצע חיוב נוסף.' : 'הטופס ננעל וחויב פעם אחת בסימולציה.'}</p> : null}
            {msg?.day ? <p className="p30-notice" role="status">היום סומן כדילוג: {msg.day.reason}</p> : null}
          </article>
          <article className="p30-card p30-league-card"><div><h2>הליגות במעקב</h2><p className="p30-muted">{dataMode === 'demo' ? 'ליגות הדגמה פיקטיביות' : 'לפי הגדרות הפיילוט'}</p></div><div className="p30-chips">{c.leagues.map(l => <span key={l}>{l}</span>)}</div></article>
        </div>
        <aside className="p30-ticket-column">
          <article className="p30-card p30-ticket" data-component="DailyTicket">
            <div className="p30-section-title"><h2>הטופס של היום</h2>{ticket ? <Badge state={ticket.state} /> : <Badge state={day?.status || 'open'} />}</div>
            {!ticket ? (<>
              <div className="p30-empty-graphic" aria-hidden="true">▤</div>
              <h3>{day?.status === 'no_candidate' ? 'אין שילוב מתאים היום' : day?.status === 'no_fixtures' ? 'אין משחקים היום' : day?.status === 'missing_info' ? 'חסר מידע' : day?.status === 'skipped' ? 'דילגנו על היום' : 'כל בחירה צריכה סיבה'}</h3>
              <p className="p30-muted">{day?.reason || 'המשחקים יופיעו כאן לאחר בדיקת הנתונים והיחסים.'}</p>
            </>) : (<>
              {stale ? <p className="p30-notice amber" role="status">היחסים בטיוטה עברו את ה-TTL ({ttl} דק׳). יש להריץ סריקה לפני התחייבות.</p> : null}
              <ul className="p30-legs">{ticket.legs.map((l, i) => { const f = ticket.fixtures[l.fixtureId]; return <li key={i}><b>{f ? `${f.homeTeamName} – ${f.awayTeamName}` : l.fixtureId}</b><span className="odds p30-num">{l.acceptedOdds || l.odds}</span><small>{MARKET_HE[l.market]} · {SELECTION_HE[l.selection]} · {f ? timeIL(f.kickoffUtc) : ''} · {l.bookmaker}{l.outcome && l.outcome !== 'pending' ? ` · ${l.outcome}` : ''}</small>{pilot.mode === 'manual-real' && ticket.state === 'draft' ? <input aria-label={`היחס שהתקבל בפועל לבחירה ${i + 1}`} placeholder="יחס שהתקבל" inputMode="decimal" value={confirm[i] ?? ''} onChange={e => setConfirm({ ...confirm, [i]: e.target.value })} style={{ gridColumn: '1/-1' }} /> : null}</li> })}</ul>
            </>)}
            <div className="p30-ticket-line"><span>בחירות שנוספו</span><b>{ticket?.legs.length ?? 0}</b></div>
            <div className="p30-ticket-line"><span>יחס משולב</span><b className="p30-num">{ticket?.combinedOdds ?? '—'}</b></div>
            <div className="p30-ticket-line"><span>החזר אפשרי</span><b>{ticket ? ils(ticket.potentialReturnMinor) : '—'}</b></div>
            <div className="p30-ticket-line"><span>סף איזון (1/יחס)</span><b>{ticket ? pct(ticket.meta?.breakEvenProbability) : '—'}</b></div>
            <div className="p30-ticket-line"><span>{ticket?.meta?.jointProbability != null ? 'הסתברות משוערת (מודל ניסיוני, הנחת עצמאות)' : 'הסתברות עצמאית'}</span><b>{ticket?.meta?.jointProbability != null ? pct(ticket.meta.jointProbability, 2) : 'טרם חושבה'}</b></div>
            <div className="p30-ticket-line total"><span>רווח אפשרי נטו</span><b>{ticket ? ils(ticket.potentialReturnMinor - ticket.stakeMinor) : '—'}</b></div>
            {ticket?.basis === 'accounting' ? <p className="p30-notice" style={{ marginTop: 0, marginBottom: 12 }}>שילוב שעומד חשבונאית ביעד. אין תווית “מומלץ” ואין טענת רווחיות.</p> : null}
            {canAct ? <button type="button" className="p30-btn primary" disabled={busy !== null || stale} onClick={() => run('commit', () => api(`/tickets/${ticket.id}/commit`, { method: 'POST', body: { confirmedOdds: pilot.mode === 'manual-real' ? ticket.legs.map((l, i) => ({ fixtureId: l.fixtureId, market: l.market, selection: l.selection, odds: confirm[i] })) : null } }))}>{busy === 'commit' ? 'נועל…' : pilot.mode === 'manual-real' ? 'אישור היחסים ונעילת הטופס' : 'התחייבות לטופס (סימולציה)'} <span aria-hidden="true">←</span></button> : null}
            {ticket && ticket.state !== 'draft' ? <p className="p30-muted" style={{ fontSize: 11 }}>ננעל {dateTimeIL(ticket.committedAt)} · לא ניתן להחליף בחירות אחרי נעילה</p> : null}
            {ticket?.state === 'draft' ? <Link className="p30-btn" href={`/pilot30/matches/${ticket.legs[0]?.fixtureId}`} style={{ marginTop: 10 }}>פתיחת ניתוח הבחירה הראשונה ←</Link> : null}
            {canSkip ? (askSkip ? <div style={{ textAlign: 'start', marginTop: 12 }}><div className="p30-field"><label htmlFor="skip-reason">סיבת הדילוג</label><textarea id="skip-reason" value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="למשל: אין נתוני הרכבים, יחסים ישנים, מדגם קטן" /></div><div className="p30-two" style={{ marginTop: 10 }}><button type="button" className="p30-btn" disabled={busy !== null} onClick={() => run('skip', () => api('/days/skip', { method: 'POST', body: { reason: skipReason } }))}>אישור דילוג</button><button type="button" className="p30-btn" onClick={() => setAskSkip(false)}>ביטול</button></div></div> : <button type="button" className="p30-text-button" onClick={() => setAskSkip(true)}>אין בחירות מתאימות? דילוג על היום</button>) : null}
          </article>
          <article className="p30-card p30-note"><span className="p30-eyebrow">כלל העבודה</span><h3>קודם בודקים.<br />אחר כך מצרפים.</h3><p>לא מוסיפים משחק כדי להשלים יחס. יום ללא טופס הוא תוצאה אפשרית. אין הגדלת סכום אחרי הפסד ואין גלגול זכיות.</p></article>
        </aside>
      </div>
    </section>
  )
}

function Heading({ dayNumber, today, duration = 30, mode, ended, started }) {
  return <div className="p30-page-heading"><div><p className="p30-eyebrow">PILOT / DAY {dayNumber ? String(dayNumber).padStart(2, '0') : '--'}{mode ? ` / ${mode}` : ''}</p><h1 id="today-title">היום שלי<span className="p30-dot">.</span></h1><p className="p30-sub">מתחילים עם נתונים. מסיימים עם החלטה. {today ? `· ${today}` : ''}</p></div><span className="p30-day-tag">{dayNumber ? <>יום <b>{dayNumber}</b> מתוך {duration}</> : ended ? 'הפיילוט הסתיים' : started === false ? 'טרם התחיל' : 'אין פיילוט'}</span></div>
}

function statusText(s) { return { candidate: 'נמצא טופס מועמד', no_candidate: 'אין שילוב מתאים', no_fixtures: 'אין משחקים היום', missing_info: 'חסר מידע', error: 'שגיאה', committed: 'היום כבר נעול', settled: 'היום הוכרע', skipped: 'היום סומן כדילוג', outside_pilot: 'מחוץ לטווח הפיילוט' }[s] || s }

function ScanSummary({ day }) {
  const s = day.scan
  const excluded = s?.excluded || []
  return (
    <div className="p30-notice" role="status">
      <b>תוצאת הסריקה:</b> {statusText(s?.status || day.status)}{day.reason ? ` — ${day.reason}` : ''}{s?.cutoffUtc ? ` · cutoff ${dateTimeIL(s.cutoffUtc)}` : ''}
      {s?.search ? <div>יחס יעד {s.search.target} · בסיס: {s.search.basis === 'model' ? 'מודל ניסיוני' : 'חשבונאי בלבד'} · נבדקו {s.search.explored} צמתים · {s.search.options} שילובים עומדים ביעד</div> : null}
      {excluded.length ? <details><summary>סיבות פסילה ({excluded.length} משחקים)</summary><ul>{excluded.map((e, i) => <li key={i}>{e.fixtureId}: {e.reasons ? e.reasons.join(', ') : [...new Set((e.selections || []).flatMap(x => x.reasons))].join(', ')}</li>)}</ul></details> : null}
    </div>
  )
}
