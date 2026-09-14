// Client half of the access gate. Deliberately NOT routed through the
// mock/degrade path in analyze.js: a failed auth call has exactly two honest
// readings — "not logged in" or "locked out" — and inventing a session would
// be the one fabrication this app can't badge its way out of.

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    // The session cookie is httpOnly; it only round-trips if we ask for it.
    credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  let info = {}
  try { info = await res.json() } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const err = new Error(`${url} failed: ${res.status} ${info.error || ''}`.trim())
    err.status = res.status
    err.code = info.error || null
    err.email = info.email || null
    throw err
  }
  return info
}

export function loginWithGoogle(credential) {
  return call('/api/auth-google', { method: 'POST', body: { credential } })
}

export function fetchSessionStatus() {
  return call('/api/session-status')
}

export function logout() {
  return call('/api/logout', { method: 'POST' })
}
