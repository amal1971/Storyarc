// GET /api/health — tells the client which capabilities are live vs mocked.
// Drives the status chip on the start screen. Never exposes key values.
export default function handler(req, res) {
  res.status(200).json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    stt: (process.env.STT_PROVIDER || 'mock').toLowerCase(),
    reachable: true,
    // The sign-in page states the allowance before anyone signs in, so it has
    // to come from the same env var the server enforces (USAGE_LIMIT_MINUTES).
    usageLimitMinutes: Number(process.env.USAGE_LIMIT_MINUTES || 30),
  })
}
