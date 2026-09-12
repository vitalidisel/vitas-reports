'use client'
// משחקים — list with league + kickoff filter; opens the analysis screen.
import Link from 'next/link'
import { useState } from 'react'
import { useApi, usePilot30 } from '../lib/client'
import { timeIL, dateTimeIL, FIXTURE_STATUS_HE } from '../lib/format'
import { Badge, StateBox, Loading, ErrorBox, DemoBanner } from '../components/ui'

export default function MatchesPage() {
  const { dataMode } = usePilot30()
  const [date, setDate] = useState('')
  const [league, setLeague] = useState('all')
  const [sort, setSort] = useState('time')
  const { data, error, loading, reload } = useApi(`/fixtures${date ? `?date=${date}` : ''}`, [date])
  const list = (data?.fixtures || []).filter(f => league === 'all' || f.leagueKey === league).sort((a, b) => sort === 'time' ? a.kickoffUtc.localeCompare(b.kickoffUtc) : a.leagueName.localeCompare(b.leagueName, 'he'))
  return (
    <section className="p30-page" aria-labelledby="matches-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">RESEARCH / FIXTURES</p><h1 id="matches-title">משחקים<span className="p30-dot">.</span></h1><p className="p30-sub">רק משחקים שמתחילים באותו יום בשעון ישראל נכנסים לטופס.</p></div>
        <div className="p30-field" style={{ minWidth: 180 }}><label htmlFor="fx-date">תאריך (ישראל)</label><input id="fx-date" type="date" value={date || data?.date || ''} onChange={e => setDate(e.target.value)} /></div></div>
      <DemoBanner dataMode={dataMode} />
      <div className="p30-card">
        <div className="p30-section-title"><h2>{data?.date ? `משחקי ${data.date}` : 'משחקים'}</h2><span className="p30-muted">{data?.lastSync ? `משיכה אחרונה ${dateTimeIL(data.lastSync.startedAt)} · ${data.lastSync.status === 'ok' ? 'תקין' : 'שגיאה'}` : 'טרם נמשכו משחקים ליום זה — הרץ סריקה במסך היום'}</span></div>
        <div className="p30-chips" role="group" aria-label="סינון ליגה" style={{ marginBottom: 14 }}>
          <button type="button" className={league === 'all' ? 'active' : ''} onClick={() => setLeague('all')}>כל הליגות</button>
          {(data?.leagues || []).map(l => <button type="button" key={l.key} className={league === l.key ? 'active' : ''} onClick={() => setLeague(l.key)}>{l.nameHe}</button>)}
          <button type="button" className={sort === 'time' ? 'active' : ''} onClick={() => setSort('time')}>לפי שעת פתיחה</button>
          <button type="button" className={sort === 'league' ? 'active' : ''} onClick={() => setSort('league')}>לפי ליגה</button>
        </div>
        {loading && !data ? <Loading lines={6} /> : error && !data ? <ErrorBox error={error} retry={reload} /> : !data?.fixtures?.length ? (
          data?.lastSync?.status === 'error' ? <StateBox kind="error" title="משיכת המשחקים נכשלה">{data.lastSync.error}</StateBox> : <StateBox kind="empty" title="אין משחקים">{data?.lastSync ? 'אין משחקים ביום זה בליגות שנבחרו.' : 'עדיין לא נמשכו משחקים ליום זה. הרץ סריקה במסך “היום שלי” (או המתן לריצה המתוזמנת של 09:00).'}</StateBox>
        ) : (
          <ul className="p30-fixture-list">{list.map(f => <li key={f.id}><Link href={`/pilot30/matches/${f.id}`}>
            <span className="p30-fixture-time p30-num">{timeIL(f.kickoffUtc)}<small>{f.status === 'FT' ? `${f.ftHome}–${f.ftAway}` : FIXTURE_STATUS_HE[f.status] || f.status}</small></span>
            <span className="p30-fixture-teams">{f.homeTeam} – {f.awayTeam}<small>{f.leagueName}{f.dataMode === 'demo' ? ' · הדגמה' : ''}</small></span>
            <span className="p30-fixture-flags">
              {f.quotes ? <Badge tone="green">{f.quotes} יחסים · {timeIL(f.quoteUpdatedAt)}</Badge> : <Badge tone="gray">אין יחסים</Badge>}
              {f.hasProbability ? <Badge tone="">הסתברות ניסיונית</Badge> : f.analysed ? <Badge tone="gray">מדדים תיאוריים</Badge> : null}
              {!f.mappingVerified ? <Badge tone="amber">התאמה לבדיקה</Badge> : null}
              {f.excluded ? <Badge tone="amber">נפסל בסריקה</Badge> : null}
            </span></Link></li>)}</ul>
        )}
      </div>
    </section>
  )
}
