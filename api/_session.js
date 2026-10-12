// Shared session helper: the app's access gate lives here, the way every
// Gemini call lives in _gemini.js.
//
// The session clock rides in the cookie, not in Redis. `sessionStart` +
// `usedBefore` are enough to compute remaining time on any request without a
// network round-trip; Redis is only touched at login and at periodic
// checkpoints. Same instinct as the derived signals elsewhere in this app —
// if it can be computed exactly, don't go ask something else for it.
import crypto from 'node:crypto'
import { markExhausted, saveUsage, countPaidCall } from './_usage.js'

const COOKIE_NAME = 'storyarc_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

// Kill-switch: one env var disables the whole gate with no code change and no
// Redis edit, for when the login flow misbehaves in production.
export const authEnabled = () => process.env.AUTH_ENABLED !== 'false'

export const limitSeconds = () => Number(process.env.USAGE_LIMIT_MINUTES || 30) * 60

export const authConfigured = () =>
  Boolean(process.env.SESSION_SECRET && process.env.GOOGLE_CLIENT_ID)

// Operator exemption, not a product feature: a small allowlist of emails that
// skip the usage cap entirely. Comma-separated so it's one env var, not code.
export function isAdminEmail(email) {
  if (!email) return false
  const list = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(String(email).toLowerCase())
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function hmac(body) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url')
}

export function signCookie(payload) {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${hmac(body)}`
}

export function verifyCookie(raw) {
  if (!raw || !process.env.SESSION_SECRET) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expected = hmac(body)
  // Constant-time compare; timingSafeEqual throws on length mismatch.
  if (sig.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function getSession(req) {
  const header = req.headers?.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== COOKIE_NAME) continue
    // A malformed percent-escape (e.g. "%E0%A4%A") makes decodeURIComponent
    // throw, which used to crash every guarded endpoint with a 500. Treat it
    // like any other invalid cookie: no session, clean 401.
    let raw
    try {
      raw = decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
    return verifyCookie(raw)
  }
  return null
}

// `Secure` only in production: Safari refuses to store a Secure cookie over
// plain http, which would silently break the whole gate on localhost.
const isProd = () => Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')

export function setSessionCookie(res, payload) {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${COOKIE_MAX_AGE}`]
  if (isProd()) flags.push('Secure')
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${signCookie(payload)}; ${flags.join('; ')}`)
}

export function clearSessionCookie(res) {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd()) flags.push('Secure')
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${flags.join('; ')}`)
}

export const nowSeconds = () => Math.floor(Date.now() / 1000)

export function totalUsedSeconds(session) {
  return (session.usedBefore || 0) + Math.max(0, nowSeconds() - (session.sessionStart || 0))
}

export function computeRemainingSeconds(session) {
  return Math.max(0, limitSeconds() - totalUsedSeconds(session))
}

// Persist elapsed wall-clock time and hand back a session whose baseline has
// been moved to now. Rebaselining is idempotent against the clock, so several
// tabs checkpointing independently can't double-count.
//
// Deliberately best-effort: the authoritative clock is the signed cookie, and
// a Redis hiccup must not log an active user out mid-story. Login is the call
// that fails loudly when the store is missing (see auth-google.js).
export async function checkpointUsage(session) {
  const usedSeconds = totalUsedSeconds(session)
  // The uncapped operator account has nothing to count; writing it every
  // poll only spends Redis commands.
  if (session.unlimited) return { ...session, sessionStart: nowSeconds(), usedBefore: usedSeconds }
  const exhausted = usedSeconds >= limitSeconds()
  try {
    await saveUsage(session.sub, { email: session.email, usedSeconds, exhausted })
  } catch (err) {
    console.warn('[session] checkpoint skipped:', err.message)
  }
  return { ...session, sessionStart: nowSeconds(), usedBefore: usedSeconds }
}

// The guard every cost-incurring endpoint calls first. Returns the session, or
// null after having already written the response.
export async function requireActiveSession(req, res) {
  if (!authEnabled()) return { sub: null, email: null, unlimited: true }

  if (!process.env.SESSION_SECRET) {
    res.status(500).json({ error: 'auth_not_configured' })
    return null
  }

  const session = getSession(req)
  if (!session?.sub) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }

  // Both must hold: the cookie says this login was granted the exemption (only
  // for a Google-verified admin email, see auth-google.js) AND the email is
  // still on the list — removing it from ADMIN_EMAILS revokes it immediately.
  if (session.unlimited && isAdminEmail(session.email)) return { ...session, unlimited: true }

  if (computeRemainingSeconds(session) <= 0) {
    // Best-effort: the lockout is already decided by the cookie's own math, so
    // a Redis blip must not hand the user free time back.
    try {
      await markExhausted(session.sub, session.email)
    } catch (err) {
      console.warn('[session] could not persist exhaustion:', err.message)
    }
    clearSessionCookie(res)
    res.status(403).json({ error: 'limit_reached' })
    return null
  }

  return { ...session, unlimited: false }
}

export const callsPerAccount = () => Number(process.env.CALLS_PER_ACCOUNT || 60)
export const dailyCallCap = () => Number(process.env.DAILY_CALL_CAP || 500)

// Second guard for the five paid endpoints, called right before the paid work:
// a lifetime ceiling on calls per account and a daily ceiling for the whole
// app, so neither a script inside one allowance nor a flood of fresh accounts
// can drain the prepaid model credit. The operator account and AUTH_ENABLED=false
// are exempt. A Redis failure lets the call through (logged) — the same
// "don't punish users for our storage blip" rule as the checkpoints.
// Returns true when the call may proceed; otherwise writes a 429 and returns false.
export async function chargePaidCall(session, res) {
  if (!authEnabled() || session?.unlimited || !session?.sub) return true
  let counts
  try {
    counts = await countPaidCall(session.sub)
  } catch (err) {
    console.warn('[session] call counter unavailable, allowing call:', err.message)
    return true
  }
  const reason = counts.today > dailyCallCap() ? 'daily' : counts.account > callsPerAccount() ? 'account' : null
  if (!reason) return true
  res.status(429).json({ error: 'call_limit', reason, retryable: false, configured: true })
  return false
}
