import { useEffect, useState } from 'react'
import { SAMPLE } from '../lib/prompts.js'
import { TranscriptView } from './TranscriptView.jsx'
import { detectTierA } from '../lib/fillers.js'
import { fetchHealth } from '../lib/analyze.js'
import { GYM_SAMPLE, getFramework, SITUATIONS } from '../lib/frameworks.js'

const VERDICT_META = {
  hit: { label: 'Landed', emoji: '🎯' },
  partial: { label: 'Almost', emoji: '🌗' },
  missed: { label: 'Missing', emoji: '🫥' },
}

export function StartScreen({ onLab, onGym }) {
  const [showSample, setShowSample] = useState(false)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetchHealth().then(setHealth)
  }, [])

  return (
    <div className="screen start-screen">
      <div className="hero">
        <div className="hero-badge">Record · Reflect · Retell</div>
        <h1 className="hero-title">
          Your story deserves to <span className="grad-text">land.</span>
          <span className="hero-title-sub">Analyse what’s getting in the way.</span>
        </h1>
        <p className="hero-sub">
          Record a short story out loud. StoryArc shows the filler words and missing beats
          between you and a story that sticks — then you retell it and watch the difference.
        </p>
        {health && <StatusChip health={health} />}
      </div>

      <div className="mode-grid">
        <button className="mode-card mode-card--lab" onClick={onLab}>
          <span className="mode-emoji">🔬</span>
          <span className="mode-name">Story Lab</span>
          <span className="mode-desc">
            Tell your story, get feedback on how you speak and how it’s built — then tell it
            again and see what shifted.
          </span>
          <span className="mode-cta">Enter the lab →</span>
        </button>

        <button className="mode-card mode-card--gym" onClick={onGym}>
          <span className="mode-badge">New</span>
          <span className="mode-emoji">🏋️</span>
          <span className="mode-name">Story Gym</span>
          <span className="mode-desc">
            Get a situation, answer it using a storytelling framework — then hear your own
            story retold through it, beat by beat.
          </span>
          <span className="mode-cta">Pick a framework →</span>
        </button>
      </div>

      <button className="link-btn" onClick={() => setShowSample(true)}>
        👀 Curious what feedback looks like? Peek at a sample
      </button>

      {showSample && <SampleModal onClose={() => setShowSample(false)} />}
    </div>
  )
}

function StatusChip({ health }) {
  if (!health.reachable || !health.gemini) {
    return (
      <div className="status-chip status-demo" title="Add API keys to go live — see README">
        🧪 Demo mode — sample data, no keys needed
      </div>
    )
  }
  return (
    <div className="status-chip status-live">
      ⚡ Live analysis{health.stt === 'mock' ? ' · transcription: sample' : ` · ${health.stt}`}
    </div>
  )
}

function SampleModal({ onClose }) {
  const [tab, setTab] = useState('lab')
  const events = detectTierA(SAMPLE.transcript)
  const framework = getFramework(GYM_SAMPLE.frameworkId)
  const situation = SITUATIONS.find((s) => s.id === GYM_SAMPLE.situationId)
  const stepMeta = Object.fromEntries(framework.steps.map((s, i) => [s.key, { ...s, index: i }]))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{tab === 'lab' ? SAMPLE.title : `Sample: ${situation.text}`}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="sample-tabs">
          <button
            className={`sample-tab ${tab === 'lab' ? 'sample-tab--active' : ''}`}
            onClick={() => setTab('lab')}
          >
            🔬 Story Lab
          </button>
          <button
            className={`sample-tab ${tab === 'gym' ? 'sample-tab--active' : ''}`}
            onClick={() => setTab('gym')}
          >
            🏋️ Story Gym
          </button>
        </div>

        {tab === 'lab' ? (
          <>
            <div className="section-tag tag-coral">Clarity — filler words</div>
            <TranscriptView text={SAMPLE.transcript} events={events} />
            <p className="metric-line">
              <strong>{SAMPLE.fillerEvents} fillers</strong> in {SAMPLE.wordCount} words —{' '}
              <strong>{SAMPLE.fillerRate} per 100 words</strong>
            </p>
            <div className="section-tag tag-violet">Craft — story shape</div>
            <p className="feedback-line">“{SAMPLE.feedbackLine}”</p>
            <div className="fix-chip">💡 {SAMPLE.suggestedFix}</div>
          </>
        ) : (
          <>
            <div className="section-tag tag-violet">{framework.name} — beat by beat</div>
            <div className="beat-verdicts">
              {GYM_SAMPLE.steps.map((s) => {
                const meta = stepMeta[s.key]
                const v = VERDICT_META[s.verdict] || VERDICT_META.partial
                return (
                  <div key={s.key} className="beat-verdict">
                    <div className="beat-verdict-head">
                      <span className={`beat-badge beat-${meta?.index ?? 0}`}>{meta?.label || s.key}</span>
                      <span className="verdict-label">{v.emoji} {v.label}</span>
                    </div>
                    <p className="beat-note">{s.note}</p>
                  </div>
                )
              })}
            </div>
            <p className="feedback-line gym-line">“{GYM_SAMPLE.feedback_line}”</p>
            <div className="section-tag tag-sun">Retold through {framework.name}</div>
            {GYM_SAMPLE.retelling.map((seg) => {
              const meta = stepMeta[seg.step]
              return (
                <div key={seg.step} className="retell-seg">
                  <span className={`beat-badge beat-${meta?.index ?? 0}`}>{meta?.label || seg.step}</span>
                  <p className="retell-text">{seg.text}</p>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
