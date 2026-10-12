// POST /api/analyze-fillers — Gemini Call 1: Tier-B filler adjudication.
// The prompt is the author's v2 generalized spec
// (StoryArc_Filler_Prompt_v2_Generalized.md): a Deletion Test + Function Check
// applied to every candidate, calibration rules for the words that are only
// sometimes fillers (like, actually, literally, right, just, I guess, …), false
// starts, and overrides that cancel a fixed-list "you know" used as a real
// question. Each judgement comes back pinned to ONE occurrence, and the server
// turns it into an exact character span so the client highlights exactly that.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'
import { requireActiveSession, chargePaidCall, refundPaidCall } from './_session.js'
import { rejectOversize } from './_limits.js'
import { locateToken } from '../src/lib/verbatim.js'
import { TIER_A_FILLERS } from '../src/lib/fillers.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
const FILLERS_PROMPT_VERSION = 'fillers-2026-10-13'

const PROMPT = (transcript) => `You are a precise linguistic annotator for a storytelling practice app. You receive a verbatim speech transcript. Deterministic code has ALREADY counted these fixed fillers: um, uh, er, ah, erm, hmm, mhmm, "you know", "I mean", "kind of", "sort of", "basically", "to be honest", "at the end of the day". Your job is to find and classify ALL OTHER filler language — both the calibration words below and any other filler-like word or short phrase in the transcript that fits the test, even if it is not named here.

WHAT COUNTS AS A FILLER — apply this test to every candidate, listed or not:
Test 1 (Deletion Test): delete the word/phrase from the sentence. If NO real information is lost (no fact, time, degree, comparison, or claim disappears) — it is a filler. If real information IS lost — it is not a filler.
Test 2 (Function Check, use if Test 1 is ambiguous): is the word buying thinking time, softening a claim, filling a pause, or verbally shrugging (filler) — or is it making a comparison, quoting someone, marking genuine contrast/surprise, stating a fact, or expressing real degree/exclusivity (not filler)?

CALIBRATION WORDS (apply the test to these AND to anything else that fits — do not treat this as a closed list):
- like: verb ("I like it") → not filler. Comparative frame ("felt like," "looked like") → not filler. Fixed idiom ("like crazy") → not filler. Quotative ("she was like, ...") → filler, category "quotative_like". Approximation before a quantity ("like twenty minutes") → filler, category "approx_like". Any other insert → filler, category "discourse_like".
- actually: delete-test — loses a genuine contrast/correction → not filler; was padding → filler, category "hedge".
- literally: count it ONLY when what follows is plainly impossible or exaggerated ("literally dying laughing", "literally a million times") → filler, category "intensifier". If what follows could simply be true — a fact, a count, a physical reaction ("literally broke my arm", "it was literally one time", "I was literally shaking") — it is NOT a filler. When unsure, do not count it.
- right: tag-question at clause end ("...right?") → filler, category "tag". Means "correct" or a direction, or is part of a phrase like "right after" → not filler.
- just: pure hedge with no time/degree/exclusivity meaning ("I was just, like, standing there") → filler, category "hedge". Real time/degree/exclusivity modifier ("I just got there," "just five minutes") → not filler.
- I guess: parenthetical hedge → filler, category "hedge". Literal act of guessing → not filler.
- oh: genuine reaction/exclamation ("Oh no!") → not filler. Meaningless discourse insert with no reaction ("oh, so anyway") → filler, category "discourse_oh".
- honestly / essentially: apply Test 1 — almost always filler when it can be deleted with no information loss → filler, category "hedge".
- anyway: filler by default (transition/completer) → category "hedge", unless it is doing real logical work you can point to.
- I don't know / I dunno: hedge on an estimate or vague answer → filler, category "hedge". Genuine statement of not knowing a fact → not filler.
- or whatever / type of thing / that kind of thing: vague-completer, filler by default → category "hedge".

FALSE STARTS: an abandoned fragment restarted/reformulated within the same clause ("I went— I was going to"). One event per abandonment. Emphasis repetition ("it was tough, it was really tough", "triple, triple") is NOT a false start.

UNLISTED WORDS: if you encounter a filler-like word or phrase not in the calibration list above (including regional/colloquial discourse fillers), apply the same two tests and return it under category "other" with a one-word reason in "note". Do not flag a word just because it is casual or informal — only the two tests decide. Never flag ordinary narrative connectives ("and", "then", "so" joining two events) or content phrases.

Tier-A overrides: deterministic code counts every "you know". If an instance is a genuine question/assertion where "know" takes an object or complement ("Do you know that feeling", "you know what she said?"), cancel it via tier_a_overrides with reason "interrogative". Bare parenthetical ", you know," is NOT cancelled.

LOG ONLY, DO NOT COUNT: utterance-initial "so", "well" → excluded_markers_log with position "utterance_initial". Ignore mid-sentence causal "so" entirely.

"occurrence" = the Nth appearance of that exact token in the transcript (case-insensitive, whole words), counting every appearance including ones you skip. "context" = a verbatim substring of ≤ 8 words containing the token, copied exactly. Never invent text.

EXAMPLE 1
Transcript: "I was— we were driving back from Lonavala and I like the ghats normally, but that night it was, like, fog everywhere, um, you couldn't see the divider."
Output:
{"tier_b_fillers":[{"token":"like","occurrence":2,"category":"discourse_like","context":"it was, like, fog everywhere","note":null}],"false_starts":[{"fragment":"I was—","occurrence":1,"context":"I was— we were driving back"}],"tier_a_overrides":[],"excluded_markers_log":[]}

EXAMPLE 2
Transcript: "You know what the funny part is? I guess I never checked the date, and the ticket was actually for the previous Friday, you know, the one we skipped."
Output:
{"tier_b_fillers":[{"token":"I guess","occurrence":1,"category":"hedge","context":"I guess I never checked the","note":null}],"false_starts":[],"tier_a_overrides":[{"token":"you know","occurrence":1,"reason":"interrogative"}],"excluded_markers_log":[]}

EXAMPLE 3 (tests literally, right, just, and an unlisted word "na")
Transcript: "I literally broke my arm that day, right, but I was just, like, sitting there, honestly, waiting, na, for someone to notice."
Output:
{"tier_b_fillers":[{"token":"right","occurrence":1,"category":"tag","context":"broke my arm that day, right","note":null},{"token":"just","occurrence":1,"category":"hedge","context":"but I was just, like, sitting","note":null},{"token":"like","occurrence":1,"category":"discourse_like","context":"was just, like, sitting there","note":null},{"token":"honestly","occurrence":1,"category":"hedge","context":"sitting there, honestly, waiting","note":null},{"token":"na","occurrence":1,"category":"other","context":"waiting, na, for someone","note":"regional discourse filler"}],"false_starts":[],"tier_a_overrides":[],"excluded_markers_log":[]}
("literally broke my arm" states a true, checkable fact — NOT counted.)

Transcript to annotate:
${transcript}`

const CATEGORIES = ['discourse_like', 'quotative_like', 'approx_like', 'hedge', 'intensifier', 'tag', 'discourse_oh', 'other']

// Structured output: the API enforces the shape and the category enum.
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    tier_b_fillers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          token: { type: 'STRING' },
          occurrence: { type: 'INTEGER' },
          category: { type: 'STRING', enum: CATEGORIES },
          context: { type: 'STRING' },
          note: { type: 'STRING', nullable: true },
        },
        required: ['token', 'occurrence', 'category', 'context'],
      },
    },
    false_starts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { fragment: { type: 'STRING' }, occurrence: { type: 'INTEGER' }, context: { type: 'STRING' } },
        required: ['fragment', 'occurrence', 'context'],
      },
    },
    tier_a_overrides: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { token: { type: 'STRING' }, occurrence: { type: 'INTEGER' }, reason: { type: 'STRING' } },
        required: ['token', 'occurrence'],
      },
    },
    excluded_markers_log: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { token: { type: 'STRING' }, occurrence: { type: 'INTEGER' } } },
    },
  },
  required: ['tier_b_fillers', 'false_starts', 'tier_a_overrides'],
}

const TIER_A = new Set(TIER_A_FILLERS)

// Turn the model's { token, occurrence, context } judgements into exact spans.
// Anything that can't be pinned to the transcript is dropped, never guessed.
function toEvents(transcript, data) {
  const events = []
  const taken = (s, e) => events.some((ev) => s < ev.end && e > ev.start)
  for (const f of data.tier_b_fillers || []) {
    const token = String(f.token || '').trim()
    if (!token || TIER_A.has(token.toLowerCase())) continue // Tier A is code's job
    const span = locateToken(transcript, token, { context: f.context, occurrence: f.occurrence })
    if (!span || taken(span.start, span.end)) continue
    events.push({ token: token.toLowerCase(), category: f.category, start: span.start, end: span.end, context: f.context })
  }
  for (const f of data.false_starts || []) {
    const fragment = String(f.fragment || '').trim().replace(/[\s,.;:]+$/, '')
    if (!fragment) continue
    const span = locateToken(transcript, fragment.replace(/[-—–]+$/, ''), { context: f.context, occurrence: f.occurrence })
    if (!span || taken(span.start, span.end)) continue
    events.push({ token: fragment.toLowerCase(), category: 'false_start', start: span.start, end: span.end, context: f.context })
  }
  const overrides = []
  for (const o of data.tier_a_overrides || []) {
    if (String(o.token || '').toLowerCase().trim() !== 'you know') continue
    const span = locateToken(transcript, 'you know', { occurrence: o.occurrence })
    if (span) overrides.push({ token: 'you know', start: span.start, end: span.end })
  }
  return { events: events.sort((a, b) => a.start - b.start), overrides }
}

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
    const data = await geminiJSON(PROMPT(transcript), { temperature: 0, schema: SCHEMA })
    const { events, overrides } = toEvents(transcript, data)
    return res.status(200).json({ events, overrides, provider: 'gemini', prompt_version: FILLERS_PROMPT_VERSION, model: GEMINI_MODEL })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    await refundPaidCall(session)
    return sendGeminiError(res, err, 'analyze-fillers')
  }
}
