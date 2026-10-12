import { useEffect, useState } from 'react'
import { FRAMEWORKS, randomSituation } from '../lib/frameworks.js'

// Ordered by what the speaker needs to know, not by what the app knows:
//   1. What am I being asked to talk about?   <- the prompt, loudest thing here
//   2. What shape should I use?               <- the framework choice
//   3. Go.
// Previously the situation sat fifth, below a large framework card, styled the
// same as everything else — so the one thing you actually have to answer was
// the hardest thing to find.
export function GymPickScreen({ onStart, onBack, initialFramework, initialSituation, onDraftChange }) {
  const [framework, setFramework] = useState(initialFramework || FRAMEWORKS[0])
  const [situation, setSituation] = useState(initialSituation || randomSituation())
  // Report the current choice up, so a trip to History or "How it's built"
  // comes back to the same prompt instead of a freshly shuffled one.
  useEffect(() => { onDraftChange?.(framework, situation) }, [framework, situation]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen gym-pick">
      <h2 className="screen-title">Story Gym 🏋️</h2>
      <p className="screen-sub">
        Answer a real-world prompt out loud, using a storytelling shape. Then hear your own story retold in it.
      </p>

      {/* STEP 1 — the prompt. Content, not a control: no shadow, no button
          affordance, largest type on the screen. */}
      <section className="gym-step" aria-labelledby="step-situation">
        <h3 className="gym-step-label" id="step-situation">
          <span className="gym-step-num">1</span> Your prompt
          <span className="gym-step-hint">this is what you’ll be talking about</span>
        </h3>
        <div className="situation-panel">
          <p className="situation-quote">
            <span className="situation-emoji" aria-hidden="true">{situation.emoji}</span>
            <span>{situation.text}</span>
          </p>
          <button
            className="link-btn situation-shuffle"
            onClick={() => setSituation(randomSituation(situation.id))}
          >
            🎲 Give me a different prompt
          </button>
        </div>
      </section>

      {/* STEP 2 — the choice. These are the only things on the screen that
          should read as selectable. */}
      <section className="gym-step" aria-labelledby="step-framework">
        <h3 className="gym-step-label" id="step-framework">
          <span className="gym-step-num">2</span> Pick a shape to tell it in
          <span className="gym-step-hint">tap one</span>
        </h3>
        <div className="fw-grid" role="radiogroup" aria-label="Storytelling framework">
          {FRAMEWORKS.map((f) => (
            <button
              key={f.id}
              className={`fw-card ${framework.id === f.id ? 'fw-selected' : ''}`}
              onClick={() => setFramework(f)}
              role="radio"
              aria-checked={framework.id === f.id}
            >
              <span className="fw-check" aria-hidden="true">{framework.id === f.id ? '✓' : ''}</span>
              <span className="fw-emoji">{f.emoji}</span>
              <span className="fw-name">{f.name}</span>
              <span className="fw-full">{f.fullName}</span>
              <span className="fw-tagline">{f.tagline}</span>
            </button>
          ))}
        </div>
        <p className="fw-soon-note">🌱 Hero’s Journey and the Pixar pitch are coming next.</p>
      </section>

      {/* Reference material for the chosen shape. Deliberately quiet: it is
          there to glance at, not to click. */}
      <div className="fw-detail fw-detail--quiet">
        <p className="fw-detail-lead">
          Telling it as <strong>{framework.fullName}</strong> means hitting these in order:
        </p>
        <div className="fw-beat-flow">
          {framework.steps.map((s, i) => (
            <div className="fw-beat" key={s.key}>
              <div className="fw-beat-top">
                <span className="fw-beat-num">{i + 1}</span>
                <span className={`beat-badge beat-${i}`}>{s.label}</span>
              </div>
              <p className="fw-beat-hint">{s.hint}</p>
              {i < framework.steps.length - 1 && (
                <span className="fw-beat-arrow" aria-hidden="true">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary btn-big" onClick={() => onStart(framework, situation)}>
          🎙️ Take the mic
        </button>
        <button className="link-btn" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}
