import { NextResponse } from 'next/server'

// POST — קליטת ליד מדף הנחיתה של LAGUNA (/laguna).
// כרגע מאמת ומתעד בלוג בלבד. חיבור ל-CRM/Supabase — ראו ה-TODO למטה.

const PHONE_RE = /^0(?:5\d|7\d|[2-489])\d{7}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const phone = String(body.phone || '').replace(/[\s-]/g, '')
  const email = body.email ? String(body.email).trim() : null

  if (name.length < 2) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!PHONE_RE.test(phone)) return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: 'invalid email' }, { status: 400 })

  const lead = {
    name,
    phone,
    email,
    source: body.source ? String(body.source).slice(0, 300) : null,
    createdAt: new Date().toISOString(),
  }

  // TODO: לחבר ליעד אמיתי — טבלת leads ב-Supabase / bmby / מייל לנציג.
  console.log('[laguna] lead', lead)

  return NextResponse.json({ ok: true })
}
