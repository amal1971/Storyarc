import { TranscriptView } from './TranscriptView.jsx'

// Attempt-1 feedback. Clarity first, craft second, clearly separated.
// NO numbers-as-grades, NO element labels/checklists, ONE fix max (PRD §13.4).
export function FeedbackScreen({ prompt, analysis, onRetry, onStartOver }) {
  const { transcript, events, fillerRateValue, eventCount, structure } = analysis

  // Any section that silently degraded to mock data gets flagged here —
  // otherwise a live-API user has no way to know they just got sample
  // feedback instead of a real analysis of their own voice.
  const mockBits = []
  if (analysis.sttProvider === 'mock') mockBits.push('transcription')
  if (analysis.fillerProvider === 'mock') mockBits.push('filler detection')
  if (structure?.provider === 'mock') mockBits.push('story analysis')

  // Point the retry at whichever lane needs it most, rather than leaving
  // "tell it again" as an undifferentiated do-better-overall nudge.
  // Structure gaps take priority — a missing element is a bigger story
  // problem than an elevated filler rate.
  const structureWeak = structure.element_count < 3
  const clarityWeak = !structureWeak && fillerRateValue > 8
  const focus = structureWeak ? 'craft' : clarityWeak ? 'clarity' : null

  return (
    <div className="screen feedback-screen">
      <div className="prompt-pill small">
        <span>{prompt.emoji}</span> {prompt.text}
      </div>
      <h2 className="screen-title">Here’s what we heard 👂</h2>
      {mockBits.length > 0 && (
        <div className="mock-note">🧪 Sample data used for: {mockBits.join(', ')}</div>
      )}

      <div className="card feedback-card">
        <div className="section-tag tag-coral">Clarity — filler words</div>
        {focus === 'clarity' && <div className="focus-badge">🎯 Focus here on round 2</div>}
        <TranscriptView text={transcript} events={events} />
        <p className="metric-line">
          {eventCount === 0 ? (
            <>Zero fillers. Seriously clean. 🧼</>
          ) : (
            <>
              <strong>{eventCount} filler{eventCount === 1 ? '' : 's'}</strong> —{' '}
              <strong>{fillerRateValue} per 100 words</strong>. Just notice them; that’s the whole trick.
            </>
          )}
        </p>
      </div>

      <div className="card feedback-card">
        <div className="section-tag tag-violet">Craft — story shape</div>
        {focus === 'craft' && <div className="focus-badge">🎯 Focus here on round 2</div>}
        <p className="feedback-line">“{structure.feedback_line}”</p>
        {structure.evidence && (
          <blockquote className="evidence">“{structure.evidence}”</blockquote>
        )}
        <div className="fix-chip">💡 {structure.suggested_fix}</div>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary btn-big" onClick={onRetry}>
          🔁 Tell it again
        </button>
        <button className="link-btn" onClick={onStartOver}>Start over with a new story</button>
      </div>
      <p className="nudge">Same story, from memory — this is where the magic happens.</p>
    </div>
  )
}
