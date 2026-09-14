// POST /api/logout — checkpoint the time used, then drop the cookie.
// Logging out does not refund time; the cap is lifetime wall-clock.
import { authEnabled, checkpointUsage, clearSessionCookie, getSession } from './_session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!authEnabled()) return res.status(200).json({ ok: true, authDisabled: true })

  const session = getSession(req)
  if (session?.sub) await checkpointUsage(session)
  clearSessionCookie(res)
  return res.status(200).json({ ok: true })
}
