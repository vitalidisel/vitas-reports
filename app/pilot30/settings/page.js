'use client'
// הגדרות — pilot creation (before start), config versions, connection status. No retroactive changes.
import { useEffect, useState } from 'react'
import { useApi, usePilot30 } from '../lib/client'
import { ils, dateIL, dateTimeIL } from '../lib/format'
import { Badge, Loading, ErrorBox, DemoBanner, Notice } from '../components/ui'

const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())

export default function SettingsPage() {
  const { api, dataMode, status } = usePilot30()
  const { data, error, loading, reload } = useApi('/pilot')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    if (!data || form) return
    const d = data.defaults
    if (data.pilot) setForm({ maxLegs: data.pilot.config.maxLegs, leagues: data.pilot.config.leagues, modelEnabled: data.pilot.config.modelEnabled, rankingMode: data.pilot.config.rankingMode, evThresholdMinor: data.pilot.config.evThresholdMinor ?? '', commitmentPolicy: data.pilot.config.commitmentPolicy, apiCostMinorPerMonth: data.pilot.config.apiCostMinorPerMonth || 0, quoteTtlMinutes: data.pilot.config.quoteTtlMinutes, minSample: data.pilot.config.minSample, reason: '' })
    else setForm({ startDate: todayIL(), mode: dataMode === 'demo' ? 'demo' : 'paper', stake: d.stakeMinor / 100, daily: d.dailyBudgetMinor / 100, budget: d.pilotBudgetMinor / 100, targetNet: d.targetNetMinor / 100, durationDays: d.durationDays, leagues: data.leagues.map(l => l.key), maxLegs: d.maxLegs, commitmentPolicy: 'manual', rankingMode: 'accounting', modelEnabled: dataMode === 'demo', oddsSource: dataMode === 'demo' ? 'demo' : 'winner', bookmaker: '', apiCostMinorPerMonth: 0, quoteTtlMinutes: d.quoteTtlMinutes, minSample: 5 })
  }, [data, form, dataMode])
  if (loading && !data) return <section className="p30-page"><Loading lines={8} /></section>
  if (error && !data) return <section className="p30-page"><ErrorBox error={error} retry={reload} /></section>
  const pilot = data.pilot
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleLeague = k => set('leagues', form.leagues.includes(k) ? form.leagues.filter(x => x !== k) : [...form.leagues, k])
  const submit = async e => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      if (pilot) { const r = await api('/pilot/config', { method: 'POST', body: { maxLegs: Number(form.maxLegs), leagues: form.leagues, modelEnabled: form.modelEnabled, rankingMode: form.rankingMode, evThresholdMinor: form.evThresholdMinor === '' ? null : Number(form.evThresholdMinor), commitmentPolicy: form.commitmentPolicy, apiCostMinorPerMonth: Number(form.apiCostMinorPerMonth), quoteTtlMinutes: Number(form.quoteTtlMinutes), minSample: Number(form.minSample), reason: form.reason } }); setMsg(`נשמרה גרסת הגדרות ${r.pilot.configVersion}`) }
      else { await api('/pilot', { method: 'POST', body: { startDate: form.startDate, mode: form.mode, stakeMinor: Math.round(Number(form.stake) * 100), dailyBudgetMinor: Math.round(Number(form.daily) * 100), pilotBudgetMinor: Math.round(Number(form.budget) * 100), targetNetMinor: Math.round(Number(form.targetNet) * 100), durationDays: Number(form.durationDays), leagues: form.leagues, maxLegs: Number(form.maxLegs), commitmentPolicy: form.commitmentPolicy, rankingMode: form.rankingMode, modelEnabled: form.modelEnabled, oddsSource: form.oddsSource, bookmaker: form.bookmaker || null, apiCostMinorPerMonth: Number(form.apiCostMinorPerMonth), quoteTtlMinutes: Number(form.quoteTtlMinutes), minSample: Number(form.minSample) } }); setMsg('הפיילוט נפתח. מצב הפיילוט ננעל בתחילתו.'); setForm(null) }
      reload()
    } catch (x) { setMsg(x.body?.errors?.join(' · ') || x.message) } finally { setBusy(false) }
  }
  const endPilot = async () => { if (!confirm('לסיים את הפיילוט? התוצאות נשמרות; פיילוט חדש ייפתח בנפרד בלי לערבב תוצאות.')) return; setBusy(true); try { await api('/pilot/end', { method: 'POST' }); setForm(null); reload() } catch (x) { setMsg(x.message) } finally { setBusy(false) } }
  const conn = status?.connections || {}
  return (
    <section className="p30-page" aria-labelledby="settings-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">PILOT / SETTINGS</p><h1 id="settings-title">הגדרות<span className="p30-dot">.</span></h1><p className="p30-sub">תקציב, יעד ומצב נקבעים לפני ההתחלה. אחרי תחילת הפיילוט כל שינוי מותר יוצר גרסה.</p></div>{pilot ? <Badge tone={pilot.status === 'active' ? 'green' : 'gray'}>{pilot.mode} · גרסה {pilot.configVersion}</Badge> : null}</div>
      <DemoBanner dataMode={dataMode} />
      {msg ? <Notice tone={/נשמר|נפתח/.test(msg) ? 'green' : 'red'}>{msg}</Notice> : null}
      <div className="p30-analysis-grid">
        <div>
          {pilot ? (
            <article className="p30-card">
              <div className="p30-section-title"><h2>הפיילוט הנוכחי</h2><span className="p30-muted">נעול מ-{dateIL(pilot.startDate)}</span></div>
              <dl className="p30-kv"><dt>מצב</dt><dd>{pilot.mode === 'paper' ? 'paper — סימולציה עם משחקים אמיתיים' : pilot.mode === 'manual-real' ? 'manual-real — המשתמש שלח טופס בעצמו ומאשר יחסים' : 'demo — נתונים פיקטיביים'}</dd><dt>תאריך התחלה</dt><dd>{dateIL(pilot.startDate)} · {pilot.durationDays} ימים</dd><dt>סכום לטופס</dt><dd>{ils(pilot.config.stakeMinor)}</dd><dt>תקציב יומי / פיילוט</dt><dd>{ils(pilot.config.dailyBudgetMinor)} / {ils(pilot.config.pilotBudgetMinor)}</dd><dt>יעד רווח נטו</dt><dd>{ils(pilot.config.targetNetMinor)} (החזר {ils(pilot.config.stakeMinor + pilot.config.targetNetMinor)}, יחס {((pilot.config.stakeMinor + pilot.config.targetNetMinor) / pilot.config.stakeMinor).toFixed(2)})</dd><dt>מקור יחסים</dt><dd>{pilot.config.oddsSource}{pilot.config.bookmaker ? ` · ${pilot.config.bookmaker}` : ''}</dd></dl>
              {data.oddsBlocked ? <Notice tone="amber">{data.oddsBlocked}</Notice> : null}
              <p className="p30-muted" style={{ fontSize: 11, marginTop: 10 }}>אין שינוי רטרואקטיבי של תקציב, יעד, מצב או מקור יחסים. מעבר בין סימולציה לכסף אמיתי = פיילוט נפרד.</p>
              <button type="button" className="p30-btn danger" style={{ marginTop: 14 }} disabled={busy} onClick={endPilot}>סיום הפיילוט</button>
            </article>
          ) : null}
          {form ? (
            <form className="p30-card" onSubmit={submit}>
              <div className="p30-section-title"><h2>{pilot ? 'הגדרות שניתן לשנות (יוצר גרסה)' : 'פתיחת פיילוט'}</h2></div>
              {!pilot ? (<div className="p30-form-grid">
                <div className="p30-field"><label htmlFor="f-start">תאריך התחלה (ישראל)</label><input id="f-start" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} required /></div>
                <div className="p30-field"><label htmlFor="f-mode">מצב הפיילוט</label><select id="f-mode" value={form.mode} onChange={e => set('mode', e.target.value)} disabled={dataMode === 'demo'}>{dataMode === 'demo' ? <option value="demo">demo (ללא בסיס נתונים)</option> : <><option value="paper">paper — סימולציה</option><option value="manual-real">manual-real — טופס ששלחתי בעצמי</option></>}</select><small>ננעל בתחילת הפיילוט.</small></div>
                <div className="p30-field"><label htmlFor="f-stake">סכום לטופס (₪)</label><input id="f-stake" type="number" min="1" step="0.01" value={form.stake} onChange={e => set('stake', e.target.value)} /></div>
                <div className="p30-field"><label htmlFor="f-daily">תקציב יומי (₪)</label><input id="f-daily" type="number" min="1" step="0.01" value={form.daily} onChange={e => set('daily', e.target.value)} /></div>
                <div className="p30-field"><label htmlFor="f-budget">תקציב הפיילוט (₪)</label><input id="f-budget" type="number" min="1" step="0.01" value={form.budget} onChange={e => set('budget', e.target.value)} /></div>
                <div className="p30-field"><label htmlFor="f-target">יעד רווח נטו לטופס זוכה (₪)</label><input id="f-target" type="number" min="1" step="0.01" value={form.targetNet} onChange={e => set('targetNet', e.target.value)} /><small>החזר נדרש {Number(form.stake) + Number(form.targetNet)} ₪ · יחס {Number(form.stake) > 0 ? ((Number(form.stake) + Number(form.targetNet)) / Number(form.stake)).toFixed(2) : '—'}</small></div>
                <div className="p30-field"><label htmlFor="f-days">משך (ימים)</label><input id="f-days" type="number" min="1" max="366" value={form.durationDays} onChange={e => set('durationDays', e.target.value)} /></div>
                <div className="p30-field"><label htmlFor="f-odds">מקור יחסים</label><select id="f-odds" value={form.oddsSource} onChange={e => set('oddsSource', e.target.value)} disabled={dataMode === 'demo'}>{dataMode === 'demo' ? <option value="demo">מפעיל הדגמה</option> : <><option value="winner">ווינר — חסום עד שיימצא מקור מאומת</option><option value="odds-api">market-paper — The Odds API עם מפעיל בינלאומי</option></>}</select></div>
                {form.oddsSource === 'odds-api' ? <div className="p30-field"><label htmlFor="f-book">מפתח מפעיל ב-The Odds API</label><input id="f-book" value={form.bookmaker} onChange={e => set('bookmaker', e.target.value)} placeholder="למשל pinnacle / bet365 (לפי /v4/sports odds)" required /><small>יחסים ממפעיל בינלאומי אינם יחסי ווינר ולא יוצגו ככאלה.</small></div> : null}
              </div>) : null}
              <div className="p30-form-grid" style={{ marginTop: pilot ? 0 : 14 }}>
                <div className="p30-field"><label htmlFor="f-legs">תקרת בחירות בטופס</label><input id="f-legs" type="number" min="1" max="20" value={form.maxLegs} onChange={e => set('maxLegs', e.target.value)} /><small>ברירת מחדל 8. אינה טענה לתקנון ווינר.</small></div>
                <div className="p30-field"><label htmlFor="f-ttl">TTL ליחסים (דקות)</label><input id="f-ttl" type="number" min="1" max="1440" value={form.quoteTtlMinutes} onChange={e => set('quoteTtlMinutes', e.target.value)} /><small>יחס ישן מזה פוסל נעילה.</small></div>
                <div className="p30-field"><label htmlFor="f-min">מדגם היסטורי מינימלי</label><input id="f-min" type="number" min="0" max="20" value={form.minSample} onChange={e => set('minSample', e.target.value)} /></div>
                <div className="p30-field"><label htmlFor="f-cost">עלות API חודשית משוערת (אגורות)</label><input id="f-cost" type="number" min="0" value={form.apiCostMinorPerMonth} onChange={e => set('apiCostMinorPerMonth', e.target.value)} /><small>מוצג בנפרד מרווח הטפסים.</small></div>
                <div className="p30-field"><label htmlFor="f-policy">מדיניות התחייבות</label><select id="f-policy" value={form.commitmentPolicy} onChange={e => set('commitmentPolicy', e.target.value)}><option value="manual">ידנית אחרי הצגת הטופס (ברירת מחדל)</option><option value="auto-sim">אוטומטית — סימולציה paper בלבד</option></select></div>
                <div className="p30-field"><label htmlFor="f-rank">דירוג שילובים</label><select id="f-rank" value={form.rankingMode} onChange={e => set('rankingMode', e.target.value)}><option value="accounting">חשבונאי בלבד (ללא “מומלץ”)</option><option value="model">לפי מודל ניסיוני</option></select></div>
                <label className="p30-check"><input type="checkbox" checked={form.modelEnabled} onChange={e => set('modelEnabled', e.target.checked)} /> הפעלת מודל פואסון ניסיוני (הסתברויות מסומנות experimental)</label>
                {form.rankingMode === 'model' ? <div className="p30-field"><label htmlFor="f-ev">סף תוחלת רווח (אגורות, ריק = ללא)</label><input id="f-ev" type="number" value={form.evThresholdMinor} onChange={e => set('evThresholdMinor', e.target.value)} /><small>החלטת ניסוי, לא הוכחת רווח. ננעל לפני הפיילוט.</small></div> : null}
              </div>
              <div className="p30-field" style={{ marginTop: 14 }}><label>ליגות</label><div className="p30-chips" role="group" aria-label="בחירת ליגות">{data.leagues.map(l => <button type="button" key={l.key} className={form.leagues.includes(l.key) ? 'active' : ''} aria-pressed={form.leagues.includes(l.key)} onClick={() => toggleLeague(l.key)}>{l.nameHe}</button>)}</div><small>ללא ידידות, נוער וגביעים בגרסה הראשונה.</small></div>
              {pilot ? <div className="p30-field" style={{ marginTop: 14 }}><label htmlFor="f-reason">סיבת השינוי</label><input id="f-reason" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="נשמר בהיסטוריית הגרסאות" /></div> : null}
              <button type="submit" className="p30-btn primary" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'שומר…' : pilot ? 'שמירת גרסה חדשה' : 'פתיחת הפיילוט'} <span aria-hidden="true">←</span></button>
            </form>
          ) : null}
          {data.versions?.length ? <article className="p30-card"><h2>גרסאות הגדרות</h2><div className="p30-table-scroll"><table><thead><tr><th>גרסה</th><th>מתי</th><th>סיבה</th><th>תקרת בחירות</th><th>דירוג</th><th>מודל</th></tr></thead><tbody>{data.versions.map(v => <tr key={v.version}><td>{v.version}</td><td>{dateTimeIL(v.createdAt)}</td><td>{v.reason || '—'}</td><td>{v.config.maxLegs}</td><td>{v.config.rankingMode}</td><td>{v.config.modelEnabled ? 'פעיל' : 'כבוי'}</td></tr>)}</tbody></table></div></article> : null}
        </div>
        <aside>
          <article className="p30-card"><h2>מצב החיבורים</h2><div className="p30-table-scroll"><table><thead><tr><th>שירות</th><th>מצב</th></tr></thead><tbody>
            {Object.entries(conn).map(([k, v]) => <tr key={k}><td>{{ database: 'PostgreSQL (Supabase)', auth: 'Auth + OWNER_USER_ID', apiFootball: 'API-Football', oddsApi: 'The Odds API', winner: 'יחסי ווינר', scheduler: 'Scheduler (CRON_SECRET)', llm: 'מודל שפה' }[k] || k}</td><td>{v.configured ? <Badge tone="green">מחובר</Badge> : k === 'winner' ? <Badge tone="red">אין מקור מאומת</Badge> : v.required ? <Badge tone="amber">חסר</Badge> : <Badge tone="gray">אופציונלי</Badge>}<div className="p30-muted" style={{ fontSize: 10 }}>{v.envVars.join(', ')}</div></td></tr>)}
          </tbody></table></div><p className="p30-muted" style={{ fontSize: 11 }}>מפתחות אינם מוצגים לעולם. הזנה במשתני סביבה של הפלטפורמה בלבד.</p></article>
          {data.pilots?.length > 1 ? <article className="p30-card p30-note"><h3>פיילוטים קודמים</h3><ul>{data.pilots.filter(p => p.status !== 'active').map(p => <li key={p.id}>{p.mode} · מ-{dateIL(p.startDate)} · {p.status}</li>)}</ul></article> : null}
        </aside>
      </div>
    </section>
  )
}
