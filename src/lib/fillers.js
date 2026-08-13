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

// Merge Tier A + Tier B events. Tier B events arrive as { token, category, context }.
// We locate each Tier B token in the transcript (all word-boundary occurrences)
// and drop anything overlapping an existing Tier A span.
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

// Split transcript into segments for highlighting: [{ text, filler: bool, tier }]
export function segmentTranscript(text, events) {
  const segs = []
  let cursor = 0
  for (const ev of events) {
    if (ev.start > cursor) segs.push({ text: text.slice(cursor, ev.start), filler: false })
    segs.push({ text: text.slice(ev.start, ev.end), filler: true, tier: ev.tier })
    cursor = ev.end
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor), filler: false })
  return segs
}
