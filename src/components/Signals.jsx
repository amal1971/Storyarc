import { topFiller } from '../lib/fillers.js'

// Small, honest secondary signals shared by every feedback screen. None of these
// need another model call — they're computed from data the app already has and
// previously threw away (duration → WPM, input provenance, dominant filler).

function paceWord(wpm) {
  if (wpm == null) return null
  if (wpm < 110) return 'measured'
  if (wpm > 175) return 'quick'
  return 'conversational'
}

export function SignalRow({ wpm, inputMode, className = '' }) {
  const items = []
  if (wpm != null) items.push({ key: 'wpm', text: `🗣️ ~${wpm} words/min · ${paceWord(wpm)}` })
  if (inputMode === 'text') items.push({ key: 'typed', text: '⌨️ Typed — transcription skipped', warn: true })
  if (inputMode === 'sample') items.push({ key: 'sample', text: '▶ Sample recording — real transcription', warn: true })
  if (!items.length) return null
  return (
    <div className={`signal-row ${className}`}>
      {items.map((it) => (
        <span key={it.key} className={`signal ${it.warn ? 'signal-warn' : ''}`}>{it.text}</span>
      ))}
    </div>
  )
}

// "Your tell": the one filler you lean on, named. Only renders when it is
// genuinely dominant (see topFiller) so it never invents a pattern.
export function TellLine({ events }) {
  const tell = topFiller(events)
  if (!tell) return null
  const isRep = events.find((e) => e.token === tell.token)?.category === 'repetition'
  return (
    <p className="tell-line">
      Your tell: <strong>“{tell.token}”</strong> — {tell.count} of your {tell.total} {isRep ? 'stumbles' : 'fillers'} ({tell.share}%).
      That’s the one to notice next time.
    </p>
  )
}

// The stricter structure judgment the rubric already computes: is there an
// ending, and does it actually resolve the trouble — or is it bolted on?
export function ConnectedNote({ structure }) {
  if (!structure || !structure.outcome_present || structure.outcome_connected !== false) return null
  return (
    <p className="connected-note">
      There’s an ending — but it doesn’t yet answer the trouble you set up. A resolution should close the exact loop the complication opened.
    </p>
  )
}
