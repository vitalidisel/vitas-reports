// Minimal HTTP client for providers: timeout, bounded retry with backoff, secret redaction in errors.
import { redact } from '../auth.js'

export class ProviderError extends Error {
  constructor(message, { status = null, retryable = false, provider = null, body = null } = {}) { super(redact(message)); this.status = status; this.retryable = retryable; this.provider = provider; this.body = body }
}

export async function fetchJson(url, { headers = {}, timeoutMs = 15_000, retries = 2, backoffMs = 800, provider = 'http', fetchImpl = globalThis.fetch } = {}) {
  let attempt = 0, lastErr
  while (attempt <= retries) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { headers, signal: ctrl.signal })
      const text = await res.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
      if (res.status === 429 || res.status >= 500) throw new ProviderError(`${provider}: HTTP ${res.status}`, { status: res.status, retryable: true, provider, body: json })
      if (!res.ok) throw new ProviderError(`${provider}: HTTP ${res.status} ${text.slice(0, 200)}`, { status: res.status, retryable: false, provider, body: json })
      return { json, headers: res.headers, status: res.status }
    } catch (e) {
      lastErr = e instanceof ProviderError ? e : new ProviderError(`${provider}: ${e.name === 'AbortError' ? 'timeout' : e.message}`, { retryable: true, provider })
      if (!lastErr.retryable || attempt === retries) throw lastErr
      await new Promise(r => setTimeout(r, backoffMs * 2 ** attempt))
      attempt++
    } finally { clearTimeout(timer) }
  }
  throw lastErr
}
