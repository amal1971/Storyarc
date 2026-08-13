// POST /api/analyze-framework — Gemini call for the Framework Gym.
// The prompt is assembled from the framework registry, so new frameworks
// added in src/lib/frameworks.js work here with zero endpoint changes.
import { geminiJSON } from './_gemini.js'
import { getFramework } from '../src/lib/frameworks.js'

const PROMPT = (transcript, fw) => `You are a storytelling coach. The speaker practiced the ${fw.fullName} (${fw.name}) framework on a spoken story.

Framework beats:
${fw.steps.map((s) => `- ${s.key} ("${s.label}"): ${s.hint}`).join('\n')}

${fw.analysisGuidance}

Do three things:
1. Judge each beat: verdict "hit" | "partial" | "missed", plus ONE plain-language sentence as a note. Each note must point at something the speaker actually said — quote or name a real detail from their telling. A note that could be pasted onto a different story is a failed note. No shaming, no invented facts, no comments on voice or delivery.
2. Write feedback_line: ONE sentence on how the telling used the framework overall.
3. Retell the speaker's story USING the framework. ${fw.retellGuidance}

The retelling is the most valuable thing you produce — the speaker learns by hearing their own material done right. Rules:
- Reuse the speaker's OWN words and concrete details wherever possible. Keep their specifics: names, numbers, times, objects, places, turns of phrase.
- Cut, reorder, and tighten freely. That is the job. But do not translate their language into neutral prose.
- Add NOTHING absent from the transcript — no invented stakes, feelings, or outcomes.
- It should sound like the speaker on their best day, not like a press release.
- First person, 160 words max, exactly one segment per beat (keys in order: ${fw.steps.map((s) => s.key).join(', ')}).

Worked example of the ONLY thing that matters here — keeping the speaker's texture:
Speaker said: "so the thing just died, like, white screen, nothing, and I'm sitting there at 2am with the account team flying in the next morning"
WEAK (never do this): "The system experienced a critical failure the night before an important client meeting."
STRONG (do this): "The thing just died — white screen, nothing. I'm at 2am with the account team flying in the next morning."
The weak version swapped every specific for its category and lost the speaker entirely. The strong version cut the filler and kept "white screen, nothing", "2am", "account team flying in".

Return STRICT JSON:
{"steps":[{"key":"<beat key>","verdict":"hit|partial|missed","note":"..."}],"feedback_line":"...","retelling":[{"step":"<beat key>","text":"..."}]}

TRANSCRIPT:
${transcript}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { transcript, frameworkId } = req.body || {}
  const fw = getFramework(frameworkId)
  if (!transcript || !fw) return res.status(400).json({ error: 'transcript and valid frameworkId required' })
  try {
    const data = await geminiJSON(PROMPT(transcript, fw), { temperature: 0.6 })
    // Normalize against the registry: every beat present, in order, valid verdicts.
    const byKey = (arr, key) => (arr || []).find((x) => x && (x.key === key || x.step === key))
    const steps = fw.steps.map((s) => {
      const got = byKey(data.steps, s.key) || {}
      const verdict = ['hit', 'partial', 'missed'].includes(got.verdict) ? got.verdict : 'partial'
      return { key: s.key, verdict, note: got.note || '' }
    })
    const retelling = fw.steps.map((s) => ({
      step: s.key,
      text: byKey(data.retelling, s.key)?.text || '',
    }))
    return res.status(200).json({
      steps,
      feedback_line: data.feedback_line || '',
      retelling,
      provider: 'gemini',
    })
  } catch (err) {
    console.error('[analyze-framework]', err)
    return res.status(502).json({ error: 'framework analysis failed' })
  }
}
