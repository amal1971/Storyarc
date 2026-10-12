// POST /api/analyze-framework — Gemini call for the Story Gym.
// The prompt is assembled from the framework registry, so new frameworks
// added in src/lib/frameworks.js work here with zero endpoint changes.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'
import { getFramework } from '../src/lib/frameworks.js'
import { requireActiveSession, chargePaidCall, refundPaidCall } from './_session.js'
import { rejectOversize } from './_limits.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
//
// 2026-10-11: tested on a 16-story corpus (28–432 words, ABT/SCR/STAR, 2 runs
// each) against the previous prompt. Verdicts were already 100% correct; this
// version fixes the retelling and feedback text: invented content in missing
// beats 5/10 → 0/10, "we" rewritten as "I" 2/2 → 0/2, off-topic answers
// flagged 0/2 → 2/2, verdict flips between runs 2/16 → 0/16, and with thinking
// off median latency 10.2s → 3.4s. Harness: docs/analysis-quality-audit/.
const FRAMEWORK_PROMPT_VERSION = 'framework-2026-10-11'

const MAX_SITUATION_CHARS = 300

const PROMPT = (transcript, fw, situation) => `You are a storytelling coach. The speaker answered ${situation ? 'this prompt' : 'a prompt'} out loud using the ${fw.fullName} (${fw.name}) framework.
${situation ? `PROMPT THEY WERE ANSWERING: ${situation}\n` : ''}
Framework beats (use these exact lowercase keys in your JSON):
${fw.steps.map((s) => `- key "${s.key}" — ${s.label}: ${s.hint}`).join('\n')}

${fw.analysisGuidance}

Verdict calibration:
- "hit": the beat is clearly there and specific — a listener could repeat it back.
- "partial": the beat is gestured at but thin or generic; or told as the group's ("we had to") where the framework wants the speaker's own; or present but not following from the previous beat.
- "missed": nothing in the transcript does this beat's job. A chain of "and then… and then…" has no turn. "It went well" or "everyone was happy" is not a measurable result. "It was stressful" or "there were a lot of issues" is not a complication. Stopping at the crisis is a missed ending.
- Long or rambling tellings: judge the main thread; tangents do not cancel a beat that is clearly present.${situation ? '\n- Relevance: if the story does not actually answer the prompt above, say so plainly in feedback_line.' : ''}

Do three things:
1. For each beat: verdict + ONE sentence note in second person that quotes (in double quotes, at most 8 words, copied exactly) or names a real detail from the transcript. No shaming, no invented facts, no comments on voice or delivery.
2. feedback_line: ONE sentence on how the telling used the framework overall, naming one concrete thing they said.
3. retelling: the speaker's own story reshaped into the framework. ${fw.retellGuidance}
   - Reuse the speaker's OWN words and concrete details. Keep names, numbers, times, objects, places, turns of phrase. Cut fillers, reorder and tighten freely; do not translate their language into neutral prose.
   - HARD RULES: add NOTHING that is not in the transcript — no invented stakes, feelings, causes, actions, or outcomes. Never turn "we" into "I": if the speaker never claimed personal ownership, do not give it to them. If a beat is "missed", do NOT write it for them: that segment's text must be a short bracketed note in second person naming what is missing, e.g. "[Your ‘But’ goes here — nothing in this telling breaks the calm. What went wrong?]".
   - First person, 160 words max in total, exactly one segment per beat, keys in order: ${fw.steps.map((s) => s.key).join(', ')}.

Worked example of keeping the speaker's texture:
Speaker said: "so the thing just died, like, white screen, nothing, and I'm sitting there at 2am with the account team flying in the next morning"
WEAK (never do this): "The system experienced a critical failure the night before an important client meeting."
STRONG (do this): "The thing just died — white screen, nothing. I'm at 2am with the account team flying in the next morning."

TRANSCRIPT:
${transcript}`

// Structured output: the API itself enforces the beat keys and verdict values.
// The old prompt returned capitalised labels ("And") in 6/6 raw calls on one
// model, which the case-sensitive matcher turned into a blank all-"Almost"
// result — the "retelling is broken" report from 2026-09-10.
const schemaFor = (fw) => ({
  type: 'OBJECT',
  properties: {
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING', enum: fw.steps.map((s) => s.key) },
          verdict: { type: 'STRING', enum: ['hit', 'partial', 'missed'] },
          note: { type: 'STRING' },
        },
        required: ['key', 'verdict', 'note'],
      },
    },
    feedback_line: { type: 'STRING' },
    retelling: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'STRING', enum: fw.steps.map((s) => s.key) },
          text: { type: 'STRING' },
        },
        required: ['step', 'text'],
      },
    },
  },
  required: ['steps', 'feedback_line', 'retelling'],
})

// Match on key or label, case-insensitively — belt and braces on top of the schema.
const findBeat = (arr, beat, field) =>
  (arr || []).find((x) => {
    const v = String(x?.[field] ?? x?.key ?? x?.step ?? '').toLowerCase()
    return v === beat.key.toLowerCase() || v === beat.label.toLowerCase()
  })

// Returns a normalised result, or null if any beat is missing a valid verdict,
// a note or a retelling segment. Missing pieces are a failed call, never a
// silently blank "Almost".
function normalise(data, fw) {
  const steps = []
  const retelling = []
  for (const beat of fw.steps) {
    const s = findBeat(data?.steps, beat, 'key')
    const r = findBeat(data?.retelling, beat, 'step')
    if (!s || !['hit', 'partial', 'missed'].includes(s.verdict) || !s.note || !r?.text) return null
    steps.push({ key: beat.key, verdict: s.verdict, note: s.note })
    retelling.push({ step: beat.key, text: r.text })
  }
  if (!data.feedback_line) return null
  return { steps, feedback_line: data.feedback_line, retelling }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // Gate: the cost-incurring endpoints are the actual reason the app has a
  // login, so the guard lives here, not only in the UI.
  const session = await requireActiveSession(req, res)
  if (!session) return
  const { transcript, frameworkId, situation } = req.body || {}
  const fw = getFramework(frameworkId)
  if (!transcript || !fw) return res.status(400).json({ error: 'transcript and valid frameworkId required' })
  if (rejectOversize(res, transcript)) return
  if (!geminiConfigured()) {
    // Zero-key demo mode: the client's deterministic mock is the intended path.
    return res.status(503).json({ error: 'not_configured', retryable: false, configured: false })
  }
  if (!(await chargePaidCall(session, res))) return
  const sit = typeof situation === 'string' ? situation.slice(0, MAX_SITUATION_CHARS) : ''

  try {
    const prompt = PROMPT(transcript, fw, sit)
    const opts = { temperature: 0.4, schema: schemaFor(fw), thinkingBudget: 0 }
    let out = normalise(await geminiJSON(prompt, opts), fw)
    if (!out) out = normalise(await geminiJSON(prompt, opts), fw) // one retry on an incomplete answer
    if (!out) throw new Error('framework response incomplete after retry')
    return res.status(200).json({
      ...out,
      provider: 'gemini',
      prompt_version: FRAMEWORK_PROMPT_VERSION,
      model: GEMINI_MODEL,
    })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    await refundPaidCall(session)
    return sendGeminiError(res, err, 'analyze-framework')
  }
}
