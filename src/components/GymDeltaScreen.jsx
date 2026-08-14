import { useEffect, useState } from 'react'

const VERDICT_META = {
  hit: { label: 'Landed', emoji: '🎯', cls: 'verdict-hit', rank: 2 },
  partial: { label: 'Almost', emoji: '🌗', cls: 'verdict-partial', rank: 1 },
  missed: { label: 'Missing', emoji: '🫥', cls: 'verdict-missed', rank: 0 },
}

const FIX_VERDICT = {
  yes: { label: 'You moved it', emoji: '✅', cls: 'fix-yes' },
  partly: { label: 'Partly there', emoji: '🌗', cls: 'fix-partly' },
  no: { label: 'Not this round', emoji: '🫥', cls: 'fix-no' },
}

// Round-2 payoff for the gym: which beats moved, what changed, and the fresh
// retelling. The beat movement is computed here rather than asked of the model —
// it is an ordinal comparison (missed < partial < hit) that code does exactly.
export function GymDeltaScreen({
  framework, situation, attempt1, attempt2, comparison, onNewSituation, onHome,
}) {
  const stepMeta = Object.fromEntries(framework.steps.map((s, i) => [s.key, { ...s, index: i }]))
  const byKey = (steps, key) => (steps || []).find((s) => s.key === key)

  const moves = framework.steps.map((s) => {
    const v1 = VERDICT_META[byKey(attempt1.analysis.steps, s.key)?.verdict] || VERDICT_META.partial
    const v2 = VERDICT_META[byKey(attempt2.analysis.steps, s.key)?.verdict] || VERDICT_META.partial
    return { key: s.key, meta: stepMeta[s.key], v1, v2, delta: v2.rank - v1.rank }
  })

  const gained = moves.filter((m) => m.delta > 0).length
  const allLanded = moves.every((m) => m.v2.rank === 2)
  const improved = gained > 0 || allLanded || comparison?.fix_addressed === 'yes'
  const verdict = FIX_VERDICT[comparison?.fix_addressed] || null

  const headline = comparison?.headline
    ? `${comparison.headline}. 🥁`
    : allLanded
      ? 'Every beat landed. 🥁'
      : gained > 0
        ? 'The shape moved. 🥁'
        : 'Round two, done. 🏁'

  return (
    <div className="screen delta-screen">
      {improved && <Confetti />}
      <div className="prompt-pill small">
        <span>{situation.emoji}</span> {situation.text}
      </div>
      <h2 className="screen-title">{headline}</h2>
      <p className="delta-sub">Same prompt, told twice through {framework.name}.</p>

      <div className="card feedback-card">
        <div className="section-tag tag-violet">Beat by beat — round 1 → round 2</div>
        <div className="beat-moves">
          {moves.map((m) => (
            <div
              key={m.key}
              className={`beat-move ${m.delta > 0 ? 'move-up' : m.delta < 0 ? 'move-down' : ''}`}
            >
              <span className={`beat-badge beat-${m.meta?.index ?? 0}`}>{m.meta?.label || m.key}</span>
              <span className="move-pair">
                <span className="move-from">{m.v1.emoji} {m.v1.label}</span>
                <span className="move-arrow" aria-hidden="true">→</span>
                <span className={`move-to ${m.v2.cls}`}>{m.v2.emoji} {m.v2.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {comparison && (
        <div className="card feedback-card compare-card">
          {comparison.provider === 'mock' && (
            <div className="mock-note">🧪 Sample comparison — not read from your attempts</div>
          )}
          {verdict && (
            <>
              <div className="section-tag tag-coral">Did seeing the retelling help?</div>
              <div className={`fix-verdict ${verdict.cls}`}>
                {verdict.emoji} {verdict.label}
              </div>
              {comparison.fix_note && <p className="compare-note">{comparison.fix_note}</p>}
            </>
          )}
          {comparison.what_changed && <p className="compare-note">{comparison.what_changed}</p>}
          {comparison.keep_this && <div className="fix-chip keep-chip">💎 Keep this: {comparison.keep_this}</div>}
          {comparison.next_edge && <div className="fix-chip">💡 Next time: {comparison.next_edge}</div>}
        </div>
      )}

      <div className="card feedback-card retell-card">
        <div className="section-tag tag-sun">Round 2, retold through {framework.name}</div>
        <div className="retelling">
          {attempt2.analysis.retelling.map((seg) => {
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
        <button className="btn btn-primary btn-big" onClick={onNewSituation}>
          🎲 New situation
        </button>
        <button className="link-btn" onClick={onHome}>🏠 Home</button>
      </div>
    </div>
  )
}

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      duration: 2.4 + Math.random() * 1.6,
      color: ['#FF5D5D', '#7C5CFF', '#FFC93C', '#2BC48A', '#FF8A3D'][i % 5],
      size: 7 + Math.random() * 7,
      rot: Math.random() * 360,
    })),
  )
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            background: p.color,
            width: p.size,
            height: p.size * 0.6,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  )
}
