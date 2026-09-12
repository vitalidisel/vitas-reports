'use client'
// מעקב הפיילוט — data-component: TrackingPage, PilotCalendar, TicketHistory
import { useState } from 'react'
import { useApi, usePilot30 } from '../lib/client'
import { ils, pct, dateIL, dateTimeIL, STATE_HE } from '../lib/format'
import { Badge, StateBox, Loading, ErrorBox, DemoBanner } from '../components/ui'
import Link from 'next/link'

export default function TrackingPage() {
  const { api, dataMode } = usePilot30()
  const { data, error, loading, reload } = useApi('/tracking')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  if (loading && !data) return <section className="p30-page"><Loading lines={6} /></section>
  if (error && !data) return <section className="p30-page">{error.code === 'no_pilot' || error.status === 404 ? <StateBox kind="empty" title="אין פיילוט פעיל" action={<Link className="p30-btn compact" href="/pilot30/settings">פתיחת פיילוט ←</Link>}>המעקב יתחיל עם הפיילוט.</StateBox> : <ErrorBox error={error} retry={reload} />}</section>
  const { calendar, summary: s, tickets, completedDays, hasData, pilot } = data
  const day = selected ? calendar.find(c => c.dayNumber === selected) : null
  const exportCsv = async () => {
    setBusy(true); setMsg(null)
    try { const res = await api('/tracking/export', { raw: true }); if (!res.ok) throw new Error(`HTTP ${res.status}`); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pilot30-${pilot.mode}-${pilot.startDate}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const review = async (id, resolution) => { if (!confirm(`להכריע את הטופס כ-${STATE_HE[resolution]}? הפעולה מתועדת כאירוע ביקורת.`)) return; setBusy(true); try { await api(`/tickets/${id}/review`, { method: 'POST', body: { resolution, note: 'הכרעה ידנית ממסך המעקב' } }); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  return (
    <section className="p30-page" data-component="TrackingPage" aria-labelledby="tracking-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">PILOT / PERFORMANCE · {pilot.mode}</p><h1 id="tracking-title">{pilot.durationDays} ימים. תמונה מלאה<span className="p30-dot">.</span></h1><p className="p30-sub">כל ההוצאות. כל ההחזרים. בלי להשמיט הפסדים. התחלה {dateIL(pilot.startDate)}</p></div><button type="button" className="p30-btn compact" disabled={busy} onClick={exportCsv}>ייצוא CSV ↓</button></div>
      <DemoBanner dataMode={dataMode} />
      {msg ? <p className="p30-notice red" role="alert">{msg}</p> : null}
      <div className="p30-metrics four">
        <article className="p30-metric"><span>הוצאה בפועל</span><strong>{ils(s.spentMinor)}</strong><small>חיובים שנרשמו · טיוטות אינן הוצאה</small></article>
        <article className="p30-metric"><span>סך ההחזרים</span><strong>{ils(s.returnsMinor)}</strong><small>זיכויים והחזרי ביטול</small></article>
        <article className="p30-metric"><span>תזרים נטו</span><strong className="p30-num">{ils(s.netCashflowMinor, { sign: true })}</strong><small>החזרים פחות הוצאות</small></article>
        <article className="p30-metric"><span>הון פתוח</span><strong>{ils(s.openMinor)}</strong><small>{s.openCount} טפסים שטרם הוכרעו</small></article>
      </div>
      <div className="p30-tracking-grid">
        <article className="p30-card" data-component="PilotCalendar">
          <div className="p30-section-title"><h2>ימי הפיילוט</h2><span className="p30-muted">{completedDays} מתוך {pilot.durationDays} הושלמו</span></div>
          <div className="p30-calendar" role="group" aria-label="לוח ימי הפיילוט">{calendar.map(c => <button type="button" key={c.dayNumber} className={`${c.status} ${selected === c.dayNumber ? 'selected' : ''}`} aria-pressed={selected === c.dayNumber} aria-label={`יום ${c.dayNumber}: ${STATE_HE[c.status] || c.status}`} onClick={() => setSelected(c.dayNumber)}>{c.dayNumber}<small>{STATE_HE[c.status] || c.status}</small></button>)}</div>
          <div className="p30-legend"><span>● זכייה</span><span>● הפסד</span><span>○ דילוג / אין שילוב</span><span>◐ ממתין</span></div>
          <p className="p30-notice" role="status">{day ? `יום ${day.dayNumber} · ${dateIL(day.localDate)} · ${STATE_HE[day.status] || day.status}${day.reason ? ` — ${day.reason}` : ''}${day.stakeMinor ? ` · סכום ${ils(day.stakeMinor)}` : ' · ללא הוצאה בפועל'}${day.actualReturnMinor !== null ? ` · החזר ${ils(day.actualReturnMinor)}` : ''}` : 'בחר יום כדי לראות את מצבו.'}</p>
        </article>
        <article className="p30-card p30-note"><span className="p30-eyebrow">מדידת הצלחה</span><h2>התוצאה היא של<br />החודש כולו.</h2><p>רווח ממומש = החזרי טפסים סגורים פחות סכומיהם. תשואה = רווח ממומש חלקי סכומי הטפסים הסגורים.</p>
          <div className="p30-ticket-line"><span>טפסים סגורים</span><b>{s.closedCount}</b></div>
          <div className="p30-ticket-line"><span>אחוז הצלחה (won ÷ won+lost)</span><b>{pct(s.winRate, 0)}</b></div>
          <div className="p30-ticket-line"><span>רווח ממומש</span><b className="p30-num">{ils(s.realisedNetMinor, { sign: true })}</b></div>
          <div className="p30-ticket-line"><span>תשואה על טפסים סגורים</span><b>{pct(s.realisedRoi, 1)}</b></div>
          <div className="p30-ticket-line"><span>עלויות API (הערכה לתקופה)</span><b>{ils(s.apiCostMinor)}</b></div>
          <div className="p30-ticket-line total"><span>תוצאה אחרי הוצאות תפעול</span><b className="p30-num">{ils(s.netAfterOperatingMinor, { sign: true })}</b></div>
          {!hasData ? <p className="p30-muted" style={{ fontSize: 11 }}>אין גרף לפני שקיימים נתונים של טפסים שננעלו.</p> : null}
        </article>
      </div>
      <article className="p30-card" data-component="TicketHistory">
        <h2>יומן הטפסים</h2>
        {!tickets.length ? <StateBox kind="empty" title="אין טפסים עדיין">היומן יתמלא עם הסריקות היומיות.</StateBox> : (
          <div className="p30-table-scroll"><table><thead><tr><th>תאריך</th><th>סכום</th><th>יחס</th><th>בחירות</th><th>החזר אפשרי</th><th>החזר בפועל</th><th>נעילה</th><th>הכרעה</th><th>מצב</th></tr></thead><tbody>
            {tickets.map(t => <tr key={t.id}><td>{dateIL(t.localDate)}</td><td>{t.state === 'draft' ? `${ils(t.stakeMinor)} מתוכנן` : ils(t.stakeMinor)}</td><td className="p30-num">{t.combinedOdds ?? '—'}</td><td>{t.legs}{t.basis ? ` · ${t.basis === 'model' ? 'מודל' : 'חשבונאי'}` : ''}</td><td>{ils(t.potentialReturnMinor)}</td><td>{t.actualReturnMinor === null || t.actualReturnMinor === undefined ? '—' : ils(t.actualReturnMinor)}</td><td>{t.committedAt ? dateTimeIL(t.committedAt) : '—'}</td><td>{t.settledAt ? dateTimeIL(t.settledAt) : '—'}</td><td><Badge state={t.state} />{t.state === 'pending_review' ? <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}><button type="button" className="p30-btn compact" style={{ minHeight: 36, padding: '4px 8px' }} disabled={busy} onClick={() => review(t.id, 'void')}>ביטול/החזר</button><button type="button" className="p30-btn compact" style={{ minHeight: 36, padding: '4px 8px' }} disabled={busy} onClick={() => review(t.id, 'lost')}>הפסד</button><button type="button" className="p30-btn compact" style={{ minHeight: 36, padding: '4px 8px' }} disabled={busy} onClick={() => review(t.id, 'won')}>זכייה</button></div> : null}</td></tr>)}
          </tbody></table></div>
        )}
        <p className="p30-muted" style={{ fontSize: 11 }}>טיוטות אינן נכללות בסכומי ההוצאה והרווח. טפסים במצב “ממתין לבדיקה” (משחק נדחה/הופסק) מוכרעים ידנית לפי כללי המפעיל ומתועדים כאירוע ביקורת.</p>
      </article>
    </section>
  )
}
