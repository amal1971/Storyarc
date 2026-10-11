// Input size limits for the cost-incurring endpoints. Every analyze/compare
// call sends the whole transcript to a paid model, so an unbounded paste is a
// cost (and latency) risk. The client caps typed stories at 600 words, about a
// three-minute telling, which is also the recording hard stop; the server
// allows headroom above that for fast speakers and rejects anything larger.
export const MAX_TRANSCRIPT_CHARS = 6000

// Returns true (and writes a 413) when a transcript is missing-shaped or too long.
export function rejectOversize(res, ...transcripts) {
  for (const t of transcripts) {
    if (typeof t === 'string' && t.length > MAX_TRANSCRIPT_CHARS) {
      res.status(413).json({ error: 'transcript_too_long', maxChars: MAX_TRANSCRIPT_CHARS, retryable: false, configured: true })
      return true
    }
  }
  return false
}
