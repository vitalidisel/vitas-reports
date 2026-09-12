'use client'
// App shell (data-component: Sidebar, AppHeader, MobileNav). Desktop: sidebar on the right (RTL start);
// below 960px: bottom navigation. Real RTL through the root <html dir="rtl"> and CSS logical properties.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Pilot30Provider, usePilot30 } from '../lib/client'

const NAV = [
  { href: '/pilot30', label: 'היום שלי', short: 'היום', icon: '◫' },
  { href: '/pilot30/matches', label: 'משחקים וניתוח', short: 'משחקים', icon: '◎' },
  { href: '/pilot30/tracking', label: 'מעקב הפיילוט', short: 'מעקב', icon: '▥' },
  { href: '/pilot30/settings', label: 'הגדרות', short: 'הגדרות', icon: '⚙' },
  { href: '/pilot30/health', label: 'בריאות המערכת', short: 'מערכת', icon: '♥' },
]
const isActive = (pathname, href) => (href === '/pilot30' ? pathname === '/pilot30' : pathname.startsWith(href))

function Brand({ className = '' }) { return <Link className={`p30-brand ${className}`} href="/pilot30" dir="ltr" aria-label="PILOT 30 — היום שלי">PILOT <em>30</em><span className="p30-brand-mark" aria-hidden="true">↗</span></Link> }

export function ModeBadge() {
  const { dataMode, status } = usePilot30()
  if (!status) return <span className="p30-status gray">בודק חיבורים…</span>
  if (dataMode === 'demo') return <span className="p30-status amber" title="אין בסיס נתונים מוגדר — כל הנתונים פיקטיביים">נתוני הדגמה</span>
  return <span className="p30-status green">חיבור חי</span>
}

function Sidebar() {
  const pathname = usePathname()
  const { dataMode } = usePilot30()
  return (
    <aside className="p30-sidebar" data-component="Sidebar">
      <Brand />
      <p className="p30-caption">המרחב האישי של ויטלי</p>
      <nav aria-label="ניווט ראשי">
        {NAV.map(n => <Link key={n.href} href={n.href} className={isActive(pathname, n.href) ? 'active' : ''} aria-current={isActive(pathname, n.href) ? 'page' : undefined}><span className="p30-ico" aria-hidden="true">{n.icon}</span>{n.label}</Link>)}
      </nav>
      <div className="p30-side-bottom">
        <ModeBadge />
        <p>30 ימים. תקציב קבוע.<br />כל החלטה מתועדת.</p>
        <small>{dataMode === 'demo' ? 'נתוני הדגמה בלבד — לא מחובר לספק' : 'ללא שליחת הימורים. ללא חיבור לחשבון ווינר.'}</small>
      </div>
    </aside>
  )
}

function AppHeader() {
  const pathname = usePathname()
  const { session, signOut, dataMode } = usePilot30()
  const current = NAV.find(n => isActive(pathname, n.href))
  return (
    <header className="p30-header" data-component="AppHeader">
      <div className="p30-mobile-brand"><Brand /></div>
      <span className="p30-eyebrow p30-desktop-only" style={{ margin: 0 }}>הפיילוט האישי / <span>{current?.label || 'PILOT 30'}</span></span>
      <div className="p30-header-actions">
        <ModeBadge />
        {dataMode === 'live' && session ? <button type="button" className="p30-text-button" style={{ width: 'auto', padding: 0 }} onClick={signOut}>יציאה</button> : null}
        <span className="p30-avatar" aria-label="ויטלי">V</span>
      </div>
    </header>
  )
}

function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="p30-mobile-nav" aria-label="ניווט מובייל">
      {NAV.map(n => <Link key={n.href} href={n.href} className={isActive(pathname, n.href) ? 'active' : ''} aria-current={isActive(pathname, n.href) ? 'page' : undefined}><span aria-hidden="true" style={{ fontSize: 20 }}>{n.icon}</span><span>{n.short}</span></Link>)}
    </nav>
  )
}

function LoginGate({ children }) {
  const { status, statusError, authReady, needsLogin, signIn, refreshStatus } = usePilot30()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  if (statusError) return <div className="p30-state error"><h3>לא ניתן לבדוק את מצב המערכת</h3>{statusError}<div style={{ marginTop: 12 }}><button type="button" className="p30-btn compact" onClick={refreshStatus}>נסה שוב</button></div></div>
  if (!status || !authReady) return <div className="p30-card"><div className="p30-skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} /><div className="p30-skeleton" style={{ height: 120 }} /></div>
  if (!needsLogin) return children
  const authConfigured = status.connections?.auth?.configured
  return (
    <section className="p30-page" aria-labelledby="login-title">
      <div className="p30-page-heading"><div><p className="p30-eyebrow">PILOT / ACCESS</p><h1 id="login-title">כניסת בעלים<span className="p30-dot">.</span></h1><p className="p30-sub">משתמש יחיד. ללא הרשמה פתוחה.</p></div></div>
      <div className="p30-card" style={{ maxWidth: 480 }}>
        {!authConfigured ? <p className="p30-notice amber">OWNER_USER_ID או NEXT_PUBLIC_SUPABASE_ANON_KEY לא מוגדרים בשרת. עד אז השרת ידחה כל בקשה (401/503).</p> : null}
        {sent ? <p className="p30-notice green">נשלח קישור כניסה ל-{email}. פתח אותו במכשיר הזה.</p> : (
          <form onSubmit={async e => { e.preventDefault(); setErr(null); try { await signIn(email.trim()); setSent(true) } catch (x) { setErr(x.message) } }}>
            <div className="p30-field"><label htmlFor="login-email">אימייל הבעלים</label><input id="login-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /><small>קישור קסם דרך Supabase Auth. רק המשתמש שמזוהה כ-OWNER_USER_ID יורשה לקרוא נתונים.</small></div>
            {err ? <p className="p30-notice red">{err}</p> : null}
            <button type="submit" className="p30-btn primary" style={{ marginTop: 14 }}>שליחת קישור כניסה <span aria-hidden="true">←</span></button>
          </form>
        )}
      </div>
    </section>
  )
}

export default function Shell({ children }) {
  return (
    <Pilot30Provider>
      <div className="p30-root">
        <Sidebar />
        <div className="p30-workspace">
          <AppHeader />
          <main id="p30-main" className="p30-main"><LoginGate>{children}</LoginGate></main>
          <footer className="p30-footer">PILOT 30 · סימולציה ומחקר · ללא חיבור לווינר וללא שליחת הימורים · הזמנים בשעון ישראל</footer>
        </div>
        <MobileNav />
      </div>
    </Pilot30Provider>
  )
}
