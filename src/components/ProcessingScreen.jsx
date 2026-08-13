import { useEffect, useState } from 'react'

const LAB_STEPS = [
  '🎧 Turning your voice into words…',
  '🔍 Listening for filler words…',
  '📖 Checking the shape of your story…',
]

const GYM_STEPS = [
  '🎧 Turning your voice into words…',
  '🥁 Checking how your beats landed…',
  '✍️ Retelling your story through the framework…',
]

// Honest wait state — real status lines, no fake progress theater (PRD §13.3).
export function ProcessingScreen({ error, onRetry, onReRecord, variant = 'lab' }) {
  const STEPS = variant === 'gym' ? GYM_STEPS : LAB_STEPS
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (error) return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600)
    return () => clearInterval(t)
  }, [error, STEPS.length])

  if (error) {
    return (
      <div className="screen processing-screen">
        <div className="card center-card">
          <div className="big-emoji">{error.kind === 'gibberish' ? '🤔' : '📡'}</div>
          <h2>{error.kind === 'gibberish' ? 'We couldn’t make out a story' : 'Something hiccuped'}</h2>
          <p className="muted">
            {error.kind === 'gibberish'
              ? 'The recording came back mostly empty. Mic too far away, maybe? Give it another go.'
              : 'The analysis call didn’t come back. Retry, or re-record if it keeps happening.'}
          </p>
          {error.kind !== 'gibberish' && (
            <button className="btn btn-primary" onClick={onRetry}>Retry analysis</button>
          )}
          <button className={error.kind === 'gibberish' ? 'btn btn-primary' : 'link-btn'} onClick={onReRecord}>
            🎙️ Re-record
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen processing-screen">
      <div className="loader-orb" />
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
            {i < step ? '✓ ' : ''}{s}
          </div>
        ))}
      </div>
    </div>
  )
}
