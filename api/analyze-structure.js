// POST /api/analyze-structure — Gemini Call 2: story-shape rubric.
// The rubric is the author's spec (StoryArc_Task1_Rubrics_Prompts_EvalSet.md,
// Call 2): concrete present/absent tests for each element, a priority rule for
// what to work on next, the dominant-thread rule for rambling, two worked
// input→output examples — plus this app's own rules for the feedback line and
// the one-action fix. Output stays in the flat shape the screens already use.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'
import { requireActiveSession, chargePaidCall, refundPaidCall } from './_session.js'
import { rejectOversize } from './_limits.js'
import { findVerbatim, wordCount } from '../src/lib/verbatim.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
//
// 2026-10-13: replaces the placeholder prompt. In an A/B on 10 labelled
// stories × 2 runs it raised "what to work on next" from 85% to 100%, removed
// run-to-run verdict flips (1 story → 0), and returned a verbatim quote 16/20
// times instead of 2/20. Harness: docs/analysis-quality-audit/.
const STRUCTURE_PROMPT_VERSION = 'structure-2026-10-13'

const MAX_PROMPT_CHARS = 200

const PROMPT = (transcript, promptText) => `You are a storytelling-craft analyst for a spoken-story practice app. You receive a verbatim transcript of someone telling a story out loud${promptText ? ` in response to the prompt "${promptText}"` : ''}. Judge THREE elements using the rubric, then write feedback. Spoken language is messy — judge the story, not the grammar.

RUBRIC
- situation: present if at least one clause gives concrete context BEFORE anything goes wrong — time/place, the speaker's role, or the plan/normal state. A topic announcement alone ("this is a story about my internship") does NOT count; an opinion or explanation with no scene does NOT count.
- complication: present only if a specific, nameable EVENT or turn disrupts the situation. Vague hardship ("it was so stressful", "there were a lot of issues"), effort ("I had to study a lot"), or an emotional state with no concrete occurrence do NOT count. "I completely blanked" counts; "I was nervous" does not. A list of pleasant events with nothing pushing back has no complication.
- outcome: LENIENT — present if at least one clause states how the episode ended or what changed as a result ("since then I always…", "we shipped forty minutes late"). It does NOT need to resolve the complication well. Discourse-enders ("so yeah, that's it"), stopping at the crisis peak, and summary characterizations with no ending ("that semester felt like running in place") do NOT count.
- If the transcript rambles across several threads, judge the most developed thread.
- outcome_connected: true if the stated outcome tells us what became of the named complication; false if an ending exists but the complication's fate is never stated (e.g. a lost wallet, then "the wedding food was amazing"); null if either the complication or the outcome is absent.
- flagged_element: the element to work on next. If any are absent, pick by priority complication > outcome > situation. If all three are present, pick the weakest (least specific or least developed), never null.

FEEDBACK RULES
- evidence: a VERBATIM substring of the transcript, at most 12 words, character-for-character as spoken, that best shows the flagged element's state (the thin scene, the missing turn, the bolted-on ending) — or null if nothing in the text relates to it.
- feedback_line: exactly ONE sentence in and-but-therefore spirit: acknowledge what works, then name what's missing, in one breath. It MUST name at least one concrete thing the speaker actually said (an object, a moment, a number, a person, a place). A sentence that could be pasted onto a stranger's story is a failure. NEVER use the words "situation", "complication", "outcome", "element", "structure", "setup", "resolution". Never shame. Never comment on voice, tone, pace, or delivery — you only have text. Invent nothing.
- suggested_fix: EXACTLY ONE action for the next telling, imperative voice, one sentence, 20 words max, targeting flagged_element and grounded only in what the speaker actually said. Name the specific thing to say, not a category of thing to add. Never ask them to add something they already said.

WORKED EXAMPLES
Transcript: "Last Sunday I finally set up my balcony garden, three pots, tomatoes and mirchi, and by evening the whole corner looked alive. My mother sent me her old watering can for it."
Output: {"situation_present":true,"complication_present":false,"outcome_present":true,"outcome_connected":null,"flagged_element":"complication","evidence":"by evening the whole corner looked alive","feedback_line":"You give us the three pots and the tomatoes and the corner coming alive, but nothing ever pushes back, so it reads as a pleasant report rather than a story.","suggested_fix":"Add the one moment something resisted — the pot that cracked or the plant that wouldn't take."}

Transcript: "Our final match, I was keeping wicket, and their opener was on fire, forty off twenty balls. Then our captain tossed me the ball, me, who hadn't bowled all season, and the whole ground went quiet."
Output: {"situation_present":true,"complication_present":true,"outcome_present":false,"outcome_connected":null,"flagged_element":"outcome","evidence":"the whole ground went quiet","feedback_line":"Forty off twenty balls and the captain tossing you the ball is a real twist, but the story ends before the ball leaves your hand.","suggested_fix":"Say what that over became — one line on what happened after the ground went quiet."}

Bad suggested_fix (never do this): "Start by naming the specific project, timeframe, and team involved to anchor the scene." — three actions bundled, each an abstract category.

TRANSCRIPT:
${transcript}`

// Structured output: types and enums enforced by the API, not just requested.
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    situation_present: { type: 'BOOLEAN' },
    complication_present: { type: 'BOOLEAN' },
    outcome_present: { type: 'BOOLEAN' },
    outcome_connected: { type: 'BOOLEAN', nullable: true },
    flagged_element: { type: 'STRING', enum: ['situation', 'complication', 'outcome'] },
    evidence: { type: 'STRING', nullable: true },
    feedback_line: { type: 'STRING' },
    suggested_fix: { type: 'STRING' },
  },
  required: ['situation_present', 'complication_present', 'outcome_present', 'outcome_connected', 'flagged_element', 'evidence', 'feedback_line', 'suggested_fix'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // Gate: the cost-incurring endpoints are the actual reason the app has a
  // login, so the guard lives here, not only in the UI.
  const session = await requireActiveSession(req, res)
  if (!session) return
  const { transcript, promptText } = req.body || {}
  if (!transcript) return res.status(400).json({ error: 'transcript required' })
  if (rejectOversize(res, transcript)) return
  if (!geminiConfigured()) {
    // Zero-key demo mode: the client's deterministic mock is the intended path.
    return res.status(503).json({ error: 'not_configured', retryable: false, configured: false })
  }
  if (!(await chargePaidCall(session, res))) return
  const prompt = typeof promptText === 'string' ? promptText.slice(0, MAX_PROMPT_CHARS) : ''

  try {
    const raw = await geminiJSON(PROMPT(transcript, prompt), { temperature: 0.2, schema: SCHEMA })
    if (typeof raw.feedback_line !== 'string' || typeof raw.suggested_fix !== 'string') {
      throw new Error('structure response incomplete')
    }
    const s = raw.situation_present === true
    const c = raw.complication_present === true
    const o = raw.outcome_present === true
    // Anti-fabrication guardrail: the quote must really be in the transcript.
    // It is matched tolerantly (curly quotes, case, spacing) and then replaced
    // with the transcript's exact characters; if it isn't there, only the
    // quote is dropped — the judgements stay as they were.
    let evidence = null
    let evidenceRejected = false
    if (raw.evidence) {
      const hit = findVerbatim(transcript, raw.evidence)
      if (hit && wordCount(hit.text) <= 12) evidence = hit.text
      else evidenceRejected = true
    }
    const data = {
      situation_present: s,
      complication_present: c,
      outcome_present: o,
      element_count: [s, c, o].filter(Boolean).length,
      // The rubric makes "connected" undefined when either end is missing;
      // the screens treat anything but an explicit false as "nothing to say".
      outcome_connected: c && o ? raw.outcome_connected === true : null,
      flagged_element: ['situation', 'complication', 'outcome'].includes(raw.flagged_element) ? raw.flagged_element : null,
      feedback_line: raw.feedback_line,
      suggested_fix: raw.suggested_fix,
      evidence,
      ...(evidenceRejected ? { evidence_rejected: true } : {}),
    }
    return res.status(200).json({ ...data, provider: 'gemini', prompt_version: STRUCTURE_PROMPT_VERSION, model: GEMINI_MODEL })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    await refundPaidCall(session)
    return sendGeminiError(res, err, 'analyze-structure')
  }
}
