// POST /api/analyze-structure — Gemini Call 2: SCR structure rubric.
// NOTE: replace PROMPT with the paste-ready version from
// StoryArc_Task1_Rubrics_Prompts_EvalSet.md before Milestone 2 sign-off.
import { geminiJSON } from './_gemini.js'

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
  const { transcript } = req.body || {}
  if (!transcript) return res.status(400).json({ error: 'transcript required' })
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
    return res.status(200).json({ ...data, provider: 'gemini' })
  } catch (err) {
    console.error('[analyze-structure]', err)
    return res.status(502).json({ error: 'structure analysis failed' })
  }
}
