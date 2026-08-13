import { useState } from 'react'
import { useRecorder, fmtTime, MAX_SECONDS, WARN_SECONDS, MIN_SECONDS } from '../lib/useRecorder.js'

// Used for lab attempt 1, the lab retry (attempt 2), and the gym.
// In retry mode the screen is deliberately bare: prompt + record button only —
// no transcript, no feedback, no fix reminder (PRD §8.5).
// In gym mode a `scaffold` framework is passed and its beats stay visible —
// the gym is scaffolded practice, the lab tests internalization.
export function RecordScreen({ prompt, attemptNumber, onRecorded, onCancel, scaffold }) {
  const [tooShort, setTooShort] = useState(null) // {blob, seconds} when < MIN_SECONDS
  const rec = useRecorder({
    onStop: (blob, seconds) => {
      if (seconds < MIN_SECONDS) setTooShort({ blob, seconds })
      else onRecorded(blob, seconds)
    },
  })

  const isRetry = attemptNumber === 2

  if (tooShort) {
    return (
      <div className="screen record-screen">
        <div className="card center-card">
          <div className="big-emoji">⏱️</div>
          <h2>That was quick!</h2>
          <p className="muted">
            Stories need a little room to breathe — give it a full minute so the
            feedback has something real to work with.
          </p>
          <button className="btn btn-primary" onClick={() => { setTooShort(null); rec.cancel() }}>
            🎙️ Record again
          </button>
          <button className="link-btn" onClick={() => onRecorded(tooShort.blob, tooShort.seconds)}>
            Use this recording anyway
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen record-screen">
      {isRetry && !scaffold && <div className="retry-banner">Round 2 — same story, from memory 🧠</div>}
      <div className="prompt-pill">
        <span>{prompt.emoji}</span> {prompt.text}
      </div>

      {scaffold && (
        <div className="scaffold-strip" aria-label={`${scaffold.name} framework beats`}>
          {scaffold.steps.map((s, i) => (
            <span key={s.key} className="scaffold-step">
              <span className={`beat-badge beat-${i}`}>{s.label}</span>
              {i < scaffold.steps.length - 1 && <span className="scaffold-arrow" aria-hidden="true">→</span>}
            </span>
          ))}
        </div>
      )}

      {rec.status === 'denied' ? (
        <div className="card center-card">
          <div className="big-emoji">🎤🚫</div>
          <h2>Mic access is blocked</h2>
          <p className="muted">
            Click the mic icon in your browser’s address bar, allow access, then reload
            this page. Your audio never leaves this session.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      ) : rec.status === 'error' ? (
        <div className="card center-card">
          <div className="big-emoji">😵</div>
          <h2>Couldn’t start the mic</h2>
          <p className="muted">Check that another app isn’t using it, then try again.</p>
          <button className="btn btn-primary" onClick={rec.start}>Try again</button>
        </div>
      ) : rec.status === 'recording' ? (
        <div className="rec-live">
          <div className="rec-timer">{fmtTime(rec.elapsed)}</div>
          {rec.elapsed >= WARN_SECONDS && (
            <div className="rec-warn">⏳ Wrapping up? Hard stop at {fmtTime(MAX_SECONDS)}</div>
          )}
          <button className="record-btn recording" onClick={rec.stop} aria-label="Stop recording">
            <span className="stop-square" />
          </button>
          <p className="rec-hint">Tap to finish</p>
          <button className="link-btn" onClick={() => { rec.cancel(); }}>Restart</button>
        </div>
      ) : (
        <div className="rec-live">
          <button className="record-btn" onClick={rec.start} aria-label="Start recording">🎙️</button>
          <p className="rec-hint">
            {scaffold
              ? `Aim for 1–2 minutes. Ride the beats: ${scaffold.steps.map((s) => s.label).join(' → ')}.`
              : isRetry
                ? 'Take a breath — then tell it again, your way.'
                : 'Aim for 1–2 minutes. Beginning, trouble, ending.'}
          </p>
          <button className="link-btn" onClick={onCancel}>← Back</button>
        </div>
      )}
    </div>
  )
}
