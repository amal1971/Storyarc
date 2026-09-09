// Shared Gemini JSON-mode caller: JSON output, explicit temperature (PRD §9).

// Model pinned to an env var so a future retirement (2.0-flash was shut down
// June 2026) is a one-line config change, not a code change.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

// Gemini returns 503 "high demand" intermittently — measured roughly one call
// in three during a spike. Without a retry a single blip drops the user into
// the offline mock, whose output is bad enough to read as a broken product.
// Retry only what can plausibly succeed on a second attempt: overload, rate
// limit, gateway errors, and network faults. Never retry a 400 or a 401 —
// a malformed request or a bad key will fail identically forever.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 700

// Thrown when every attempt failed for a reason that is about the service,
// not about us. Callers use this to tell "temporarily unavailable" apart from
// "no key configured", which the UI must present very differently.
export class GeminiUnavailableError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'GeminiUnavailableError'
    this.status = status
    this.retryable = true
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function geminiJSON(prompt, { temperature = 0, signal } = {}) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  let lastStatus = null
  let lastBody = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, responseMimeType: 'application/json' },
          }),
          signal,
        },
      )
    } catch (err) {
      // Network-level fault (DNS, socket, abort). Treat as retryable.
      lastStatus = null
      lastBody = err.message
      if (attempt === MAX_ATTEMPTS) {
        throw new GeminiUnavailableError(`gemini unreachable after ${MAX_ATTEMPTS} attempts: ${err.message}`)
      }
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250)
      continue
    }

    if (res.ok) {
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        // Empty candidate usually means a safety block or a truncated
        // response — not worth retrying, and not the service's fault.
        throw new Error('gemini returned no content')
      }
      return JSON.parse(text)
    }

    lastStatus = res.status
    lastBody = await res.text()

    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) break
    // Honour Retry-After when the API sends one, else exponential backoff.
    const retryAfter = Number(res.headers.get('retry-after'))
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250
    await sleep(wait)
  }

  if (RETRYABLE_STATUS.has(lastStatus)) {
    throw new GeminiUnavailableError(
      `gemini ${lastStatus} after ${MAX_ATTEMPTS} attempts: ${lastBody}`,
      { status: lastStatus },
    )
  }
  throw new Error(`gemini ${lastStatus}: ${lastBody}`)
}
