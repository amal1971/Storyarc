// Shared Gemini JSON-mode caller: temperature 0, JSON output (PRD §9).
// Model pinned to an env var so a future retirement (2.0-flash was shut down
// June 2026) is a one-line config change, not a code change.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

// temperature defaults to 0 for pure-judgment calls. Calls that also generate
// prose pass a higher value: at 0 the model picks the most probable phrasing
// every time, which is precisely what "generic output" means. Code-level
// guardrails (verbatim substring checks) are what keep fabrication out, not
// temperature, so raising it costs nothing in safety.
export async function geminiJSON(prompt, { temperature = 0 } = {}) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  return JSON.parse(text)
}
