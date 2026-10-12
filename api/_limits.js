// Input limits for the cost-incurring endpoints. Every analyze/compare call
// sends user-supplied text to a paid model, so anything unbounded is a cost
// risk. The client caps typed stories at 600 words (about a three-minute
// telling, matching the recording hard stop); the server allows headroom for
// fast speakers and rejects anything larger — or anything that isn't text at
// all (an array or object would otherwise slip past a length check and be
// stringified straight into the prompt).
export const MAX_TRANSCRIPT_CHARS = 6000
export const MAX_FIX_CHARS = 300
export const MAX_STEPS = 8
export const MAX_NOTE_CHARS = 400

// Returns true (after writing a 400/413) when any transcript is not a string
// or is too long. Callers check for missing transcripts first.
export function rejectOversize(res, ...transcripts) {
  for (const t of transcripts) {
    if (typeof t !== 'string') {
      res.status(400).json({ error: 'transcript_must_be_text', retryable: false, configured: true })
      return true
    }
    if (t.length > MAX_TRANSCRIPT_CHARS) {
      res.status(413).json({ error: 'transcript_too_long', maxChars: MAX_TRANSCRIPT_CHARS, retryable: false, configured: true })
      return true
    }
  }
  return false
}

// compare-attempts extras. The app only ever sends its own short fix line and
// beat verdicts here; anything else is clipped or rejected.
export function cleanSuggestedFix(fix) {
  if (fix == null || fix === '') return { ok: true, value: undefined }
  if (typeof fix !== 'string') return { ok: false }
  return { ok: true, value: fix.slice(0, MAX_FIX_CHARS) }
}

export function cleanSteps(steps) {
  if (steps == null) return { ok: true, value: [] }
  if (!Array.isArray(steps) || steps.length > MAX_STEPS) return { ok: false }
  const value = []
  for (const s of steps) {
    if (!s || typeof s !== 'object' || typeof s.key !== 'string' || typeof s.verdict !== 'string') return { ok: false }
    value.push({
      key: s.key.slice(0, 40),
      verdict: s.verdict.slice(0, 12),
      note: typeof s.note === 'string' ? s.note.slice(0, MAX_NOTE_CHARS) : '',
    })
  }
  return { ok: true, value }
}
