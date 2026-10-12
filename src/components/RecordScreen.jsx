import { useEffect, useMemo, useState } from 'react'
import { useRecorder, fmtTime, MAX_SECONDS, WARN_SECONDS, MIN_SECONDS } from '../lib/useRecorder.js'
import { countWords } from '../lib/fillers.js'
import { sampleFor, loadSampleBlob } from '../lib/samples.js'

const MIN_TYPED_WORDS = 40
// About a three-minute telling — the same ceiling as the recording hard stop.
// The server enforces a matching limit, so this is a courtesy, not the guard.
const MAX_TYPED_WORDS = 600
const MAX_TYPED_CHARS = 6000 // matches the server limit (api/_limits.js)

// Used for lab attempt 1, the lab retry (attempt 2), and both gym rounds.
// In retry mode the screen is deliberately bare: prompt + record button only —
// no transcript, no feedback, no fix reminder (PRD §8.5).
// In gym mode a `scaffold` framework is passed and its beats stay visible —
// the gym is scaffolded practice, the lab tests internalization.
//
// Three ways in, one callback out:
//   onSubmit({ blob, seconds, inputMode: 'mic' })
//   onSubmit({ blob, seconds, inputMode: 'sample', sampleId })
//   onSubmit({ text, inputMode: 'text' })
// Everything downstream consumes only the transcript text, so the typed path
// simply skips speech-to-text.
export function RecordScreen({ prompt, attemptNumber, onSubmit, onCancel, scaffold }) {
  const [tooShort, setTooShort] = useState(null) // {blob, seconds} when < MIN_SECONDS
  const [showText, setShowText] = useState(false)
  const [typed, setTyped] = useState('')
  const [loadingSample, setLoadingSample] = useState(false)
  const rec = useRecorder({
    onStop: (blob, seconds) => {
      if (seconds < MIN_SECONDS) setTooShort({ blob, seconds })
      else onSubmit({ blob, seconds, inputMode: 'mic' })
    },
  })

  const isRetry = attemptNumber === 2
  const sample = sampleFor({ attemptNumber, gym: !!scaffold })
  const typedWords = countWords(typed)
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // Space starts/stops recording — unless focus is on something Space already
  // means something for (typing, or a focused button/link/select).
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || ['TEXTAREA', 'INPUT', 'BUTTON', 'A', 'SELECT'].includes(e.target.tagName)) return
      if (rec.status === 'recording') { e.preventDefault(); rec.stop() }
      else if (rec.status === 'idle' && !showText) { e.preventDefault(); rec.start() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rec.status, showText]) // eslint-disable-line react-hooks/exhaustive-deps

  const runSample = async () => {
    setLoadingSample(true)
    try {
      const blob = await loadSampleBlob(sample)
      onSubmit({ blob, seconds: sample.seconds, inputMode: 'sample', sampleId: sample.id })
    } catch (err) {
      console.warn('[sample]', err.message)
      setLoadingSample(false)
    }
  }

  const submitTyped = () => {
    if (typedWords < MIN_TYPED_WORDS || typedWords > MAX_TYPED_WORDS || typed.length > MAX_TYPED_CHARS) return
    onSubmit({ text: typed.trim(), inputMode: 'text' })
  }

  const altInput = (
    <div className="alt-input">
      {showText ? (
        <>
          <textarea
            className="text-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={isRetry ? 'Tell it again, from memory, in your own words…' : 'Type your story here — a few sentences is plenty.'}
            aria-label="Type your story"
            autoFocus
          />
          <div className="text-meta">
            <span>
              {typedWords} words
              {typedWords < MIN_TYPED_WORDS
                ? ` · ${MIN_TYPED_WORDS - typedWords} more to analyze`
                : typedWords > MAX_TYPED_WORDS || typed.length > MAX_TYPED_CHARS
                  ? ` · over the ${MAX_TYPED_WORDS}-word limit — trim it to about three minutes of talking`
                  : ' · ready'}
            </span>
            <button className="link-btn" onClick={() => setShowText(false)}>Use the mic instead</button>
          </div>
          <button className="btn btn-primary" onClick={submitTyped} disabled={typedWords < MIN_TYPED_WORDS || typedWords > MAX_TYPED_WORDS || typed.length > MAX_TYPED_CHARS}>
            ✨ Analyze what I typed
          </button>
        </>
      ) : (
        <p className="alt-toggle">
          No mic handy? <button className="link-btn" onClick={() => setShowText(true)}>Type it instead</button>
          {' · '}
          <button className="link-btn" onClick={runSample} disabled={loadingSample}>
            {loadingSample ? 'Loading…' : `▶ Run a sample recording`}
          </button>
        </p>
      )}
    </div>
  )

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
          <button className="link-btn" onClick={() => onSubmit({ blob: tooShort.blob, seconds: tooShort.seconds, inputMode: 'mic' })}>
            Use this recording anyway
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen record-screen">
      {isRetry && !scaffold && <div className="retry-banner">Round 2 — same story, from memory 🧠</div>}
      {isRetry && scaffold && <div className="retry-banner">Round 2 — same prompt, shape fresh in mind 🧠</div>}
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
        <>
          <div className="card center-card">
            <div className="big-emoji">🎤🚫</div>
            <h2>Mic access is blocked</h2>
            <p className="muted">
              Allow the microphone in your browser’s address bar and try again — or skip the mic entirely below.
            </p>
            <button className="btn btn-primary" onClick={rec.start}>Try the mic again</button>
            <button className="link-btn" onClick={() => window.location.reload()}>Reload the page</button>
          </div>
          {altInput}
        </>
      ) : rec.status === 'error' ? (
        <>
          <div className="card center-card">
            <div className="big-emoji">😵</div>
            <h2>Couldn’t start the mic</h2>
            <p className="muted">Check that another app isn’t using it, then try again.</p>
            <button className="btn btn-primary" onClick={rec.start}>Try again</button>
          </div>
          {altInput}
        </>
      ) : rec.status === 'recording' ? (
        <div className="rec-live">
          <div className="rec-timer">{fmtTime(rec.elapsed)}</div>
          {reduceMotion ? (
            <p className="level-hint" aria-live="polite">
              Mic level: {'●'.repeat(Math.round(Math.max(...rec.bands) * 5))}{'○'.repeat(5 - Math.round(Math.max(...rec.bands) * 5))}
            </p>
          ) : (
            <div className="level-meter" aria-hidden="true">
              {rec.bands.map((v, i) => (
                <span key={i} className="level-bar" style={{ transform: `scaleY(${Math.max(4 / 56, v).toFixed(3)})` }} />
              ))}
            </div>
          )}
          {rec.elapsed >= WARN_SECONDS && (
            <div className="rec-warn">⏳ Wrapping up? Hard stop at {fmtTime(MAX_SECONDS)}</div>
          )}
          <button className="record-btn recording" onClick={rec.stop} aria-label="Stop recording">
            <span className="stop-square" />
          </button>
          <p className="rec-hint">Tap to finish · or press Space</p>
          <button className="link-btn" onClick={() => { rec.cancel(); }}>Restart</button>
        </div>
      ) : (
        <div className="rec-live">
          {!showText && (
            <>
              <button className="record-btn" onClick={rec.start} disabled={rec.status === 'requesting'} aria-label="Start recording">🎙️</button>
              <p className="rec-hint">
                {scaffold
                  ? `Aim for 1–2 minutes. Ride the beats: ${scaffold.steps.map((s) => s.label).join(' → ')}.`
                  : isRetry
                    ? 'Take a breath — then tell it again, your way.'
                    : 'Aim for 1–2 minutes. Beginning, trouble, ending.'}
              </p>
            </>
          )}
          {altInput}
          <button className="link-btn" onClick={onCancel}>← Back</button>
        </div>
      )}
    </div>
  )
}
