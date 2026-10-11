// POST /api/analyze-fillers — Gemini Call 1: Tier-B filler adjudication.
// Generalized classification via Deletion Test + Function Check (not a word list).
// NOTE: replace PROMPT with the paste-ready version from
// StoryArc_Filler_Prompt_v2_Generalized.md before Milestone 2 sign-off.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'
import { requireActiveSession } from './_session.js'
import { rejectOversize } from './_limits.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
const FILLERS_PROMPT_VERSION = 'fillers-2026-09-04'

const PROMPT = (transcript) => `You are a speech-clarity analyst. Find FILLER EVENTS in the transcript below.

A word or phrase is a filler event only if it passes BOTH tests:
1. Deletion Test: removing it leaves the sentence grammatical and the meaning unchanged.
2. Function Check: it carries no informational, emphatic, or narrative function in context — it only buys the speaker time or softens without purpose.

Also flag two patterns that hide in real speech:
- near_repetition: a phrase restarted or recycled within a breath that adds nothing ("we tried to, we tried to do", "and then we, and we went"). Exact back-to-back repeats are already handled deterministically — you are looking for the messier restarts.
- empty_connective: a connective phrase carrying no content that just bridges to the next thought ("and we just went", "and then we did the thing", "so yeah", "and stuff like that").
Example: in "So we, we kind of just went and did the thing, and yeah it worked", flag "we, we" (near_repetition) and "and did the thing" + "and yeah" (empty_connective).

Do NOT flag: words that carry meaning in context (e.g. "like" as a verb or comparison), intentional emphasis or deliberate repetition for effect, or quoted speech. Do NOT flag anything from this already-handled list: um, uh, er, ah, erm, hmm, mhmm, you know, I mean, kind of, sort of, basically, to be honest, at the end of the day.

Return STRICT JSON: {"events":[{"token":"<the exact word/phrase, lowercase>","category":"discourse_filler|hedge|false_start|near_repetition|empty_connective","context":"<verbatim substring of the transcript, max 12 words, containing the token>"}]}
If there are none, return {"events":[]}.

TRANSCRIPT:
${transcript}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // Gate: the cost-incurring endpoints are the actual reason the app has a
  // login, so the guard lives here, not only in the UI.
  const session = await requireActiveSession(req, res)
  if (!session) return
  const { transcript } = req.body || {}
  if (!transcript) return res.status(400).json({ error: 'transcript required' })
  if (rejectOversize(res, transcript)) return
  if (!geminiConfigured()) {
    // Zero-key demo mode: the client's deterministic mock is the intended path.
    return res.status(503).json({ error: 'not_configured', retryable: false, configured: false })
  }

  try {
    const data = await geminiJSON(PROMPT(transcript))
    // Guardrail: context must be a verbatim substring; drop events that fail.
    const events = (data.events || []).filter(
      (e) => e && e.token && (!e.context || transcript.includes(e.context)),
    )
    return res.status(200).json({ events, provider: 'gemini', prompt_version: FILLERS_PROMPT_VERSION, model: GEMINI_MODEL })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    return sendGeminiError(res, err, 'analyze-fillers')
  }
}
