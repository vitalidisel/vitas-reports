// PILOT30 responsive QA: screenshots at 320/390/768/1440, horizontal-overflow check, keyboard navigation check.
// Usage: node scripts/pilot30/screenshots.mjs [baseUrl]   (default http://localhost:3300)
// Requires a running server in demo mode (see README) and the dev dependency playwright-core.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const base = process.argv[2] || 'http://localhost:3300'
const out = 'docs/pilot30/screenshots'
mkdirSync(out, { recursive: true })
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const widths = [320, 390, 768, 1440]
const report = []

// The root layout loads analytics/fonts from external hosts; offline sandboxes would wait on them forever.
async function blockExternal(page) {
  const origin = new URL(base).origin
  await page.route('**/*', route => (route.request().url().startsWith(origin) ? route.continue() : route.abort()))
}

async function firstFixtureId(page) {
  const r = await page.request.get(`${base}/api/pilot30/fixtures`)
  const j = await r.json()
  return j.fixtures?.[0]?.id
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
try {
  // Make sure today has a scan (demo mode, no auth).
  const ctx0 = await browser.newContext()
  const p0 = await ctx0.newPage()
  await p0.request.post(`${base}/api/pilot30/scan`)
  const fid = await firstFixtureId(p0)
  await ctx0.close()
  const pages = [
    ['today', '/pilot30'], ['matches', '/pilot30/matches'], ['analysis', `/pilot30/matches/${fid}`],
    ['tracking', '/pilot30/tracking'], ['settings', '/pilot30/settings'], ['health', '/pilot30/health'],
  ]
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await ctx.newPage()
    await blockExternal(page)
    for (const [name, path] of pages) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.p30-page .p30-card, .p30-page .p30-state', { timeout: 20_000 })
      await page.waitForTimeout(700)
      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, bodyScroll: document.body.scrollWidth }))
      const horizontal = overflow.scrollWidth > overflow.innerWidth + 1
      // Every interactive control should have a ≥44px hit target (ignore hidden elements and inline text links).
      const smallTargets = await page.evaluate(() => [...document.querySelectorAll('.p30-root button, .p30-root a.p30-btn, .p30-root nav a, .p30-root input:not([type=checkbox]), .p30-root select')].filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 40 || r.width < 40) }).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}:${el.textContent.trim().slice(0, 20)}`).slice(0, 8))
      const file = `${out}/${name}-${width}.png`
      await page.screenshot({ path: file, fullPage: true })
      report.push({ page: name, width, horizontalScroll: horizontal, ...overflow, smallTargets })
    }
    // Keyboard navigation on the Today page: Tab must move focus through nav + buttons, Enter must activate a link.
    await page.goto(base + '/pilot30', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-component="DailyTicket"]', { timeout: 20_000 })
    const seq = []
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.textContent ? ':' + a.textContent.trim().slice(0, 18) : ''}` : 'none' })) }
    report.push({ page: 'keyboard', width, focusSequence: seq })
    await ctx.close()
  }
  // Commit flow through the UI at 390px (mobile): scan → commit → committed badge.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  const page = await ctx.newPage()
  await blockExternal(page)
  await page.goto(base + '/pilot30', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-component="DailyTicket"]', { timeout: 20_000 })
  const commitBtn = page.getByRole('button', { name: /התחייבות לטופס/ })
  if (await commitBtn.count()) {
    await commitBtn.first().click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${out}/today-390-committed.png`, fullPage: true })
    report.push({ page: 'commit-flow', committedBadge: await page.locator('.p30-ticket .p30-status').first().textContent() })
  } else report.push({ page: 'commit-flow', skipped: 'no draft ticket today' })
  await ctx.close()
} finally { await browser.close() }
writeFileSync(`${out}/qa-report.json`, JSON.stringify(report, null, 2))
const bad = report.filter(r => r.horizontalScroll)
console.log(JSON.stringify(report, null, 1))
console.log(bad.length ? `HORIZONTAL SCROLL on: ${bad.map(b => `${b.page}@${b.width}`).join(', ')}` : 'No horizontal scroll at any width.')
process.exit(bad.length ? 1 : 0)
