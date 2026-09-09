// LLM analysis layer: Gemini Call 1 (Tier-B fillers) + Call 2 (structure),
// proxied through serverless functions so keys never touch the browser.
// Falls back to deterministic mocks so the whole loop works with zero APIs.

// --- Anti-fabrication guardrail (PRD §9): every evidence field must be a
// verbatim substring (≤ 12 words) of the transcript, verified in code.
export function evidenceIsValid(transcript, evidence) {
  if (!evidence) return false
  const words = (evidence.trim().match(/\S+/g) || []).length
  return words > 0 && words <= 12 && transcript.includes(evidence)
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json()
}

// ---------- Call 1: Tier-B filler adjudication ----------

// Mock Tier B: flags discourse "like" and hedging "pretty" style softeners the
// Tier-A list can't see. Deterministic — good enough to build every screen.
function mockTierB(transcript) {
  const events = []
  const likeRe = /,\s*(like)\s*,/gi // ", like," — classic discourse filler shape
  let m
  while ((m = likeRe.exec(transcript)) !== null) {
    events.push({ token: 'like', category: 'discourse_filler', context: m[0] })
    break // token-level dedupe happens downstream; one entry is enough
  }
  if (/\byeah\b/i.test(transcript)) {
    events.push({ token: 'yeah', category: 'discourse_filler', context: 'yeah' })
  }
  return { events, provider: 'mock' }
}

export async function analyzeFillers(transcript) {
  try {
    const data = await postJSON('/api/analyze-fillers', { transcript })
    if (!Array.isArray(data.events)) throw new Error('bad payload')
    return data
  } catch (err) {
    console.warn('[analyze-fillers] falling back to mock:', err.message)
    return mockTierB(transcript)
  }
}

// ---------- Call 2: structure (SCR rubric, ABT-style language) ----------

function mockStructure(transcript) {
  const t = transcript.toLowerCase()
  // Crude deterministic heuristics — placeholder until Gemini is wired in.
  const situation = /\b(last (month|week|year|spring)|when i|one (day|time)|i was)\b/.test(t)
  const complication = /\b(but|broken|died|problem|panick|realized|nothing|stuck|failed|wrong)\b/.test(t)
  const outcome = /\b(so smoothly|in the end|closed|we shipped|now i|ever since|learned|kept that|it worked)\b/.test(t)
  const count = [situation, complication, outcome].filter(Boolean).length

  let flagged = null
  if (!situation) flagged = 'situation'
  else if (!complication) flagged = 'complication'
  else if (!outcome) flagged = 'outcome'

  const feedbackLine = outcome
    ? 'You set the scene, hit a real snag, and told us how it ended — the story closes the loop, and that ending is what makes it stick.'
    : 'You pulled us into the moment and the trouble feels real — but the story stops mid-scramble, so we never learn how it turned out for you.'

  const suggestedFix = outcome
    ? 'Tighten the opening to one line so the trouble arrives sooner.'
    : 'Give it an ending in one sentence: what finally happened, and what changed because of it?'

  return {
    situation_present: situation,
    complication_present: complication,
    outcome_present: outcome,
    element_count: count,
    flagged_element: flagged,
    outcome_connected: outcome,
    feedback_line: feedbackLine,
    suggested_fix: suggestedFix,
    evidence: null,
    provider: 'mock',
  }
}

// ---------- Framework gym: beat verdicts + retelling ----------

const BEAT_CHECKS = {
  setup: /\b(last (month|week|year|spring|quarter)|i was|we (had|were)|every (week|quarter|morning)|one (day|time)|when i)\b/i,
  turn: /\b(but|until|broken|died|problem|panick|realized|nothing|stuck|failed|wrong|suddenly)\b/i,
  landing: /\b(therefore|in the end|now i|closed|smoothly|ever since|learned|we shipped|it worked)\b/i,
}

const BEAT_KIND = {
  and: 'setup', situation: 'setup',
  but: 'turn', complication: 'turn', task: 'setup', action: 'turn',
  therefore: 'landing', resolution: 'landing', outcome: 'landing', result: 'landing',
}

const MOCK_NOTES = {
  setup: {
    hit: 'You grounded us fast — we know where we are before anything moves.',
    partial: 'There’s a scene here, but it takes a while to come into focus.',
    missed: 'We drop into the action without knowing where we’re standing.',
  },
  turn: {
    hit: 'The turn is sharp and specific — the listener feels the ground shift.',
    partial: 'Something goes wrong, but it arrives as a pile rather than one clean break.',
    missed: 'Events chain along without a real turn — nothing forces a decision.',
  },
  landing: {
    hit: 'The ending follows from the trouble and lands somewhere definite.',
    partial: 'There’s an ending, but it doesn’t quite answer the trouble you set up.',
    missed: 'The story stops mid-scramble — we never learn how it resolved.',
  },
}

function splitIntoBeats(transcript, n) {
  const sents = transcript.match(/[^.!?]+[.!?]+/g) || [transcript]
  const per = Math.max(1, Math.ceil(sents.length / n))
  return Array.from({ length: n }, (_, i) =>
    sents.slice(i * per, (i + 1) * per).join(' ').trim(),
  )
}

// Canned high-quality retelling for the built-in mock story, so the demo
// shows what a real Gemini retelling looks like.
const CANNED_RETELLING = {
  setup: 'Every big renewal comes down to one demo, and last month ours was set for nine in the morning with our biggest client — the account team had already flown in.',
  turn: 'But the night before, staging died completely: white screen, nothing loading, no error to chase.',
  landing: 'Therefore I rebuilt the seed data overnight and ran the whole demo from my laptop. It went so smoothly the client never knew — and we closed the renewal two weeks later.',
}

function mockFramework(transcript, framework) {
  const steps = framework.steps.map((s) => {
    const kind = BEAT_KIND[s.key] || 'setup'
    const hit = BEAT_CHECKS[kind].test(transcript)
    // Landing check is stricter: "so" alone reads as partial.
    const verdict = hit ? 'hit' : kind === 'landing' && /\bso\b/i.test(transcript) ? 'partial' : 'missed'
    return { key: s.key, verdict, note: MOCK_NOTES[kind][verdict] }
  })
  const missed = steps.filter((s) => s.verdict !== 'hit').length
  const feedback_line =
    missed === 0
      ? `That’s the ${framework.name} shape working — every beat pulls its weight, and the story moves like it knows where it’s going.`
      : missed === 1
        ? `Two beats land cleanly — one more turn of the screw and the ${framework.name} spine clicks into place.`
        : `The raw material is all here — it just isn’t sorted into beats yet, which is exactly what this drill is for.`

  // Canned retelling is written for a 3-beat shape; 4-beat frameworks (STAR) split instead.
  const isMockStory = /biggest client/i.test(transcript) && framework.steps.length === 3
  const parts = isMockStory ? null : splitIntoBeats(transcript, framework.steps.length)
  const retelling = framework.steps.map((s, i) => ({
    step: s.key,
    text: isMockStory ? CANNED_RETELLING[BEAT_KIND[s.key] || 'setup'] : parts[i] || '',
  }))

  return { steps, feedback_line, retelling, provider: 'mock' }
}

export async function analyzeFramework(transcript, frameworkId) {
  try {
    const data = await postJSON('/api/analyze-framework', { transcript, frameworkId })
    if (!Array.isArray(data.steps) || !Array.isArray(data.retelling)) throw new Error('bad payload')
    return data
  } catch (err) {
    console.warn('[analyze-framework] falling back to mock:', err.message)
    const { getFramework } = await import('./frameworks.js')
    return mockFramework(transcript, getFramework(frameworkId))
  }
}

// ---------- Cross-attempt comparison (closes the loop) ----------

// The mock is deliberately honest about being a mock: a fabricated "here's what
// changed" would be worse than no comparison at all, since the whole point of
// this call is telling the speaker the truth about their own two tellings.
function mockComparison() {
  return {
    fix_addressed: 'partly',
    fix_note: 'This comparison needs a live model to read both tellings together.',
    headline: 'Round two, done',
    what_changed:
      'Both tellings were recorded and analyzed on their own, but reading them side by side takes a live analysis key.',
    keep_this: 'You told it twice from memory — that is the rep that actually builds the skill.',
    next_edge: 'Add a Gemini key to see exactly what shifted between your two tellings.',
    provider: 'mock',
  }
}

export async function compareAttempts(payload) {
  try {
    const data = await postJSON('/api/compare-attempts', payload)
    if (!data || typeof data.what_changed !== 'string') throw new Error('bad payload')
    return data
  } catch (err) {
    console.warn('[compare-attempts] falling back to mock:', err.message)
    return mockComparison()
  }
}

// ---------- Backend status (drives the live/demo chip) ----------

export async function fetchHealth() {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } catch {
    return { gemini: false, stt: 'mock', reachable: false }
  }
}

export async function analyzeStructure(transcript) {
  let data
  try {
    data = await postJSON('/api/analyze-structure', { transcript })
  } catch (err) {
    console.warn('[analyze-structure] falling back to mock:', err.message)
    return mockStructure(transcript)
  }
  // Guardrail: reject non-substring evidence (one retry happens server-side;
  // here we just degrade gracefully by dropping the quote).
  if (data.evidence && !evidenceIsValid(transcript, data.evidence)) {
    data = { ...data, evidence: null, evidence_rejected: true }
  }
  return data
}
