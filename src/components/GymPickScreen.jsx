import { useState } from 'react'
import { FRAMEWORKS, randomSituation } from '../lib/frameworks.js'

export function GymPickScreen({ onStart, onBack, initialFramework, initialSituation }) {
  const [framework, setFramework] = useState(initialFramework || FRAMEWORKS[0])
  const [situation, setSituation] = useState(initialSituation || randomSituation())

  return (
    <div className="screen">
      <h2 className="screen-title">Framework Gym 🏋️</h2>
      <p className="screen-sub">
        Pick a framework, get a situation — answer it out loud <em>using the framework</em>.
      </p>

      <div className="fw-grid">
        {FRAMEWORKS.map((f) => (
          <button
            key={f.id}
            className={`fw-card ${framework.id === f.id ? 'fw-selected' : ''}`}
            onClick={() => setFramework(f)}
            aria-pressed={framework.id === f.id}
          >
            <span className="fw-emoji">{f.emoji}</span>
            <span className="fw-name">{f.name}</span>
            <span className="fw-full">{f.fullName}</span>
            <span className="fw-tagline">{f.tagline}</span>
          </button>
        ))}
      </div>
      <p className="fw-soon-note">🌱 Hero’s Journey and the Pixar pitch are coming next.</p>

      <div className="card fw-detail">
        <div className="fw-detail-head">
          <span className="fw-detail-emoji">{framework.emoji}</span>
          <div>
            <h3 className="fw-detail-title">{framework.fullName}</h3>
            <p className="fw-detail-tagline">{framework.tagline}</p>
          </div>
        </div>
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

      <div className="card situation-card">
        <div className="situation-head">
          <span className="section-tag tag-coral">🎯 Your situation — say it out loud</span>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setSituation(randomSituation(situation.id))}
          >
            🎲 Shuffle
          </button>
        </div>
        <p className="situation-text">
          <span className="situation-emoji">{situation.emoji}</span> {situation.text}
        </p>
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
