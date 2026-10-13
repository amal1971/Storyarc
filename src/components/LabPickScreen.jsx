import { PROMPTS, OWN_STORY } from '../lib/prompts.js'

export function LabPickScreen({ onPick, onBack }) {
  return (
    <div className="screen">
      <h2 className="screen-title">What story will you tell? 🔬</h2>
      <p className="screen-sub">
        Pick one — you’ll tell it, get feedback, then tell it again from memory.
      </p>
      <div className="prompt-grid">
        {PROMPTS.map((p, i) => (
          <button key={p.id} className={`prompt-card tilt-${i % 3}`} data-tour={i === 0 ? 'lab-story' : undefined} onClick={() => onPick(p)}>
            <span className="prompt-emoji">{p.emoji}</span>
            <span className="prompt-text">{p.text}</span>
            <span className="prompt-go" aria-hidden="true">→</span>
          </button>
        ))}
        <button className="prompt-card prompt-card--own tilt-1" onClick={() => onPick(OWN_STORY)}>
          <span className="prompt-emoji">{OWN_STORY.emoji}</span>
          <span className="prompt-text">{OWN_STORY.text}</span>
          <span className="prompt-go" aria-hidden="true">→</span>
        </button>
      </div>
      <button className="link-btn" onClick={onBack}>← Back</button>
    </div>
  )
}
