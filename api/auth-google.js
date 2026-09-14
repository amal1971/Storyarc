// POST /api/auth-google — exchange a Google ID token for a session cookie.
// Body: { credential } (the JWT from Google Identity Services)
// Returns: { email, remainingSeconds } | 403 { error: 'limit_reached' }
import { OAuth2Client } from 'google-auth-library'
import { authEnabled, isAdminEmail, limitSeconds, nowSeconds, setSessionCookie } from './_session.js'
import { getUsage, saveUsage, usageConfigured, UsageStoreUnavailableError } from './_usage.js'

let verifier = null

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!authEnabled()) return res.status(200).json({ authDisabled: true })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId || !process.env.SESSION_SECRET) {
    return res.status(500).json({ error: 'auth_not_configured' })
  }
  // A cap that can't be recorded isn't a cap. Fail the login rather than let
  // someone in on an allowance nothing is counting.
  if (!usageConfigured()) return res.status(503).json({ error: 'storage_not_configured' })

  const { credential } = req.body || {}
  if (!credential) return res.status(400).json({ error: 'credential required' })

  let payload
  try {
    if (!verifier) verifier = new OAuth2Client(clientId)
    const ticket = await verifier.verifyIdToken({ idToken: credential, audience: clientId })
    payload = ticket.getPayload()
  } catch (err) {
    console.warn('[auth-google] rejected credential:', err.message)
    return res.status(401).json({ error: 'invalid_credential' })
  }

  const sub = payload?.sub
  const email = payload?.email || null
  if (!sub) return res.status(401).json({ error: 'invalid_credential' })

  try {
    const admin = isAdminEmail(email)
    const prior = await getUsage(sub)
    const usedBefore = prior?.usedSeconds || 0
    if (!admin && (prior?.exhausted || usedBefore >= limitSeconds())) {
      return res.status(403).json({ error: 'limit_reached', email })
    }

    // Write the email index up front so a reset is possible even for an
    // account that never reaches a checkpoint.
    await saveUsage(sub, { email, usedSeconds: usedBefore, exhausted: false })
    setSessionCookie(res, { sub, email, sessionStart: nowSeconds(), usedBefore, unlimited: admin })
    return res.status(200).json({
      email,
      unlimited: admin,
      remainingSeconds: admin ? null : limitSeconds() - usedBefore,
    })
  } catch (err) {
    console.error('[auth-google]', err)
    if (err instanceof UsageStoreUnavailableError) {
      return res.status(503).json({ error: 'storage_not_configured' })
    }
    return res.status(502).json({ error: 'login_failed' })
  }
}
