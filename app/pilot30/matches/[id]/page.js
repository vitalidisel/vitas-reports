'use client'
// ניתוח משחק — data-component: AnalysisPage, MatchHeader, MarketAssessment
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useApi, usePilot30 } from '../../lib/client'
import { pct, timeIL, dateTimeIL, dateIL, agoMinutes, MARKET_HE, SELECTION_HE, FIXTURE_STATUS_HE } from '../../lib/format'
import { Badge, Loading, ErrorBox, DemoBanner } from '../../components/ui'

const num = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d))

export default function AnalysisPage() {
  const { id } = useParams()
  const { dataMode } = usePilot30()
  const { data, error, loading, reload } = useApi(`/fixtures/${id}`, [id])
  const [pick, setPick] = useState(null)
  if (loading && !data) return <section className="p30-page"><Loading lines={8} /></section>
  if (error && !data) return <section className="p30-page"><ErrorBox error={error} retry={reload} /><p style={{ marginTop: 12 }}><Link className="p30-btn compact" href="/pilot30/matches">חזרה למשחקים</Link></p></section>
  const { fixture: f, analysis: a, markets } = data
  const home = a.inputs.home, away = a.inputs.away
  const sel = pick ? markets.find(m => m.market === pick.market && m.selection === pick.selection) : markets.find(m => m.eligible) || markets[0]
  const statusBadge = f.status === 'NS' ? (f.lineups?.status === 'published' ? <Badge tone="green">הרכבים פורסמו</Badge> : <Badge tone="amber">הרכבים טרם אושרו</Badge>) : <Badge tone="gray">{FIXTURE_STATUS_HE[f.status] || f.status}</Badge>
  const w = (t, k) => t.windows[k]
  return (
    <section className="p30-page" data-component="AnalysisPage" aria-labelledby="analysis-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">RESEARCH / MATCH DETAIL</p><h1 id="analysis-title">ניתוח משחק<span className="p30-dot">.</span></h1><p className="p30-sub">התמונה שמאחורי היחס. cutoff הניתוח: {dateTimeIL(a.cutoffUtc)}</p></div>{f.dataMode === 'demo' ? <Badge tone="amber">משחק הדגמה</Badge> : <Badge>{f.source}</Badge>}</div>
      <DemoBanner dataMode={dataMode} />
      <div className="p30-analysis-grid">
        <div>
          <article className="p30-card p30-match-banner" data-component="MatchHeader">
            <span className="p30-eyebrow">{f.leagueName} · {dateIL(f.localDate)} · {timeIL(f.kickoffUtc)} (ישראל)</span>
            <div className="p30-teams"><div><span className="p30-shirt p30-home" aria-hidden="true">{f.homeTeamName.slice(0, 1)}</span><h2>{f.homeTeamName}</h2></div><b className="p30-versus">VS</b><div><span className="p30-shirt p30-away" aria-hidden="true">{f.awayTeamName.slice(0, 1)}</span><h2>{f.awayTeamName}</h2></div></div>
            {statusBadge}{f.status === 'FT' ? <p style={{ marginTop: 8 }}><b className="p30-num">{f.ftHome} – {f.ftAway}</b> (90 דק׳)</p> : null}
          </article>
          <article className="p30-card">
            <div className="p30-section-title"><h2>10 המשחקים האחרונים</h2><span className="p30-muted">האחרון משמאל · לפני ה-cutoff בלבד</span></div>
            <FormRow label="בית" team={home} />
            <FormRow label="חוץ" team={away} />
            <div className="p30-legend"><span>W ניצחון</span><span>D תיקו</span><span>L הפסד</span><span>מנוחה: בית {num(home.restDays, 0)} ימים · חוץ {num(away.restDays, 0)} ימים</span></div>
          </article>
          <article className="p30-card">
            <h2>השוואת ביצועים</h2>
            <div className="p30-table-scroll"><table><thead><tr><th>מדד</th><th>בית (10)</th><th>חוץ (10)</th><th>בית ב-5</th><th>חוץ ב-5</th><th>בית ב-20</th><th>חוץ ב-20</th></tr></thead><tbody>
              <tr><td>מדגם</td><td>{w(home, 'w10').sample}</td><td>{w(away, 'w10').sample}</td><td>{w(home, 'w5').sample}</td><td>{w(away, 'w5').sample}</td><td>{w(home, 'w20').sample}</td><td>{w(away, 'w20').sample}</td></tr>
              <tr><td>שערי זכות למשחק</td><td>{num(w(home, 'w10').gfPerGame)}</td><td>{num(w(away, 'w10').gfPerGame)}</td><td>{num(w(home, 'w5').gfPerGame)}</td><td>{num(w(away, 'w5').gfPerGame)}</td><td>{num(w(home, 'w20').gfPerGame)}</td><td>{num(w(away, 'w20').gfPerGame)}</td></tr>
              <tr><td>שערי חובה למשחק</td><td>{num(w(home, 'w10').gaPerGame)}</td><td>{num(w(away, 'w10').gaPerGame)}</td><td>{num(w(home, 'w5').gaPerGame)}</td><td>{num(w(away, 'w5').gaPerGame)}</td><td>{num(w(home, 'w20').gaPerGame)}</td><td>{num(w(away, 'w20').gaPerGame)}</td></tr>
              <tr><td>נקודות למשחק</td><td>{num(w(home, 'w10').ppg)}</td><td>{num(w(away, 'w10').ppg)}</td><td>{num(w(home, 'w5').ppg)}</td><td>{num(w(away, 'w5').ppg)}</td><td>{num(w(home, 'w20').ppg)}</td><td>{num(w(away, 'w20').ppg)}</td></tr>
              <tr><td>משחקים ללא ספיגה</td><td>{w(home, 'w10').cleanSheets ?? '—'}</td><td>{w(away, 'w10').cleanSheets ?? '—'}</td><td colSpan={4} className="p30-muted">ללא הבקעה: בית {w(home, 'w10').failedToScore ?? '—'} · חוץ {w(away, 'w10').failedToScore ?? '—'}</td></tr>
              <tr><td>בבית / בחוץ בלבד (10)</td><td>{num(home.venueSplit.ppg)} נק׳ ({home.venueSplit.sample})</td><td>{num(away.venueSplit.ppg)} נק׳ ({away.venueSplit.sample})</td><td colSpan={4} className="p30-muted">חוזק יריבות (נק׳/משחק של היריבות): בית {num(home.opponentStrength)} · חוץ {num(away.opponentStrength)}</td></tr>
            </tbody></table></div>
            <p className="p30-notice">ההיסטוריה לבדה אינה הסתברות: יש להתחשב ביריבות, בבית וחוץ ובסגל. H2H הוא הקשר משני.</p>
            {a.inputs.h2h?.length ? <details style={{ marginTop: 10, fontSize: 12 }}><summary>מפגשים קודמים ({a.inputs.h2h.length})</summary><ul style={{ paddingInlineStart: 18 }}>{a.inputs.h2h.map(h => <li key={h.fixtureId}>{dateTimeIL(h.kickoffUtc)}: {h.homeName} {h.ftHome}–{h.ftAway} {h.awayName}</li>)}</ul></details> : null}
          </article>
        </div>
        <aside>
          <article className="p30-card p30-market" data-component="MarketAssessment">
            <span className="p30-eyebrow">שווקים לבדיקה · {sel?.bookmaker || 'אין מפעיל'}</span>
            <div className="p30-market-tabs" role="tablist" aria-label="בחירת שוק">{markets.map(m => <button type="button" role="tab" aria-selected={sel === m} key={m.market + m.selection} className={`${sel === m ? 'active' : ''} ${m.odds ? '' : 'off'}`} onClick={() => setPick({ market: m.market, selection: m.selection })}>{SELECTION_HE[m.selection]} · <span className="p30-num">{m.odds ?? '—'}</span></button>)}</div>
            {sel ? (<>
              <h2>{MARKET_HE[sel.market]} — {SELECTION_HE[sel.selection]}</h2>
              <div className="p30-market-numbers"><div><small>יחס{sel.status === 'suspended' ? ' (מושעה)' : ''}</small><strong className="p30-num">{sel.odds ?? '—'}</strong></div><div><small>סף איזון (1/יחס)</small><strong>{pct(sel.breakEven)}</strong></div></div>
              {sel.probability !== null && sel.probability !== undefined ? <div className={`p30-notice ${sel.probability > sel.breakEven ? 'green' : 'amber'}`}>הסתברות מודל ניסיוני: <b>{pct(sel.probability)}</b> ({a.modelVersion}). {sel.probability > sel.breakEven ? 'מעל סף האיזון' : 'מתחת לסף האיזון'} — זו הערכה סטטיסטית לא מכוילת, לא סיכוי מוכח.</div> : <div className="p30-notice amber">הסתברות עצמאית טרם חושבה{a.modelNote ? ` — ${a.modelNote}` : ''}</div>}
              <dl><dt>מקור היחס</dt><dd>{sel.bookmaker ? `${sel.bookmaker}${f.dataMode === 'demo' ? ' (הדגמה)' : ''}` : 'אין'}</dd><dt>עדכון במקור</dt><dd>{sel.sourceUpdatedAt ? `${timeIL(sel.sourceUpdatedAt)} (לפני ${agoMinutes(sel.sourceUpdatedAt, new Date(data.serverNow).getTime())} דק׳)` : 'לא זמין'}</dd><dt>נמשך</dt><dd>{sel.fetchedAt ? timeIL(sel.fetchedAt) : '—'}</dd><dt>כשירות לבחירה</dt><dd>{sel.eligible ? <Badge tone="green">כשיר</Badge> : <Badge tone="amber">לא כשיר</Badge>}</dd></dl>
              {!sel.eligible ? <ul className="p30-notice" style={{ margin: 0, paddingInlineStart: 30 }}>{sel.reasons.map(r => <li key={r}>{r}</li>)}</ul> : null}
              <p className="p30-muted" style={{ fontSize: 10, marginTop: 12 }}>שוק 90 דקות + זמן פציעות. ללא הארכה ופנדלים. הבחירה נכנסת לטופס רק דרך הסריקה היומית — אין הוספה ידנית של בחירות חלשות.</p>
            </>) : null}
            {data.oddsBlocked ? <p className="p30-notice amber">{data.oddsBlocked}</p> : null}
          </article>
          <article className="p30-card p30-note"><h3>מה עוד חסר?</h3><ul>{a.missingData.map(m => <li key={m}>{m}</li>)}</ul><p style={{ marginTop: 8 }}>שלמות נתונים: {pct(a.inputs.completeness, 0)} (מדד נוכחות קלט, לא סיכוי זכייה)</p></article>
          {a.uncertainties ? <article className="p30-card p30-note"><h3>מודל ניסיוני</h3><p>λ בית {num(a.uncertainties.lambda?.home)} · λ חוץ {num(a.uncertainties.lambda?.away)} · מדגם אימון {a.uncertainties.sample?.home}/{a.uncertainties.sample?.away} · אי-ודאות {num(a.uncertainties.overall)} · שארית מטריצה {num(a.uncertainties.residualMass, 5)}</p><p>פואסון עם עוצמת התקפה/הגנה, יתרון בית ומשקל זמן. ללא התאמות שרירותיות לפציעות או מוטיבציה.</p></article> : null}
        </aside>
      </div>
      <p><Link className="p30-btn compact" href="/pilot30/matches">← חזרה לרשימת המשחקים</Link></p>
    </section>
  )
}

function FormRow({ label, team }) {
  const w = team.windows.w10
  return <div className="p30-form-team"><b>{label}</b><span className="p30-muted">{w.sample ? `${w.wins} ניצחונות · ${w.draws} תיקו · ${w.losses} הפסדים` : 'אין מדגם'}</span>
    {team.form10 ? <div className="p30-form" aria-label={`רצף ${label}: ${team.form10}`}>{[...team.form10].reverse().map((r, i) => <span key={i} className={`p30-${r}`} title={{ W: 'ניצחון', D: 'תיקו', L: 'הפסד' }[r]}>{r}</span>)}</div> : <div className="p30-state" style={{ padding: 10, marginTop: 8 }}>אין היסטוריה לפני ה-cutoff</div>}
    {team.last10?.length ? <details style={{ fontSize: 11, marginTop: 8 }}><summary>פירוט</summary><ul style={{ paddingInlineStart: 18 }}>{team.last10.map(m => <li key={m.fixtureId}>{dateTimeIL(m.kickoffUtc)} · {m.home ? 'בית' : 'חוץ'} מול {m.opponentName} · {m.gf}–{m.ga} ({m.result})</li>)}</ul></details> : null}
  </div>
}
