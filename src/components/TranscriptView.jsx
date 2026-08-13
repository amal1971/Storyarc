import { segmentTranscript } from '../lib/fillers.js'

export function TranscriptView({ text, events }) {
  const segs = segmentTranscript(text, events)
  return (
    <p className="transcript">
      {segs.map((s, i) =>
        s.filler ? (
          <mark key={i} className={`filler filler-${s.tier?.toLowerCase() || 'a'}`}>{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}
