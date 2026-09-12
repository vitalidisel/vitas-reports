import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireOwner, requireCron, redact, HttpError } from '../../lib/pilot30/auth.js'
import { detectEnvironment } from '../../lib/pilot30/config.js'

const req = (headers = {}) => ({ headers: { get: k => headers[k.toLowerCase()] ?? null } })

test('demo mode (no database) has no private data and needs no login', async () => {
  const env = {}
  assert.equal(detectEnvironment(env).dataMode, 'demo')
  const who = await requireOwner(req(), env)
  assert.equal(who.ownerId, 'demo-owner')
})

test('live mode: missing or invalid token is rejected before any data is read', async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', OWNER_USER_ID: 'owner-1' }
  assert.equal(detectEnvironment(env).dataMode, 'live')
  await assert.rejects(() => requireOwner(req(), env), e => e instanceof HttpError && e.status === 401)
  // A token that Supabase cannot verify (no network here) must also be rejected, never treated as the owner.
  await assert.rejects(() => requireOwner(req({ authorization: 'Bearer not-a-real-jwt' }), env), e => e instanceof HttpError && e.status === 401)
})

test('cron endpoints require the exact CRON_SECRET', () => {
  const env = { CRON_SECRET: 's3cret', OWNER_USER_ID: 'owner-1' }
  assert.throws(() => requireCron(req(), env), e => e.status === 401)
  assert.throws(() => requireCron(req({ authorization: 'Bearer wrong' }), env), e => e.status === 401)
  assert.equal(requireCron(req({ authorization: 'Bearer s3cret' }), env).ownerId, 'owner-1')
  assert.throws(() => requireCron(req({ authorization: 'Bearer anything' }), {}), e => e.status === 401)
})

test('secrets are redacted from messages', () => {
  const env = { API_FOOTBALL_KEY: 'abcdef123456', CRON_SECRET: 'topsecret9' }
  assert.equal(redact('key abcdef123456 leaked and topsecret9 too', env), 'key [API_FOOTBALL_KEY] leaked and [CRON_SECRET] too')
})
