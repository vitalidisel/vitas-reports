/**
 * scripts/site-scan/scan.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * סריקת QA לדף נחיתה / מיניסייט — מובייל + דסקטופ.
 *
 * מה נבדק בכל viewport:
 *   • שגיאות קונסולה ובקשות שנכשלו (JS/CSS/תמונות/פונטים)
 *   • גלילה אופקית (overflow) + האלמנטים שחורגים מרוחב המסך
 *   • טקסט קטן מדי (< 12px) ואזורי לחיצה קטנים מדי (< 40px) במובייל
 *   • תמונות ללא alt, תמונות שנשלחו גדולות בהרבה מגודל התצוגה, תמונות שבורות
 *   • טפסים: שדות בלי label, סוג input לא מותאם למובייל (tel/email), כפתור שליחה
 *   • קישורים שבורים (#, javascript:, ריקים) וקישורי טלפון/וואטסאפ
 *   • meta viewport, lang/dir, title, description, favicon, canonical
 *   • ביצועים בסיסיים: זמן טעינה, משקל כולל, מספר בקשות, LCP/CLS מדפדפן
 *   • צילום מסך מלא לכל viewport (screenshots/*.png)
 *
 * דרישות: playwright (גלובלי או מקומי) + Chromium.
 * הרצה:    node scripts/site-scan/scan.mjs <url> [--out dir] [--via-node]
 * פלט:     <out>/report.md + <out>/report.json + <out>/screenshots/
 *
 * --via-node: כל בקשות הדפדפן עוברות דרך fetch של Node (מכבד HTTPS_PROXY עם
 *   NODE_USE_ENV_PROXY=1). נחוץ בסביבות שבהן ה-TLS של Chromium נחסם ע"י פרוקסי
 *   אך Node עובר. במצב זה מדדי הרשת של הדפדפן (TTFB/transferSize) אינם אמינים,
 *   ולכן משקל/מספר בקשות נמדדים בצד Node.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, devices } from 'playwright'

const args = process.argv.slice(2)
const URL_ARG = args.find(a => !a.startsWith('--'))
if (!URL_ARG) {
  console.error('שימוש: node scripts/site-scan/scan.mjs <url> [--out dir]')
  process.exit(1)
}
const outIdx = args.indexOf('--out')
const OUT = resolve(outIdx >= 0 ? args[outIdx + 1] : 'site-scan-output')
const VIA_NODE = args.includes('--via-node')
mkdirSync(join(OUT, 'screenshots'), { recursive: true })

const VIEWPORTS = [
  { name: 'mobile-iphone', device: devices['iPhone 13'], mobile: true },
  { name: 'mobile-android', device: devices['Pixel 5'], mobile: true },
  { name: 'tablet', device: devices['iPad (gen 7)'], mobile: true },
  { name: 'desktop', device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, mobile: false },
]

const summary = []

// ── בדיקות DOM שרצות בתוך הדף ────────────────────────────────────────────────
const domAudit = (isMobile) => {
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
  }
  const desc = (el) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
    const txt = (el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return `<${el.tagName.toLowerCase()}${id}${cls}>${txt ? ' "' + txt + '"' : ''}`
  }

  // overflow אופקי
  // הערה: במובייל, אלמנט רחב מהמסך גורם ל-Chrome "לזום החוצה" (visualViewport.scale < 1) —
  // המשתמש רואה את כל הדף קטן. ב-RTL הגלילה מתחילה מימין ו-scrollX שלילי, לכן מנרמלים
  // לקואורדינטות מסמך (client + scrollX) ובודקים מול [0, vw].
  const scrollW = document.documentElement.scrollWidth
  // כשהתוכן רחב מהמסך, Chrome מובייל מקטין את הדף: innerWidth גדל מעבר ל-clientWidth
  const scale = +Math.min(1, vw / window.innerWidth).toFixed(3)
  const sx = window.scrollX
  const overflowing = []
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const isFixed = cs.position === 'fixed'
    const docLeft = isFixed ? r.left : r.left + sx
    const docRight = isFixed ? r.right : r.right + sx
    if (r.width > vw + 1 || docLeft < -1 || docRight > vw + 1) {
      // דלג על אבות שרק "מכילים" ילד חורג (רוחבם עצמם תקין) — נרצה את האשם עצמו
      const selfWide = r.width > vw + 1 || cs.overflowX === 'visible' && !el.children.length
      overflowing.push({ el: desc(el), docLeft: Math.round(docLeft), docRight: Math.round(docRight), width: Math.round(r.width), selfWide })
    }
    if (overflowing.length >= 40) break
  }

  // טקסט קטן + אזורי לחיצה
  const smallText = []
  const smallTargets = []
  const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]')
  for (const el of interactive) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (isMobile && (r.width < 40 || r.height < 40) && !(el.tagName === 'A' && r.width > 100 && r.height >= 24)) {
      smallTargets.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height) })
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  let n
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim() || !n.parentElement) continue
    const p = n.parentElement
    if (seen.has(p) || !visible(p)) continue
    seen.add(p)
    const fs = parseFloat(getComputedStyle(p).fontSize)
    if (fs < 12) smallText.push({ el: desc(p), fontSize: fs })
    if (smallText.length >= 20) break
  }

  // תמונות
  const images = []
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect()
    const item = {
      src: (img.currentSrc || img.src || '').slice(0, 160),
      alt: img.getAttribute('alt'),
      displayed: `${Math.round(r.width)}x${Math.round(r.height)}`,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      loading: img.getAttribute('loading'),
      broken: img.complete && img.naturalWidth === 0 && !!img.src,
      oversized: r.width > 0 && img.naturalWidth > r.width * devicePixelRatio * 2,
      visible: visible(img),
    }
    images.push(item)
  }

  // טפסים
  const forms = [...document.querySelectorAll('form')].map(f => {
    const fields = [...f.querySelectorAll('input:not([type=hidden]), select, textarea')].map(i => {
      const id = i.id
      const hasLabel = !!(id && document.querySelector(`label[for="${id}"]`)) || !!i.closest('label') || !!i.getAttribute('aria-label') || !!i.getAttribute('placeholder')
      return { name: i.name || i.id || '', type: i.type || i.tagName.toLowerCase(), hasLabel, required: i.required, autocomplete: i.getAttribute('autocomplete'), inputmode: i.getAttribute('inputmode') }
    })
    return {
      action: f.getAttribute('action'), method: f.getAttribute('method'),
      submit: !!f.querySelector('button[type=submit], input[type=submit], button:not([type])'),
      fields,
    }
  })
  // שדות מחוץ ל-form (טפסי JS)
  const looseFields = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(i => !i.closest('form')).map(i => ({ name: i.name || i.id || i.placeholder || '', type: i.type }))

  // קישורים
  const links = [...document.querySelectorAll('a')].map(a => ({ href: a.getAttribute('href') || '', text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 60), target: a.target, visible: visible(a) }))
  const deadLinks = links.filter(l => l.visible && (l.href === '' || l.href === '#' || l.href.startsWith('javascript:')))
  const telLinks = links.filter(l => /^tel:/i.test(l.href))
  const waLinks = links.filter(l => /wa\.me|whatsapp/i.test(l.href))

  // fixed/sticky elements (חשוב במובייל — כפתור צף שמסתיר תוכן)
  const fixed = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if ((cs.position === 'fixed' || cs.position === 'sticky') && visible(el)) {
      const r = el.getBoundingClientRect()
      fixed.push({ el: desc(el), pos: cs.position, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), coverage: Math.round((r.width * r.height) / (vw * vh) * 100) })
    }
  }

  // headings
  const headings = [...document.querySelectorAll('h1,h2,h3')].map(h => ({ tag: h.tagName, text: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 80), visible: visible(h) }))

  // מטא
  const q = (s) => document.querySelector(s)
  const meta = {
    title: document.title,
    description: q('meta[name="description"]')?.content || null,
    viewport: q('meta[name="viewport"]')?.content || null,
    lang: document.documentElement.lang || null,
    dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
    canonical: q('link[rel="canonical"]')?.href || null,
    favicon: !!q('link[rel~="icon"]'),
    ogImage: q('meta[property="og:image"]')?.content || null,
    h1Count: document.querySelectorAll('h1').length,
    iframes: [...document.querySelectorAll('iframe')].map(f => (f.src || '').slice(0, 120)),
    videos: document.querySelectorAll('video').length,
    autoplayVideos: document.querySelectorAll('video[autoplay]').length,
  }

  // גובה הדף ומספר "מסכים" במובייל
  const pageHeight = document.documentElement.scrollHeight

  return { vw, vh: Math.round(vh * scale), scale, zoomedOut: scale < 0.98, scrollW, horizontalOverflow: scrollW > vw + 1 || scale < 0.98, overflowing, smallText, smallTargets, images, forms, looseFields, links: links.length, deadLinks, telLinks, waLinks, fixed, headings, meta, pageHeight, screens: +(pageHeight / (vh * scale)).toFixed(1) }
}

// ── מדדי ביצועים מהדפדפן ────────────────────────────────────────────────────
const perfAudit = () => new Promise(res => {
  const nav = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  const byType = {}
  let total = 0
  for (const r of resources) {
    const t = r.initiatorType || 'other'
    byType[t] = byType[t] || { count: 0, bytes: 0 }
    byType[t].count++
    byType[t].bytes += r.transferSize || 0
    total += r.transferSize || 0
  }
  let lcp = null, cls = 0
  try {
    new PerformanceObserver(l => { const e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  setTimeout(() => res({
    domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0),
    load: Math.round(nav?.loadEventEnd || 0),
    ttfb: Math.round(nav?.responseStart || 0),
    requests: resources.length,
    transferKB: Math.round(total / 1024),
    byType,
    lcp: lcp ? Math.round(lcp) : null,
    cls: +cls.toFixed(3),
    thirdParty: [...new Set(resources.map(r => { try { return new URL(r.name).host } catch { return '' } }).filter(h => h && h !== location.host))],
  }), 500)
})

// ── ניתוב בקשות דרך Node (--via-node) ────────────────────────────────────────
const HOP_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'alt-svc'])
const routeViaNode = async (ctx, stats) => {
  await ctx.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if (!/^https?:/i.test(url)) return route.continue()
    const headers = { ...req.headers() }
    for (const h of ['host', 'content-length', 'connection', 'accept-encoding']) delete headers[h]
    const t0 = Date.now()
    try {
      const body = req.postDataBuffer()
      const resp = await fetch(url, { method: req.method(), headers, body: body ?? undefined, redirect: 'manual', signal: AbortSignal.timeout(45000) })
      const buf = Buffer.from(await resp.arrayBuffer())
      const out = {}
      resp.headers.forEach((v, k) => { if (!HOP_HEADERS.has(k)) out[k] = v })
      const sc = typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : []
      if (sc.length) out['set-cookie'] = sc.join('\n')
      stats.requests++
      stats.bytes += buf.length
      stats.byType[req.resourceType()] = stats.byType[req.resourceType()] || { count: 0, bytes: 0 }
      stats.byType[req.resourceType()].count++
      stats.byType[req.resourceType()].bytes += buf.length
      if (url === URL_ARG || (req.isNavigationRequest() && req.frame() === ctx.pages()[0]?.mainFrame())) stats.ttfb = stats.ttfb ?? Date.now() - t0
      await route.fulfill({ status: resp.status, headers: out, body: buf })
    } catch (e) {
      stats.failed.push({ url: url.slice(0, 200), reason: String(e?.cause?.message || e?.message || e).slice(0, 120), type: req.resourceType() })
      await route.abort('connectionfailed').catch(() => {})
    }
  })
}

// ── הרצה ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch()
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ ...vp.device, locale: 'he-IL', ignoreHTTPSErrors: true })
  const nodeStats = { requests: 0, bytes: 0, byType: {}, failed: [], ttfb: null }
  if (VIA_NODE) await routeViaNode(ctx, nodeStats)
  const page = await ctx.newPage()
  const consoleErrors = []
  const failedRequests = []
  const responses4xx5xx = []
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleErrors.push({ type: m.type(), text: m.text().slice(0, 300) }) })
  page.on('pageerror', e => consoleErrors.push({ type: 'pageerror', text: String(e).slice(0, 300) }))
  page.on('requestfailed', r => failedRequests.push({ url: r.url().slice(0, 200), reason: r.failure()?.errorText, type: r.resourceType() }))
  page.on('response', r => { if (r.status() >= 400) responses4xx5xx.push({ url: r.url().slice(0, 200), status: r.status(), type: r.request().resourceType() }) })

  const t0 = Date.now()
  let status = null
  try {
    const resp = await page.goto(URL_ARG, { waitUntil: 'load', timeout: 60000 })
    status = resp?.status()
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  } catch (e) {
    summary.push({ viewport: vp.name, error: String(e) })
    await ctx.close()
    continue
  }
  const loadMs = Date.now() - t0

  // גלילה עד הסוף כדי להפעיל lazy-load ואנימציות scroll
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight
    for (let y = 0; y < h; y += Math.round(window.innerHeight * 0.8)) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 400))
  })

  const dom = await page.evaluate(domAudit, vp.mobile)
  const perf = await page.evaluate(perfAudit)
  if (VIA_NODE) {
    // הדפדפן לא רואה את הרשת האמיתית — מחליפים במדידות מצד Node
    Object.assign(perf, { viaNode: true, requests: nodeStats.requests, transferKB: Math.round(nodeStats.bytes / 1024), byType: nodeStats.byType, ttfb: nodeStats.ttfb ?? perf.ttfb })
    for (const f of nodeStats.failed) if (!failedRequests.some(x => x.url === f.url)) failedRequests.push(f)
  }

  // צילום above-the-fold + מלא
  const shotAtf = join(OUT, 'screenshots', `${vp.name}-fold.png`)
  const shotFull = join(OUT, 'screenshots', `${vp.name}-full.png`)
  await page.screenshot({ path: shotAtf })
  await page.screenshot({ path: shotFull, fullPage: true })

  summary.push({ viewport: vp.name, mobile: vp.mobile, status, loadMs, consoleErrors, failedRequests, responses4xx5xx, dom, perf, screenshots: [shotAtf, shotFull] })
  console.log(`✓ ${vp.name}: status ${status}, ${loadMs}ms, overflow=${dom.horizontalOverflow}, errors=${consoleErrors.length}, failed=${failedRequests.length}`)
  await ctx.close()
}
await browser.close()

writeFileSync(join(OUT, 'report.json'), JSON.stringify(summary, null, 2))

// ── דוח Markdown ─────────────────────────────────────────────────────────────
const md = []
md.push(`# סריקת QA — ${URL_ARG}`, '', `תאריך: ${new Date().toISOString().slice(0, 10)}`, '')
for (const s of summary) {
  md.push(`## ${s.viewport}${s.mobile ? ' (מובייל)' : ' (דסקטופ)'}`)
  if (s.error) { md.push(`❌ טעינה נכשלה: ${s.error}`, ''); continue }
  const d = s.dom, p = s.perf
  md.push(`- סטטוס: ${s.status} · טעינה: ${s.loadMs}ms · TTFB ${p.ttfb}ms · LCP ${p.lcp ?? '—'}ms · CLS ${p.cls}`)
  md.push(`- משקל: ${p.transferKB}KB ב-${p.requests} בקשות${p.viaNode ? ' (נמדד בצד Node, לא דחוס)' : ''} · צד-שלישי: ${p.thirdParty.join(', ') || '—'}`)
  md.push(`- viewport: ${d.vw}px · רוחב תוכן: ${d.scrollW}px · **חריגה אופקית: ${d.horizontalOverflow ? '⚠️ כן' : 'לא'}**${d.zoomedOut ? ` · **⚠️ הדף נטען מוקטן (zoom ${Math.round(d.scale * 100)}%) — הטקסט נראה זעיר במובייל**` : ''} · גובה דף: ${d.pageHeight}px (${d.screens} מסכים)`)
  md.push(`- meta viewport: \`${d.meta.viewport}\` · lang=${d.meta.lang} dir=${d.meta.dir} · H1: ${d.meta.h1Count}`)
  if (d.overflowing.length) {
    const culprits = d.overflowing.filter(o => o.selfWide), rest = d.overflowing.filter(o => !o.selfWide)
    md.push('', `**אלמנטים שחורגים מרוחב המסך (${d.overflowing.length}):**`)
    culprits.slice(0, 15).forEach(o => md.push(`- 🎯 ${o.el} — רוחב ${o.width}px (x: ${o.docLeft}…${o.docRight})`))
    rest.slice(0, 10).forEach(o => md.push(`- ${o.el} — x: ${o.docLeft}…${o.docRight} (רוחב ${o.width})`))
  }
  if (s.consoleErrors.length) { md.push('', '**שגיאות קונסולה:**'); s.consoleErrors.slice(0, 15).forEach(e => md.push(`- [${e.type}] ${e.text}`)) }
  if (s.failedRequests.length) { md.push('', '**בקשות שנכשלו:**'); s.failedRequests.slice(0, 15).forEach(f => md.push(`- ${f.type}: ${f.url} (${f.reason})`)) }
  if (s.responses4xx5xx.length) { md.push('', '**תגובות 4xx/5xx:**'); s.responses4xx5xx.slice(0, 15).forEach(f => md.push(`- ${f.status} ${f.type}: ${f.url}`)) }
  if (d.smallTargets.length) { md.push('', `**אזורי לחיצה קטנים (${d.smallTargets.length}):**`); d.smallTargets.slice(0, 12).forEach(t => md.push(`- ${t.el} — ${t.w}x${t.h}px`)) }
  if (d.smallText.length) { md.push('', `**טקסט קטן מ-12px (${d.smallText.length}):**`); d.smallText.slice(0, 10).forEach(t => md.push(`- ${t.el} — ${t.fontSize}px`)) }
  const broken = d.images.filter(i => i.broken), noAlt = d.images.filter(i => i.visible && (i.alt === null || i.alt === '')), oversized = d.images.filter(i => i.visible && i.oversized)
  md.push('', `**תמונות:** ${d.images.length} סה"כ · שבורות ${broken.length} · בלי alt ${noAlt.length} · גדולות מדי ${oversized.length}`)
  broken.forEach(i => md.push(`- ❌ שבורה: ${i.src}`))
  oversized.slice(0, 8).forEach(i => md.push(`- 📦 ${i.src} — נשלחה ${i.natural}, מוצגת ${i.displayed}`))
  md.push('', `**טפסים:** ${d.forms.length}${d.looseFields.length ? ` (+${d.looseFields.length} שדות מחוץ ל-form)` : ''}`)
  d.forms.forEach((f, i) => {
    md.push(`- טופס ${i + 1}: action=${f.action || '—'} · כפתור שליחה: ${f.submit ? 'כן' : '❌ לא'}`)
    f.fields.forEach(fl => md.push(`  - ${fl.name || '(ללא שם)'} type=${fl.type}${fl.required ? ' *' : ''}${!fl.hasLabel ? ' ⚠️ בלי label/placeholder' : ''}${/phone|tel|טלפון/i.test(fl.name) && fl.type !== 'tel' ? ' ⚠️ טלפון לא type=tel' : ''}`))
  })
  md.push('', `**קישורים:** ${d.links} · מתים ${d.deadLinks.length} · טלפון ${d.telLinks.length} · וואטסאפ ${d.waLinks.length}`)
  d.deadLinks.slice(0, 8).forEach(l => md.push(`- 🔗 מת: "${l.text}" href="${l.href}"`))
  if (d.fixed.length) { md.push('', '**אלמנטים צפים (fixed/sticky):**'); d.fixed.forEach(f => md.push(`- ${f.el} — ${f.pos} ${f.w}x${f.h} (${f.coverage}% מהמסך)`)) }
  md.push('', `צילומים: ${s.screenshots.map(x => x.replace(OUT + '/', '')).join(', ')}`, '')
}
writeFileSync(join(OUT, 'report.md'), md.join('\n'))
console.log(`\nדוח נכתב ל: ${join(OUT, 'report.md')}`)
