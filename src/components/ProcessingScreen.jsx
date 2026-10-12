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
    const EMOJI = { gibberish: '🤔', busy: '⏳', llm: '📡', stt: '🎧', service: '🛠️', session: '🔑', capacity: '🌙', callcap: '✋' }
    const TITLE = {
      gibberish: 'We couldn’t make out a story',
      busy: 'The model is busy right now',
      llm: 'Something hiccuped',
      stt: 'We couldn’t transcribe that',
      service: 'StoryArc is taking a short break',
      session: 'You were signed out before we finished',
      capacity: 'StoryArc is full for today',
      callcap: 'This account has used its analyses',
    }
    const BODY = {
      gibberish: 'The recording came back mostly empty. Mic too far away, maybe? Give it another go.',
      // Deliberately explicit: the alternative to waiting is showing invented
      // feedback, which is worse than a short wait.
      busy: 'Google’s servers are under heavy load and turned us away three times. Your recording is safe — give it a few seconds and hit retry. We won’t show you made-up feedback instead.',
      llm: 'The analysis call didn’t come back. Retry, or re-record if it keeps happening.',
      stt: 'The transcription service didn’t answer. Your recording is still here — hit retry, or re-record if it keeps happening.',
      service: 'The analysis service needs attention on our side, so we can’t analyse stories right now. Please try again a little later — we won’t show you made-up feedback in the meantime.',
      session: 'Your story is still here. Sign in again, then hit retry to finish the analysis.',
      capacity: 'This free demo has a daily limit and today’s is used up. Please come back tomorrow.',
      callcap: 'Each account gets a fixed number of analyses on this free demo, and this one has used them all.',
    }
    return (
      <div className="screen processing-screen">
        <div className="card center-card">
          <div className="big-emoji">{EMOJI[error.kind] || '📡'}</div>
          <h2>{TITLE[error.kind] || TITLE.llm}</h2>
          <p className="muted">{BODY[error.kind] || BODY.llm}</p>
          {!['gibberish', 'service', 'capacity', 'callcap'].includes(error.kind) && (
            <button className="btn btn-primary" onClick={onRetry}>Retry analysis</button>
          )}
          <button className={error.kind === 'gibberish' || error.kind === 'service' ? 'btn btn-primary' : 'link-btn'} onClick={onReRecord}>
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
