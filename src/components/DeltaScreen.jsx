import { useEffect, useState } from 'react'
import { TranscriptView } from './TranscriptView.jsx'

const FIX_VERDICT = {
  yes: { label: 'You did it', emoji: '✅', cls: 'fix-yes' },
  partly: { label: 'Partly there', emoji: '🌗', cls: 'fix-partly' },
  no: { label: 'Not this round', emoji: '🫥', cls: 'fix-no' },
}

// Three dots standing in for "story shape" — deliberately not the words
// situation/complication/outcome/element, which the structure prompt itself
// is forbidden from using. The comparison card below carries the actual
// narrative; this is just the at-a-glance shape.
function ElementDots({ count }) {
  return (
    <span className="element-dots" aria-label={`${count} of 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`element-dot ${i < count ? 'element-dot--filled' : ''}`} />
      ))}
    </span>
  )
}

export function DeltaScreen({ attempt1, attempt2, comparison, onNewStory, onExport }) {
  const r1 = attempt1.fillerRateValue
  const r2 = attempt2.fillerRateValue
  const c1 = attempt1.structure.element_count
  const c2 = attempt2.structure.element_count
  // Acting on the advice counts as a win even when neither number moved, and so
  // does holding a full arc across both tellings — that is a real retention rep.
  const improved =
    r2 < r1 || c2 > c1 || comparison?.fix_addressed === 'yes' || (c1 === 3 && c2 === 3)
  const verdict = FIX_VERDICT[comparison?.fix_addressed] || null

  return (
    <div className="screen delta-screen">
      {improved && <Confetti />}
      <h2 className="screen-title">
        {comparison?.headline ? `${comparison.headline}. 📈` : improved ? 'Look at that. 📈' : 'Round two, done. 🏁'}
      </h2>
      <p className="delta-sub">One story, told twice. Here’s what changed:</p>

      <div className="delta-grid">
        <div className={`card delta-card ${r2 < r1 ? 'delta-win' : r2 > r1 ? 'delta-loss' : ''}`}>
          <div className="section-tag tag-coral">Clarity</div>
          <div className="delta-numbers">
            <span className="delta-old">{r1}</span>
            <span className="delta-arrow">→</span>
            <span className="delta-new">{r2}</span>
          </div>
          <div className="delta-unit">fillers per 100 words</div>
        </div>

        <div className={`card delta-card ${c2 > c1 ? 'delta-win' : c2 < c1 ? 'delta-loss' : ''}`}>
          <div className="section-tag tag-violet">Craft</div>
          <div className="delta-numbers delta-dots-row">
            <ElementDots count={c1} />
            <span className="delta-arrow">→</span>
            <ElementDots count={c2} />
          </div>
          <div className="delta-unit">story shape</div>
        </div>
      </div>

      {comparison && (
        <div className="card feedback-card compare-card">
          {comparison.provider === 'mock' && (
            <div className="mock-note">🧪 Sample comparison — not read from your tellings</div>
          )}
          {verdict && attempt1.structure?.suggested_fix && (
            <>
              <div className="section-tag tag-violet">The fix you were given</div>
              <p className="compare-fix">“{attempt1.structure.suggested_fix}”</p>
              <div className={`fix-verdict ${verdict.cls}`}>
                {verdict.emoji} {verdict.label}
              </div>
              {comparison.fix_note && <p className="compare-note">{comparison.fix_note}</p>}
            </>
          )}

          {comparison.what_changed && (
            <>
              <div className="section-tag tag-neutral">What actually changed</div>
              <p className="compare-note">{comparison.what_changed}</p>
            </>
          )}

          {comparison.keep_this && <div className="fix-chip keep-chip">💎 Keep this: {comparison.keep_this}</div>}
          {comparison.next_edge && <div className="fix-chip">💡 Next time: {comparison.next_edge}</div>}
        </div>
      )}

      <div className="card feedback-card">
        <div className="section-tag tag-sun">Your second telling</div>
        <TranscriptView text={attempt2.transcript} events={attempt2.events} />
        <p className="metric-line">
          {attempt2.eventCount === 0 ? (
            <>Zero fillers this round. 🧼</>
          ) : (
            <>
              <strong>{attempt2.eventCount} filler{attempt2.eventCount === 1 ? '' : 's'}</strong> —{' '}
              <strong>{r2} per 100 words</strong>
            </>
          )}
        </p>
      </div>

      <div className="cta-row">
        <button className="btn btn-primary btn-big" onClick={onNewStory}>
          ✨ Practice another story
        </button>
        <button className="btn btn-ghost" onClick={onExport}>
          ⬇️ Export session
        </button>
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
