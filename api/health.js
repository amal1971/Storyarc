// GET /api/health — tells the client which capabilities are live vs mocked.
// Drives the status chip on the start screen. Never exposes key values.
export default function handler(req, res) {
  res.status(200).json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    stt: (process.env.STT_PROVIDER || 'mock').toLowerCase(),
    reachable: true,
  })
}
