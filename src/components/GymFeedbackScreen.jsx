const VERDICT_META = {
  hit: { label: 'Landed', emoji: '🎯', cls: 'verdict-hit' },
  partial: { label: 'Almost', emoji: '🌗', cls: 'verdict-partial' },
  missed: { label: 'Missing', emoji: '🫥', cls: 'verdict-missed' },
}

export function GymFeedbackScreen({ framework, situation, result, onAgain, onNewSituation, onHome }) {
  const { steps, feedback_line, retelling } = result.analysis
  const stepMeta = Object.fromEntries(framework.steps.map((s, i) => [s.key, { ...s, index: i }]))

  const mockBits = []
  if (result.sttProvider === 'mock') mockBits.push('transcription')
  if (result.analysis?.provider === 'mock') mockBits.push('framework analysis')

  return (
    <div className="screen gym-feedback-screen">
      <div className="prompt-pill small">
        <span>{situation.emoji}</span> {situation.text}
      </div>
      <h2 className="screen-title">How your beats landed 🥁</h2>
      {mockBits.length > 0 && (
        <div className="mock-note">🧪 Sample data used for: {mockBits.join(', ')}</div>
      )}

      <div className="card feedback-card">
        <div className="section-tag tag-violet">{framework.name} — beat by beat</div>
        <div className="beat-verdicts">
          {steps.map((s) => {
            const meta = stepMeta[s.key]
            const v = VERDICT_META[s.verdict] || VERDICT_META.partial
            return (
              <div key={s.key} className={`beat-verdict ${v.cls}`}>
                <div className="beat-verdict-head">
                  <span className={`beat-badge beat-${meta?.index ?? 0}`}>{meta?.label || s.key}</span>
                  <span className="verdict-label">{v.emoji} {v.label}</span>
                </div>
                <p className="beat-note">{s.note}</p>
              </div>
            )
          })}
        </div>
        {feedback_line && <p className="feedback-line gym-line">“{feedback_line}”</p>}
      </div>

      <div className="card feedback-card retell-card">
        <div className="section-tag tag-sun">Your story, retold through {framework.name}</div>
        <div className="retelling">
          {retelling.map((seg) => {
            const meta = stepMeta[seg.step]
            return (
              <div key={seg.step} className="retell-seg">
                <span className={`beat-badge beat-${meta?.index ?? 0}`}>{meta?.label || seg.step}</span>
                <p className="retell-text">{seg.text}</p>
              </div>
            )
          })}
        </div>
        <p className="retell-disclaimer">
          ✍️ AI retelling — your facts, reshaped. Steal what works, say it your way.
        </p>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary btn-big" onClick={onAgain}>
          🔁 Tell it again — same prompt
        </button>
        <div className="cta-secondary-row">
          <button className="btn btn-ghost" onClick={onNewSituation}>🎲 New situation</button>
          <button className="btn btn-ghost" onClick={onHome}>🏠 Home</button>
        </div>
      </div>
      <p className="nudge">Round 2 with the shape fresh in your head — that’s where it sticks.</p>
    </div>
  )
}
