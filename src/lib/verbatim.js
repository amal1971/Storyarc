// Locating model-quoted text inside the transcript.
//
// The model is told to copy quotes exactly, but it routinely normalises
// typography: curly ↔ straight apostrophes, smart quotes, dashes, case, runs of
// whitespace. A plain `transcript.includes(quote)` then fails on a quote that
// IS genuinely in the transcript, which used to cost a whole second model
// call. Here both sides are normalised the same way, the match is found in
// normalised space, and the result is mapped back to the ORIGINAL characters —
// so anything shown to the user is still exactly what they said.
//
// Shared by the server (api/analyze-*.js) and the client (src/lib/fillers.js).

const FOLD = {
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '−': '-', '…': '...',
}

// Returns { norm, map } where norm[i] came from original index map[i].
function normalise(text) {
  let norm = ''
  const map = []
  let lastWasSpace = true
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      if (!lastWasSpace) { norm += ' '; map.push(i) }
      lastWasSpace = true
      continue
    }
    const folded = (FOLD[ch] ?? ch).toLowerCase()
    for (const c of folded) { norm += c; map.push(i) }
    lastWasSpace = false
  }
  return { norm, map }
}

const trimEdges = (s) => String(s || '').trim().replace(/^["'“”‘’(\[]+|["'“”‘’)\].,;:!?]+$/g, '').trim()

/**
 * Find `quote` in `transcript`, tolerant of typography, case and spacing.
 * Returns { start, end, text } in ORIGINAL transcript coordinates, or null.
 * `from` lets a caller look for a later occurrence.
 */
export function findVerbatim(transcript, quote, from = 0) {
  const q = trimEdges(quote)
  if (!transcript || !q) return null
  const T = normalise(transcript)
  const Q = normalise(q).norm.trim()
  if (!Q) return null
  let startNorm = T.map.findIndex((orig) => orig >= from)
  if (startNorm === -1) return null
  const at = T.norm.indexOf(Q, startNorm)
  if (at === -1) return null
  const start = T.map[at]
  const end = T.map[at + Q.length - 1] + 1
  return { start, end, text: transcript.slice(start, end) }
}

export const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every word-boundary occurrence of `token` (case-insensitive), as spans. */
export function occurrences(text, token) {
  const t = trimEdges(token)
  if (!t) return []
  // \b only works next to word characters; fall back to plain matching for
  // tokens that start or end with punctuation (e.g. a false start "I was—").
  const left = /^\w/.test(t) ? '\\b' : ''
  const right = /\w$/.test(t) ? '\\b' : ''
  const re = new RegExp(left + escapeRegex(t).replace(/\s+/g, '\\s+') + right, 'gi')
  const out = []
  let m
  while ((m = re.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length })
  return out
}

/**
 * Pin one model-flagged token to one place in the transcript.
 * Prefers the occurrence inside `context`; uses the 1-based `occurrence`
 * index to break ties or when the context can't be found. Never returns more
 * than one span — a judgement about one "like" must not highlight every "like".
 */
export function locateToken(text, token, { context, occurrence } = {}) {
  const all = occurrences(text, token)
  if (!all.length) return null
  if (context) {
    const ctx = findVerbatim(text, context)
    if (ctx) {
      const inside = all.filter((o) => o.start >= ctx.start && o.end <= ctx.end)
      if (inside.length === 1) return inside[0]
      if (inside.length > 1) {
        const byIndex = Number.isInteger(occurrence) ? all[occurrence - 1] : null
        return inside.find((o) => o === byIndex) || inside[0]
      }
    }
  }
  if (Number.isInteger(occurrence) && all[occurrence - 1]) return all[occurrence - 1]
  return null
}
