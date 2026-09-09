// Tier A: deterministic, client-side filler detection. No LLM involved.
// Fixed list per PRD §8.3 — matched case-insensitively on word boundaries.
export const TIER_A_FILLERS = [
  'um', 'uh', 'er', 'ah', 'erm', 'hmm', 'mhmm',
  'you know', 'i mean', 'kind of', 'sort of', 'basically',
  'to be honest', 'at the end of the day',
]

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Longest-first so "at the end of the day" wins over any shorter overlap.
const TIER_A_PATTERN = new RegExp(
  '\\b(' +
    [...TIER_A_FILLERS]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join('|') +
    ')\\b',
  'gi',
)

// Tier A′: repetition loops. The same 1–4 word run repeated back-to-back at
// least once ("day and out, day and out, day and out", "the the", "so so so").
// One event spans the whole loop. Backreferences honour the `i` flag in JS,
// so "And we, and we" matches. Deterministic and cheap, like Tier A.
const REPETITION_PATTERN = /\b([a-z']+(?:\s+[a-z']+){0,3})(?:[\s,]+\1\b)+/gi

export function countWords(text) {
  return (text.trim().match(/\S+/g) || []).length
}

// Returns filler events: [{ token, start, end, tier, category }]
// A multi-word phrase counts as ONE event.
export function detectTierA(text) {
  const events = []
  let m
  TIER_A_PATTERN.lastIndex = 0
  while ((m = TIER_A_PATTERN.exec(text)) !== null) {
    events.push({
      token: m[1].toLowerCase(),
      start: m.index,
      end: m.index + m[1].length,
      tier: 'A',
      category: 'listed_filler',
    })
  }
  return events
}

export function detectRepetitions(text) {
  const events = []
  let m
  REPETITION_PATTERN.lastIndex = 0
  while ((m = REPETITION_PATTERN.exec(text)) !== null) {
    events.push({
      token: m[1].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
      tier: 'A',
      category: 'repetition',
    })
  }
  return events
}

// Everything deterministic in one pass. Repetition spans win on overlap: if
// someone says "um, um, um" the loop is the more useful thing to show than
// three separate "um"s.
export function detectDeterministic(text) {
  const reps = detectRepetitions(text)
  const inside = (ev) => reps.some((r) => ev.start >= r.start && ev.end <= r.end)
  const listed = detectTierA(text).filter((ev) => !inside(ev))
  return [...reps, ...listed].sort((a, b) => a.start - b.start)
}

// Merge deterministic + Tier B events. Tier B events arrive as { token, category, context }.
// We locate each Tier B token in the transcript (all word-boundary occurrences)
// and drop anything overlapping an existing deterministic span — Tier A always wins.
export function mergeEvents(text, tierAEvents, tierBEvents) {
  const merged = [...tierAEvents]
  const overlaps = (s, e) => merged.some((ev) => s < ev.end && e > ev.start)
  for (const b of tierBEvents || []) {
    if (!b || !b.token) continue
    const re = new RegExp('\\b' + escapeRegex(b.token) + '\\b', 'gi')
    let m
    while ((m = re.exec(text)) !== null) {
      const s = m.index
      const e = m.index + m[0].length
      if (!overlaps(s, e)) {
        merged.push({
          token: b.token.toLowerCase(),
          start: s,
          end: e,
          tier: 'B',
          category: b.category || 'contextual_filler',
        })
      }
    }
  }
  return merged.sort((a, b) => a.start - b.start)
}

// Filler EVENTS per 100 words (denominator = all transcribed words).
export function fillerRate(eventCount, wordCount) {
  if (!wordCount) return 0
  return Math.round((eventCount / wordCount) * 100 * 10) / 10
}

// Words per minute from a word count and a duration in seconds.
export function wordsPerMinute(wordCount, seconds) {
  if (!seconds || seconds <= 0) return null
  return Math.round(wordCount / (seconds / 60))
}

// "Your tell": the one filler you lean on. Only reported when it's genuinely
// dominant — ≥3 uses AND ≥30% of all events — so the app never invents a
// pattern out of a spread of one-offs.
export function topFiller(events) {
  if (!events?.length) return null
  const counts = new Map()
  for (const ev of events) counts.set(ev.token, (counts.get(ev.token) || 0) + 1)
  let best = null
  for (const [token, count] of counts) if (!best || count > best.count) best = { token, count }
  const share = best.count / events.length
  if (best.count < 3 || share < 0.3) return null
  return { ...best, total: events.length, share: Math.round(share * 100) }
}

// Split transcript into segments for highlighting: [{ text, filler, tier, category }]
export function segmentTranscript(text, events) {
  const segs = []
  let cursor = 0
  for (const ev of events) {
    if (ev.start < cursor) continue // defensive: skip anything overlapping a prior span
    if (ev.start > cursor) segs.push({ text: text.slice(cursor, ev.start), filler: false })
    segs.push({ text: text.slice(ev.start, ev.end), filler: true, tier: ev.tier, category: ev.category })
    cursor = ev.end
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), filler: false })
  return segs
}
