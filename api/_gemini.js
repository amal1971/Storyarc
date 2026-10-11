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
const MAX_WAIT_MS = 2500

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

// Thrown when Google refuses the call for billing reasons (HTTP 402: the
// prepaid balance is empty). Retrying cannot help, and the user should be
// told the service needs attention rather than "something hiccuped".
export class GeminiBillingError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GeminiBillingError'
    this.retryable = false
  }
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY)
}

// One place that turns a thrown Gemini error into the JSON contract the client
// relies on (`configured`, `retryable`, `reason`). Every analyze-* handler and
// compare-attempts use it, so the mapping can't drift between endpoints.
export function sendGeminiError(res, err, tag) {
  console.error(`[${tag}]`, err)
  if (err instanceof GeminiBillingError) {
    return res.status(503).json({ error: 'service_unavailable', reason: 'billing', retryable: false, configured: true })
  }
  if (err instanceof GeminiUnavailableError) {
    return res.status(503).json({ error: 'model_unavailable', retryable: true, configured: true })
  }
  return res.status(502).json({ error: 'analysis_failed', retryable: false, configured: true })
}

// schema → Gemini `responseSchema` (structured output: enums and required keys
// enforced by the API, not just requested in prose).
// thinkingBudget → defaults to 0, which turns off the model's hidden reasoning
// pass for EVERY call. Thinking tokens are billed at the output rate (5x input)
// and were over half of each call's tokens; on the Gym corpus turning it off
// cut latency ~3x and cost ~4x with identical verdicts. Pass a positive budget
// only for a call that has been shown (with the harness) to need it.
export async function geminiJSON(prompt, { temperature = 0, signal, schema, thinkingBudget = 0 } = {}) {
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
            generationConfig: {
              temperature,
              responseMimeType: 'application/json',
              ...(schema ? { responseSchema: schema } : {}),
              thinkingConfig: { thinkingBudget },
            },
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

    if (res.status === 402) throw new GeminiBillingError(`gemini 402: ${lastBody}`)
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) break
    // Honour Retry-After when the API sends one, else exponential backoff —
    // capped, because Google sometimes says "retry in 47s", which would blow
    // straight through the serverless function timeout.
    const retryAfter = Number(res.headers.get('retry-after'))
    const wait = Math.min(
      MAX_WAIT_MS,
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250,
    )
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
