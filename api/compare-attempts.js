// POST /api/compare-attempts — the closing half of the feedback loop.
// Every other call analyzes one telling in isolation; this is the only one that
// sees BOTH tellings at once, together with the advice the speaker was given
// after the first. Without it the app can compare two numbers but can never say
// whether its own coaching actually landed.
import { geminiJSON, geminiConfigured, sendGeminiError, GEMINI_MODEL } from './_gemini.js'

// Bump when the prompt below changes materially. Stored with every result
// so a saved output can be traced back to the prompt that produced it.
const COMPARE_PROMPT_VERSION = 'compare-2026-07-24'
import { getFramework } from '../src/lib/frameworks.js'
import { requireActiveSession, chargePaidCall, refundPaidCall } from './_session.js'
import { rejectOversize, cleanSuggestedFix, cleanSteps } from './_limits.js'

const SHARED_RULES = `Rules:
- Name concrete differences. Quote or point at the actual words that appeared, disappeared, or moved between the two tellings. A sentence that could describe any two recordings is a failure.
- Be honest. If they did not take the advice, say so warmly rather than pretending they did. False praise makes the whole tool worthless.
- Never shame. Never comment on voice, tone, pace, or delivery — you have only text, not audio.
- Invent nothing. If a change is not visible in the two transcripts, do not claim it.
- Second person, plain language, no jargon.`

const SHARED_SCHEMA = `Return STRICT JSON:
{"fix_addressed":"yes"|"partly"|"no","fix_note":"one sentence on whether the advice landed, naming what they actually did or didn't say","headline":"a short warm phrase summing up the round, max 6 words, no period","what_changed":"one or two sentences naming the concrete differences between the tellings","keep_this":"one specific thing from the second telling worth keeping, quoting their words where possible","next_edge":"one thing to carry into the next story, one sentence"}`

const LAB_PROMPT = ({ transcript1, transcript2, suggestedFix }) =>
  `You are a storytelling coach reviewing the SAME speaker telling the SAME story twice, minutes apart. The second telling was from memory, with nothing on screen to lean on.

${
  suggestedFix
    ? `After the first telling, the speaker was given exactly this advice:\n"${suggestedFix}"\n\nYour most important job is judging whether they acted on it.`
    : 'No specific advice was given after the first telling, so judge the change on its own terms.'
}

FIRST TELLING:
${transcript1}

SECOND TELLING:
${transcript2}

${SHARED_RULES}

${SHARED_SCHEMA}`

const GYM_PROMPT = ({ transcript1, transcript2, fw, steps1 }) =>
  `You are a storytelling coach. The speaker answered the SAME prompt twice using the ${fw.fullName} (${fw.name}) framework. Between the two attempts they saw a beat-by-beat verdict on their first try, plus a retelling of their own story reshaped into the correct framework order.

Framework beats:
${fw.steps.map((s) => `- ${s.key} ("${s.label}"): ${s.hint}`).join('\n')}

How the FIRST attempt scored:
${(steps1 || []).map((s) => `- ${s.key}: ${s.verdict}${s.note ? ` — ${s.note}` : ''}`).join('\n')}

Your most important job is judging whether the second attempt actually moved the beats that were weak, and whether seeing the retelling changed how they told it.

FIRST ATTEMPT:
${transcript1}

SECOND ATTEMPT:
${transcript2}

${SHARED_RULES}

${SHARED_SCHEMA}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // Gate: the cost-incurring endpoints are the actual reason the app has a
  // login, so the guard lives here, not only in the UI.
  const session = await requireActiveSession(req, res)
  if (!session) return
  const { mode = 'lab', transcript1, transcript2, suggestedFix, frameworkId, steps1 } = req.body || {}
  if (!transcript1 || !transcript2) {
    return res.status(400).json({ error: 'transcript1 and transcript2 required' })
  }
  if (rejectOversize(res, transcript1, transcript2)) return
  const fix = cleanSuggestedFix(suggestedFix)
  const steps = cleanSteps(steps1)
  if (!fix.ok || !steps.ok) return res.status(400).json({ error: 'invalid_input', retryable: false, configured: true })

  let prompt
  if (mode === 'gym') {
    const fw = getFramework(frameworkId)
    if (!fw) return res.status(400).json({ error: 'valid frameworkId required for gym mode' })
    prompt = GYM_PROMPT({ transcript1, transcript2, fw, steps1: steps.value })
  } else {
    prompt = LAB_PROMPT({ transcript1, transcript2, suggestedFix: fix.value })
  }

  if (!geminiConfigured()) {
    // Zero-key demo mode: the client's deterministic mock is the intended path.
    return res.status(503).json({ error: 'not_configured', retryable: false, configured: false })
  }
  if (!(await chargePaidCall(session, res))) return

  try {
    const data = await geminiJSON(prompt, { temperature: 0.5 })
    const verdict = ['yes', 'partly', 'no'].includes(data.fix_addressed) ? data.fix_addressed : 'partly'
    return res.status(200).json({
      fix_addressed: verdict,
      fix_note: data.fix_note || '',
      headline: data.headline || '',
      what_changed: data.what_changed || '',
      keep_this: data.keep_this || '',
      next_edge: data.next_edge || '',
      provider: 'gemini',
      prompt_version: COMPARE_PROMPT_VERSION,
      model: GEMINI_MODEL,
    })
  } catch (err) {
    // Overloaded, out of credit, or failed: never dressed up as a result.
    await refundPaidCall(session)
    return sendGeminiError(res, err, 'compare-attempts')
  }
}
