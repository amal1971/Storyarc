import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// First-sign-in spotlight tour. Dims the page, cuts a hole around one element
// at a time and explains it in a small card. Kept to a handful of steps on
// purpose: the usage clock is already running while it plays.
//
// steps: [{ target: CSS selector | null, title, body }]
//   target null → a centred card with no spotlight (used for the welcome).
// Steps whose target isn't on the page are skipped, so callers can pass the
// countdown-chip step unconditionally.
// label: optional name shown above the title ("Story Gym · 1 of 3") — used by
//   the short per-mode tours that start straight on a spotlight.

const PAD = 10
const GAP = 16

export function Tour({ steps: allSteps, onClose, label }) {
  const steps = allSteps.filter((s) => !s.target || document.querySelector(s.target))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [tipSize, setTipSize] = useState({ w: 0, h: 0 })
  const tipRef = useRef(null)
  const primaryRef = useRef(null)
  const step = steps[i]
  const isLast = i === steps.length - 1
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null)
    const el = document.querySelector(step.target)
    if (!el) return setRect(null)
    const b = el.getBoundingClientRect()
    setRect({ x: b.left, y: b.top, w: b.width, h: b.height })
  }, [step])

  // Bring the target into view, then measure. Instant scroll keeps the
  // spotlight and the element in sync without waiting for an animation.
  useLayoutEffect(() => {
    if (step?.target) {
      const el = document.querySelector(step.target)
      const b = el?.getBoundingClientRect()
      // A tall target (the Gym beat guide on a phone) goes near the top, so
      // the card fits underneath it instead of covering its last lines.
      if (b && b.height > window.innerHeight * 0.4) window.scrollBy(0, b.top - 24)
      else el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' })
    }
    measure()
  }, [step, measure])

  useLayoutEffect(() => {
    if (tipRef.current) setTipSize({ w: tipRef.current.offsetWidth, h: tipRef.current.offsetHeight })
  }, [i, rect])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }) }, [i])

  const next = () => (isLast ? onClose() : setI((n) => n + 1))
  const back = () => setI((n) => Math.max(0, n - 1))

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    else if (e.key === 'Tab') {
      // Keep focus inside the card while the tour is open.
      const f = tipRef.current?.querySelectorAll('button')
      if (!f?.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  if (!step) return null

  const vw = window.innerWidth, vh = window.innerHeight
  const tipW = Math.min(360, vw - 32)
  let tipStyle, arrowStyle = null, arrowDown = false
  if (!rect) {
    tipStyle = { left: (vw - tipW) / 2, top: Math.max(16, (vh - tipSize.h) / 2), width: tipW }
  } else {
    const below = rect.y + rect.h + PAD + GAP + tipSize.h <= vh - 8 || rect.y - PAD - GAP - tipSize.h < 8
    const top = below ? rect.y + rect.h + PAD + GAP : rect.y - PAD - GAP - tipSize.h
    const left = Math.max(16, Math.min(vw - tipW - 16, rect.x + rect.w / 2 - tipW / 2))
    tipStyle = { left, top: Math.max(8, Math.min(top, vh - tipSize.h - 8)), width: tipW }
    arrowDown = !below
    arrowStyle = { left: Math.max(18, Math.min(tipW - 34, rect.x + rect.w / 2 - left - 8)) }
  }
  const counted = steps.filter((s) => s.target)
  const n = counted.indexOf(step) + 1
  const intro = i === 0 && !step.target
  const kicker = !step.target ? 'Quick tour'
    : label ? (counted.length > 1 ? `${label} · ${n} of ${counted.length}` : label)
    : `Step ${n} of ${counted.length}`

  return (
    <div className={`tour ${reduced ? 'tour--still' : ''}`} onKeyDown={onKeyDown}>
      {/* Swallows clicks so the page underneath can't be used mid-tour. */}
      <div className="tour-blocker" aria-hidden="true" />
      <div
        className={`tour-hole ${rect ? '' : 'tour-hole--none'}`}
        aria-hidden="true"
        style={rect
          ? { left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }
          : { left: vw / 2, top: vh / 2, width: 0, height: 0 }}
      />
      <div ref={tipRef} className="tour-tip" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" style={tipStyle}>
        <div className="tour-step">{kicker}</div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <p id="tour-body" className="tour-body">{step.body}</p>
        <div className="tour-row">
          <div className="tour-dots" aria-hidden="true">
            {counted.length > 1 && counted.map((s, k) => <span key={k} className={k < n ? 'on' : ''} />)}
          </div>
          <div className="tour-btns">
            {isLast
              ? i > 0 && <button className="tour-link" onClick={back}>Back</button>
              : <button className="tour-link" onClick={onClose}>{intro ? 'Skip' : 'Skip tour'}</button>}
            <button ref={primaryRef} className="tour-primary" onClick={next}>
              {intro ? 'Show me' : isLast ? 'Got it — let’s go' : 'Next'}
            </button>
          </div>
        </div>
        {arrowStyle && <div className={`tour-arrow ${arrowDown ? 'tour-arrow--down' : ''}`} style={arrowStyle} aria-hidden="true" />}
      </div>
    </div>
  )
}
