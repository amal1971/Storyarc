// POST /api/analyze-structure — Gemini Call 2: SCR structure rubric.
// NOTE: replace PROMPT with the paste-ready version from
// StoryArc_Task1_Rubrics_Prompts_EvalSet.md before Milestone 2 sign-off.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'
import { requireActiveSession, chargePaidCall, refundPaidCall } from './_session.js'
import { rejectOversize } from './_limits.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
const STRUCTURE_PROMPT_VERSION = 'structure-2026-07-24'

const PROMPT = (transcript) => `You are a story-structure analyst using a Situation/Complication/Resolution rubric. Analyze the spoken-story transcript below.

Definitions:
- situation_present: the listener can tell who/where/when — a scene is set.
- complication_present: something specific goes wrong, changes, or creates tension (a generic "it was hard" does NOT count; a concrete obstacle does).
- outcome_present: LENIENT/binary — any stated ending counts, even a weak one ("we shipped late", "it worked out").
- outcome_connected: STRICTER, unscored — true only if the ending clearly resolves the stated complication (not a bolted-on "and it was fine").
- flagged_element: the weakest or missing element ("situation"|"complication"|"outcome"), or null if all three are strong.
- feedback_line: ONE sentence about how the story lands, in And-But-Therefore spirit — acknowledge what works, then name what's missing, in a single breath. It MUST name at least one concrete thing the speaker actually said (an object, a moment, a number, a person, a place). A sentence that could be pasted onto a stranger's story is a failure. NEVER use the words "situation", "complication", "outcome", "element", or "structure". Never shame. Never comment on voice, tone, or delivery. Invent nothing.
- suggested_fix: EXACTLY ONE action for the speaker's next telling. One sentence, 20 words max. Name the specific thing to say, not a category of thing to add.
- evidence: a VERBATIM substring of the transcript (max 12 words) supporting your flagged_element judgment, or null.

Worked example of a good vs bad suggested_fix, for a story about a demo that broke:
WEAK (never do this): "Start by naming the specific project, timeframe, and team involved to anchor the scene." — three actions bundled together, every one of them an abstract category.
STRONG (do this): "Open with which client the demo was for — one line, before anything breaks." — one action, names the actual missing thing.

Return STRICT JSON:
{"situation_present":bool,"complication_present":bool,"outcome_present":bool,"element_count":0-3,"flagged_element":"situation"|"complication"|"outcome"|null,"outcome_connected":bool,"feedback_line":"...","suggested_fix":"...","evidence":"..."|null}

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
  if (!(await chargePaidCall(session, res))) return

  try {
    let data = await geminiJSON(PROMPT(transcript), { temperature: 0.4 })
    // Anti-fabrication guardrail: evidence must be a verbatim substring.
    // One retry, then degrade by dropping the quote (PRD §9).
    if (data.evidence && !transcript.includes(data.evidence)) {
      // Retry at temperature 0: the first pass paraphrased instead of quoting,
      // so tighten rather than re-roll at the same creative setting.
      data = await geminiJSON(PROMPT(transcript), { temperature: 0 })
      if (data.evidence && !transcript.includes(data.evidence)) {
        data = { ...data, evidence: null, evidence_rejected: true }
      }
    }
    data.element_count = [
      data.situation_present,
      data.complication_present,
      data.outcome_present,
    ].filter(Boolean).length
    return res.status(200).json({ ...data, provider: 'gemini', prompt_version: STRUCTURE_PROMPT_VERSION, model: GEMINI_MODEL })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    await refundPaidCall(session)
    return sendGeminiError(res, err, 'analyze-structure')
  }
}
