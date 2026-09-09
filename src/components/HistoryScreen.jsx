import { useMemo, useState } from 'react'
import { loadPairs } from '../lib/session.js'
import { PROMPTS, OWN_STORY } from '../lib/prompts.js'
import { SITUATIONS, FRAMEWORKS } from '../lib/frameworks.js'

// Every attempt was already being saved forever in localStorage — this is the
// first time the app shows any of it back. Read-only over existing data, plus a
// way to delete it, which a local-first app owes the user.

const FIX_META = {
  yes: { label: 'fix landed', emoji: '✅' },
  partly: { label: 'partly', emoji: '🌗' },
  no: { label: 'not yet', emoji: '🫥' },
}

function titleFor(pair) {
  if (pair.mode === 'gym') {
    const sit = SITUATIONS.find((s) => s.id === pair.promptId)
    const fw = FRAMEWORKS.find((f) => f.id === pair.frameworkId)
    return { emoji: sit?.emoji || '🏋️', text: sit?.text || 'Gym round', sub: fw ? `${fw.name} · Gym` : 'Gym' }
  }
  const p = [...PROMPTS, OWN_STORY].find((x) => x.id === pair.promptId)
  return { emoji: p?.emoji || '🔬', text: p?.text || 'Story', sub: 'Lab' }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Tiny inline sparkline of filler rate over time (round 2 when it exists, else round 1).
function Sparkline({ points }) {
  if (points.length < 2) return null
  const w = 720, h = 90, pad = 10
  const max = Math.max(...points, 1)
  const step = (w - pad * 2) / (points.length - 1)
  const xy = points.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)])
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Filler rate across ${points.length} rounds, oldest to newest`}>
      <path d={d} fill="none" stroke="#7859f7" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill="#ffffff" stroke="#241b35" strokeWidth="2.5" />
      ))}
      <text x={pad} y={h - 0} fontSize="11" fontWeight="700" fill="#6f6584">older</text>
      <text x={w - pad} y={h - 0} fontSize="11" fontWeight="700" fill="#6f6584" textAnchor="end">newer</text>
    </svg>
  )
}

export function HistoryScreen({ onBack, onExport, onClear }) {
  const pairs = useMemo(() => loadPairs(), [])
  const [confirming, setConfirming] = useState(false)

  // Oldest → newest for the chart; the list stays newest-first.
  const series = [...pairs].reverse().map((p) => (p.a2 ?? p.a1).filler_rate).filter((v) => typeof v === 'number')

  return (
    <div className="screen">
      <h2 className="screen-title">Your rounds 📚</h2>
      <p className="screen-sub">
        Everything here lives in this browser only. Export it, or clear it — it never left your device.
      </p>

      {pairs.length === 0 ? (
        <div className="card center-card">
          <div className="big-emoji">🗒️</div>
          <p className="history-empty">No rounds yet. Tell a story and this page starts filling in.</p>
          <button className="btn btn-primary" onClick={onBack}>Start a story</button>
        </div>
      ) : (
        <>
          {series.length >= 2 && (
            <div className="card feedback-card" style={{ maxWidth: 720 }}>
              <div className="section-tag tag-coral">Filler rate over time</div>
              <Sparkline points={series} />
              <p className="metric-line">
                Lower is cleaner. Latest: <strong>{series[series.length - 1]} per 100 words</strong>
                {series.length >= 2 && <> · first: <strong>{series[0]}</strong></>}
              </p>
            </div>
          )}

          <div className="history-list">
            {pairs.map((p) => {
              const t = titleFor(p)
              const r1 = p.a1?.filler_rate
              const r2 = p.a2?.filler_rate
              const fix = p.a2?.fix_addressed ? FIX_META[p.a2.fix_addressed] : null
              return (
                <div key={p.pairId} className="history-item">
                  <div>
                    <div className="history-title">{t.emoji} {t.text}</div>
                    <div className="history-meta">
                      {t.sub} · {fmtDate(p.timestamp)}
                      {p.a1?.input_mode && p.a1.input_mode !== 'mic' && <> · {p.a1.input_mode}</>}
                      {fix && <> · {fix.emoji} {fix.label}</>}
                      {p.a2?.comparison_headline && <> · “{p.a2.comparison_headline}”</>}
                    </div>
                  </div>
                  <div className="history-delta">
                    {r2 != null ? <>{r1} → {r2}</> : <>{r1}</>}
                    <small>{r2 != null ? 'fillers /100' : 'round 1 only'}</small>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="cta-row">
            <button className="btn btn-ghost" onClick={onExport}>⬇️ Export as JSON</button>
            {confirming ? (
              <span className="text-meta" style={{ justifyContent: 'center', gap: 12 }}>
                <span>Delete all {pairs.length} rounds from this browser?</span>
                <button className="link-btn danger-link" onClick={onClear}>Yes, clear everything</button>
                <button className="link-btn" onClick={() => setConfirming(false)}>Keep</button>
              </span>
            ) : (
              <button className="link-btn danger-link" onClick={() => setConfirming(true)}>Clear my data</button>
            )}
          </div>
        </>
      )}
      <button className="link-btn" onClick={onBack}>← Back</button>
    </div>
  )
}
