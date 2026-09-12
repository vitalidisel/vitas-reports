// Job runner: lock per job name, sync_runs record, bounded execution, error capture with redaction.
import { redact } from '../auth.js'

export async function runJob(store, { provider, job, lockTtlMs = 10 * 60_000 }, fn) {
  const locked = await store.acquireLock(job, lockTtlMs)
  if (!locked) return { ok: false, skipped: true, reason: 'locked', job }
  const run = await store.startRun({ provider, job })
  try {
    const result = await fn({ run })
    await store.finishRun(run.id, { status: 'ok', counts: result?.counts || {}, credits: result?.credits || null })
    return { ok: true, job, runId: run.id, ...result }
  } catch (e) {
    await store.finishRun(run.id, { status: 'error', error: redact(e?.message || String(e)), counts: e?.counts || {} })
    return { ok: false, job, runId: run.id, error: redact(e?.message || String(e)), code: e?.code || null }
  } finally {
    await store.releaseLock(job)
  }
}
