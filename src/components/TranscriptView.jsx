import { segmentTranscript } from '../lib/fillers.js'

// Repetition loops get their own colour so a three-times-repeated phrase reads
// differently from a discrete "um" — it's a different habit.
function fillerClass(seg) {
  if (seg.category === 'repetition') return 'filler filler-rep'
  return `filler filler-${seg.tier?.toLowerCase() || 'a'}`
}

export function TranscriptView({ text, events }) {
  const segs = segmentTranscript(text, events)
  return (
    <p className="transcript">
      {segs.map((s, i) =>
        s.filler ? (
          <mark key={i} className={fillerClass(s)} title={s.category === 'repetition' ? 'Repeated phrase' : undefined}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}
