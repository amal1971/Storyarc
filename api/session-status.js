// GET /api/session-status — drives the countdown chip AND persists elapsed
// usage. Polled every ~15s, so a tab that is simply closed still has its time
// counted: the next poll from anywhere computes it from wall-clock, not from
// an increment the closed tab owed us.
import {
  authEnabled, checkpointUsage, computeRemainingSeconds, requireActiveSession, setSessionCookie,
} from './_session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!authEnabled()) return res.status(200).json({ authDisabled: true, remainingSeconds: null })

  const session = await requireActiveSession(req, res)
  if (!session) return

  const rebased = await checkpointUsage(session)
  setSessionCookie(res, rebased)
  return res.status(200).json({
    email: rebased.email,
    unlimited: !!rebased.unlimited,
    remainingSeconds: rebased.unlimited ? null : computeRemainingSeconds(rebased),
  })
}
