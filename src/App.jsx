import { Component, useEffect, useRef, useState } from 'react'
import { StartScreen } from './components/StartScreen.jsx'
import { LoginGate } from './components/LoginGate.jsx'
import { Tour } from './components/Tour.jsx'
import { LabPickScreen } from './components/LabPickScreen.jsx'
import { RecordScreen } from './components/RecordScreen.jsx'
import { ProcessingScreen } from './components/ProcessingScreen.jsx'
import { FeedbackScreen } from './components/FeedbackScreen.jsx'
import { DeltaScreen } from './components/DeltaScreen.jsx'
import { GymPickScreen } from './components/GymPickScreen.jsx'
import { GymFeedbackScreen } from './components/GymFeedbackScreen.jsx'
import { GymDeltaScreen } from './components/GymDeltaScreen.jsx'
import { HistoryScreen } from './components/HistoryScreen.jsx'
import { AboutScreen } from './components/AboutScreen.jsx'
import { transcribe } from './lib/stt.js'
import { analyzeFillers, analyzeStructure, analyzeFramework, compareAttempts } from './lib/analyze.js'
import { detectDeterministic, mergeEvents, fillerRate, countWords, wordsPerMinute } from './lib/fillers.js'
import { randomSituation } from './lib/frameworks.js'
import {
  newPairId, buildAttemptRecord, saveRecord, loadRecords, exportSession, annotatePair, clearSession,
} from './lib/session.js'
import { fetchSessionStatus, logout } from './lib/auth.js'

const TOUR_KEY = 'storyarc_tour_seen_v1'
// Short follow-up tours, each shown the first time that mode's pick screen opens.
const MODE_TOUR_KEYS = { lab: 'storyarc_tour_lab_v1', gym: 'storyarc_tour_gym_v1' }

// Each poll writes the elapsed time to Redis, so it is a real cost: 30 s is
// plenty for a countdown, and hidden tabs skip it (the signed cookie keeps the
// clock exact regardless; the next visible poll catches up).
const POLL_MS = 30000
const WARN_AT_SECONDS = 60

// Last line of defence: a render crash shows a way back instead of a blank page.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('[render]', err) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen processing-screen">
        <div className="card center-card">
          <div className="big-emoji">🧯</div>
          <h2>Something went wrong on this screen</h2>
          <p className="muted">Your saved rounds are safe in History. Head back to the start and try again.</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ failed: false }); this.props.onReset() }}>Back to the start</button>
        </div>
      </div>
    )
  }
}

function formatRemaining(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const REPO_URL = 'https://github.com/amal1971/Storyarc'

// Lab loop:  start → lab-pick → record1 → processing → feedback → record2 → processing → delta
// Gym loop:  start → gym-pick → gym-record → processing → gym-feedback
//                 → gym-record2 → processing → gym-delta
// Side screens: history, about (reachable from the footer on any screen).
// Both loops end in a comparison call that reads BOTH attempts together —
// that call is what lets the app say whether its own advice landed.
export default function App() {
  const [screen, setScreen] = useState('start')
  const [prompt, setPrompt] = useState(null)
  const [attempt1, setAttempt1] = useState(null)
  const [attempt2, setAttempt2] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [framework, setFramework] = useState(null)
  const [situation, setSituation] = useState(null)
  const [gymAttempt1, setGymAttempt1] = useState(null)
  const [gymAttempt2, setGymAttempt2] = useState(null)
  const [gymComparison, setGymComparison] = useState(null)
  const [procError, setProcError] = useState(null)
  const pairIdRef = useRef(null)
  const lastInputRef = useRef(null)
  const seenSituationsRef = useRef(new Set())
  // Bumped by reset(): an analysis that finishes after the user went home is
  // dropped instead of landing on wiped state (that used to white-screen).
  const runIdRef = useRef(0)
  // Where History / How it's built return to, so opening them mid-round no
  // longer throws the round away.
  const returnScreenRef = useRef('start')
  const screenRef = useRef('start')

  // Access gate. 'checking' → first status call in flight; null → signed out;
  // 'locked' → this account's lifetime allowance is spent; 'disabled' →
  // AUTH_ENABLED=false, the app behaves exactly as it did before the gate.
  const [auth, setAuth] = useState('checking')
  // First-sign-in tour: shown once per browser, replayable from the footer.
  const [tourOpen, setTourOpen] = useState(false)
  const [modeTour, setModeTour] = useState(null) // 'lab' | 'gym' | null
  const [limitMins, setLimitMins] = useState(null)
  const [lockedEmail, setLockedEmail] = useState(null)
  const [remaining, setRemaining] = useState(null)

  const applyAuthError = (err) => {
    if (err.status === 403) {
      setLockedEmail(err.email)
      setAuth('locked')
    } else {
      setAuth(null)
    }
  }

  const onAuthenticated = (session) => {
    if (session?.authDisabled) return setAuth('disabled')
    setAuth(session)
    setRemaining(session.remainingSeconds)
  }

  // The cookie outlives a page refresh, so ask once on mount before showing
  // anyone a sign-in button they may not need.
  useEffect(() => {
    let live = true
    fetchSessionStatus()
      .then((s) => { if (live) onAuthenticated(s) })
      .catch((err) => { if (live) applyAuthError(err) })
    return () => { live = false }
  }, [])

  // A failed poll only means something when the server says so (401 signed
  // out, 403 time used up). A network blip or a 500 used to sign people out
  // mid-recording; now it is ignored and the next poll tries again.
  const onPollError = (err) => {
    if (err.status === 401 || err.status === 403) applyAuthError(err)
  }
  const checkSession = () => {
    fetchSessionStatus().then((s) => setRemaining(s.remainingSeconds)).catch(onPollError)
  }

  // Each poll both refreshes the countdown and checkpoints elapsed time
  // server-side — that's what makes a closed tab still cost its minutes.
  const authed = auth && typeof auth === 'object'
  useEffect(() => {
    if (!authed) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      checkSession()
    }, POLL_MS)
    // Hidden tabs skip polls, so check in (and checkpoint the time used) as
    // soon as the tab is visible again rather than waiting up to 30 s.
    const onVisible = () => { if (!document.hidden) checkSession() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authed]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the local countdown reaches zero, ask the server straight away
  // rather than leaving "0:00 left" on screen until the next poll.
  const outOfTime = authed && !auth.unlimited && remaining === 0
  useEffect(() => {
    if (outOfTime) checkSession()
  }, [outOfTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local tick so the chip counts down smoothly between polls; every poll
  // resyncs it, so drift can't accumulate.
  useEffect(() => {
    if (!authed || remaining == null) return
    const id = setInterval(() => setRemaining((r) => (r == null ? r : Math.max(0, r - 1))), 1000)
    return () => clearInterval(id)
  }, [authed, remaining == null])

  const signOut = () => {
    logout().catch(() => {})
    setAuth(null)
    setRemaining(null)
  }

  const mode = screen.startsWith('gym') ? 'gym' : 'lab'
  screenRef.current = screen

  const reset = () => {
    runIdRef.current += 1
    returnScreenRef.current = 'start'
    setScreen('start')
    setPrompt(null)
    setAttempt1(null)
    setAttempt2(null)
    setComparison(null)
    setFramework(null)
    setSituation(null)
    setGymAttempt1(null)
    setGymAttempt2(null)
    setGymComparison(null)
    setProcError(null)
    pairIdRef.current = null
  }

  const IN_ROUND = ['record1', 'feedback', 'record2', 'processing', 'delta', 'gym-record', 'gym-feedback', 'gym-record2', 'gym-delta']
  const goHome = () => {
    const live = IN_ROUND.includes(screen) || (['history', 'about'].includes(screen) && IN_ROUND.includes(returnScreenRef.current))
    if (live && !window.confirm('Leave this round? Your progress on this story will be lost.')) return
    reset()
  }
  const openSide = (name) => {
    if (screen !== 'history' && screen !== 'about') returnScreenRef.current = screen
    setScreen(name)
  }
  const closeSide = () => setScreen(returnScreenRef.current || 'start')

  // Tour: opens by itself the first time a signed-in visitor lands on the
  // start screen, and again whenever they ask via the footer link.
  const signedIn = authed || auth === 'disabled'
  useEffect(() => {
    if (!signedIn || screen !== 'start' || tourOpen) return
    let seen = true
    try { seen = localStorage.getItem(TOUR_KEY) === '1' } catch { /* storage blocked: don't nag */ }
    if (!seen) setTourOpen(true)
  }, [signedIn, screen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Mode tours: the first time someone opens the Lab or Gym pick screen.
  useEffect(() => {
    const mode = screen === 'lab-pick' ? 'lab' : screen === 'gym-pick' ? 'gym' : null
    if (!signedIn || !mode) return setModeTour(null)
    let seen = true
    try { seen = localStorage.getItem(MODE_TOUR_KEYS[mode]) === '1' } catch { /* storage blocked: don't nag */ }
    setModeTour(seen ? null : mode)
  }, [signedIn, screen])
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (h?.usageLimitMinutes > 0) setLimitMins(h.usageLimitMinutes) })
      .catch(() => {})
  }, [])
  const closeTour = () => {
    try { localStorage.setItem(TOUR_KEY, '1') } catch { /* fine */ }
    setTourOpen(false)
  }
  const closeModeTour = () => {
    try { localStorage.setItem(MODE_TOUR_KEYS[modeTour], '1') } catch { /* fine */ }
    setModeTour(null)
  }
  // "Show me around" replays everything, including the per-mode tours.
  const replayTour = () => {
    try { Object.values(MODE_TOUR_KEYS).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ }
    setTourOpen(true)
  }
  const modeTourSteps = {
    lab: [{
      target: '[data-tour="lab-story"]',
      title: 'Pick a story to tell',
      body: 'Each card is a prompt for a real moment from your life. Tap one, tell it out loud, and we’ll show your filler words and one thing to fix. Got your own story? Use the last card.',
    }],
    gym: [
      {
        target: '[data-tour="gym-prompt"]',
        title: 'This is your prompt',
        body: 'The question you’ll answer out loud, like one you’d get in an interview. Not feeling it? Tap “Give me a different prompt”.',
      },
      {
        target: '[data-tour="gym-shape"]',
        title: 'Pick a shape to tell it in',
        body: 'Each card is a storytelling shape. Tap the one you want to practise; ABT is a good first pick.',
      },
      {
        target: '[data-tour="gym-beats"]',
        title: 'How to use the shape',
        body: 'These are its beats, in order. Hit each one as you speak. Afterwards we’ll show which beats landed and retell your story in this shape.',
      },
    ],
  }
  const capped = authed && !auth.unlimited
  const tourSteps = [
    {
      target: null,
      title: 'Welcome to StoryArc 👋',
      body: capped && limitMins
        ? `A 20-second look around before you start. Your ${limitMins} minutes are already counting, so we’ll keep it short.`
        : 'A 20-second look around before you start.',
    },
    {
      target: '.mode-card--lab',
      title: 'Story Lab — tell it, then tell it better',
      body: 'Pick a prompt or bring your own story and tell it out loud. You’ll see your filler words highlighted and get one thing to fix. Then tell it again from memory and see exactly what changed.',
    },
    {
      target: '.mode-card--gym',
      title: 'Story Gym — practise a shape',
      body: 'Answer a real prompt, like an interview question, using a storytelling shape: And–But–Therefore, Situation–Complication–Resolution, or STAR. See which beats landed, then hear your own story retold in that shape.',
    },
    {
      target: '[data-tour="peek"]',
      title: 'Curious first? Peek at a sample',
      body: 'See finished feedback on an example story before you record your own.',
    },
    ...(capped ? [{
      target: '.session-chip',
      title: 'Your time, counting down',
      body: `${limitMins ? `${limitMins} minutes` : 'Your time'} in total on this account, counting from sign-in. One round takes about 3, so there’s room for a few.`,
    }] : []),
  ]

  // An analysis result moves the user on only if they are still waiting for
  // it; if they stepped into History or About meanwhile, it becomes where
  // "Back" takes them.
  const showResult = (next) => {
    if (screenRef.current === 'processing') setScreen(next)
    else returnScreenRef.current = next
  }

  const nextSituation = () => {
    const s = randomSituation(seenSituationsRef.current)
    seenSituationsRef.current.add(s.id)
    return s
  }

  // New situation / new framework run: keep the mode, drop the prior round.
  const resetGymRound = (nextSit) => {
    setGymAttempt1(null)
    setGymAttempt2(null)
    setGymComparison(null)
    setProcError(null)
    if (nextSit) setSituation(nextSit)
    pairIdRef.current = newPairId()
    setScreen('gym-record')
  }

  const pickPrompt = (p) => {
    setPrompt(p)
    pairIdRef.current = newPairId()
    setScreen('record1')
  }

  const startGym = (fw, sit) => {
    setFramework(fw)
    setSituation(sit)
    seenSituationsRef.current.add(sit.id)
    pairIdRef.current = newPairId()
    setScreen('gym-record')
  }

  // One shape for all three ways in: { blob, seconds, inputMode } or { text, inputMode }.
  // The typed path skips speech-to-text entirely — downstream only ever sees text.
  async function getTranscript(input, attemptNumber) {
    if (input.text) return { text: input.text, provider: 'typed' }
    return transcribe(input.blob, { attemptNumber })
  }

  // Everything a run needs is captured up front (ctx), so state changes while
  // a request is in flight — Home, a new round — can't redirect its results.
  async function runLabAnalysis(input, attemptNumber, ctx, stale = () => false) {
    const t = await getTranscript(input, attemptNumber)
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    const [tierB, structure] = await Promise.all([
      analyzeFillers(t.text),
      // The prompt they chose (not "tell your own story") gives the coach context.
      analyzeStructure(t.text, ctx.prompt?.id && ctx.prompt.id !== 'own-story' ? ctx.prompt.text : null),
    ])
    const events = mergeEvents(t.text, detectDeterministic(t.text), tierB.events, tierB.overrides)
    const durationS = input.seconds ?? null
    const wpm = wordsPerMinute(wordCount, durationS)
    const inputMode = input.inputMode || 'mic'
    const analysis = {
      transcript: t.text,
      events,
      eventCount: events.length,
      wordCount,
      fillerRateValue: fillerRate(events.length, wordCount),
      structure,
      sttProvider: t.provider,
      fillerProvider: tierB.provider,
      durationS,
      wpm,
      inputMode,
    }
    // An abandoned run (Home, or "Clear my data" while it was in flight) must
    // not write into history the user just left or wiped.
    if (!stale()) saveRecord(buildAttemptRecord({
      pairId: ctx.pairId,
      attemptNumber,
      promptId: ctx.prompt?.id,
      transcript: t.text,
      wordCount,
      fillerEvents: events,
      fillerRateValue: analysis.fillerRateValue,
      structure,
      retryStarted: attemptNumber === 2,
      sttProvider: t.provider,
      inputMode,
      durationS,
      wpm,
      provenance: {
        structure: { provider: structure.provider, prompt_version: structure.prompt_version ?? null, model: structure.model ?? null },
        fillers: { provider: tierB.provider, prompt_version: tierB.prompt_version ?? null, model: tierB.model ?? null },
        stt: t.provider,
      },
    }))
    return { analysis }
  }

  async function runGymAnalysis(input, attemptNumber, ctx, stale = () => false) {
    const t = await getTranscript(input, attemptNumber)
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    // The question being answered goes along so the coach can tell a strong
    // story that doesn't actually answer it apart from one that does.
    const fwAnalysis = await analyzeFramework(t.text, ctx.framework.id, ctx.situation?.text)
    const events = detectDeterministic(t.text)
    const durationS = input.seconds ?? null
    const wpm = wordsPerMinute(wordCount, durationS)
    const inputMode = input.inputMode || 'mic'
    const fillerRateValue = fillerRate(events.length, wordCount)
    // An abandoned run (Home, or "Clear my data" while it was in flight) must
    // not write into history the user just left or wiped.
    if (!stale()) saveRecord(buildAttemptRecord({
      mode: 'gym',
      frameworkId: ctx.framework.id,
      situationId: ctx.situation?.id,
      frameworkSteps: fwAnalysis.steps,
      retelling: fwAnalysis.retelling ?? null,
      frameworkFeedbackLine: fwAnalysis.feedback_line ?? null,
      provenance: {
        framework: { provider: fwAnalysis.provider, prompt_version: fwAnalysis.prompt_version ?? null, model: fwAnalysis.model ?? null },
        stt: t.provider,
      },
      pairId: ctx.pairId,
      attemptNumber,
      promptId: ctx.situation?.id,
      transcript: t.text,
      wordCount,
      fillerEvents: events,
      fillerRateValue,
      structure: null,
      sttProvider: t.provider,
      inputMode,
      durationS,
      wpm,
    }))
    return {
      result: {
        transcript: t.text,
        analysis: fwAnalysis,
        sttProvider: t.provider,
        events,
        eventCount: events.length,
        wordCount,
        fillerRateValue,
        durationS,
        wpm,
        inputMode,
      },
    }
  }

  async function analyze(input, attemptNumber, analysisMode = mode) {
    setProcError(null)
    setScreen('processing')
    const runId = runIdRef.current
    const stale = () => runId !== runIdRef.current
    // Retry of the same input reuses whatever already succeeded: if only the
    // comparison failed, the retry re-runs just the comparison, instead of
    // paying for transcription and analysis again.
    const prev = lastInputRef.current
    const sameInput = prev && prev.input === input && prev.attemptNumber === attemptNumber
    const ctx = sameInput && prev.ctx
      ? prev.ctx
      : { pairId: pairIdRef.current, prompt, framework, situation, attempt1, gymAttempt1 }
    lastInputRef.current = { input, attemptNumber, analysisMode, ctx, out: sameInput ? prev.out : null }
    try {
      if (analysisMode === 'gym') {
        const out = lastInputRef.current.out || (await runGymAnalysis(input, attemptNumber, ctx, stale))
        if (stale()) return
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        lastInputRef.current.out = out
        if (attemptNumber === 1) {
          setGymAttempt1(out.result)
          showResult('gym-feedback')
        } else {
          setGymAttempt2(out.result)
          const cmp = await compareAttempts({
            mode: 'gym',
            transcript1: ctx.gymAttempt1.transcript,
            transcript2: out.result.transcript,
            frameworkId: ctx.framework.id,
            steps1: ctx.gymAttempt1.analysis.steps,
          })
          if (stale()) return
          setGymComparison(cmp)
          annotatePair(ctx.pairId, { fix_addressed: cmp.fix_addressed, comparison_headline: cmp.headline, comparison: cmp })
          showResult('gym-delta')
        }
      } else {
        const out = lastInputRef.current.out || (await runLabAnalysis(input, attemptNumber, ctx, stale))
        if (stale()) return
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        lastInputRef.current.out = out
        if (attemptNumber === 1) {
          setAttempt1(out.analysis)
          showResult('feedback')
        } else {
          setAttempt2(out.analysis)
          const cmp = await compareAttempts({
            mode: 'lab',
            transcript1: ctx.attempt1.transcript,
            transcript2: out.analysis.transcript,
            suggestedFix: ctx.attempt1.structure?.suggested_fix,
          })
          if (stale()) return
          setComparison(cmp)
          annotatePair(ctx.pairId, { fix_addressed: cmp.fix_addressed, comparison_headline: cmp.headline, comparison: cmp })
          showResult('delta')
        }
      }
    } catch (err) {
      console.error(err)
      if (stale()) return
      // Signed out or out of time mid-analysis: show the sign-in / locked
      // screen, and leave a "session" error behind it so Retry is there after
      // signing back in (it used to be an endless spinner).
      if (err?.status === 401 || err?.status === 403) {
        setProcError({ kind: 'session' })
        return err.status === 401 ? setAuth(null) : applyAuthError(err)
      }
      // Each failure gets an honest state of its own; none of them is ever
      // papered over with demo output.
      const kind =
        err?.status === 429 ? (err.reason === 'daily' ? 'capacity' : 'callcap')
          : err?.stage === 'stt' ? 'stt'
            : err?.reason === 'billing' ? 'service'
              : err?.retryable ? 'busy'
                : 'llm'
      setProcError({ kind })
    }
  }

  const last = lastInputRef.current
  const isGymContext = mode === 'gym' || (screen === 'processing' && last?.analysisMode === 'gym')
  const sideScreen = screen === 'history' || screen === 'about'
  const crumbs =
    isGymContext
      ? [
          { label: 'Pick a framework', active: screen === 'gym-pick' },
          { label: 'Tell it', active: screen === 'gym-record' },
          { label: 'See it land', active: screen === 'gym-feedback' },
          { label: 'Round 2', active: screen === 'gym-record2' || screen === 'gym-delta' },
        ]
      : [
          { label: 'Tell it', active: screen === 'record1' || screen === 'feedback' },
          { label: 'Tell it again', active: screen === 'record2' },
          { label: 'See the delta', active: screen === 'delta' },
        ]
  const showCrumbs = screen !== 'start' && !sideScreen

  if (auth === 'checking') {
    return (
      <div className="app">
        <div className="gate-splash" role="status" aria-live="polite">Checking your session…</div>
      </div>
    )
  }

  if (auth === null || auth === 'locked') {
    return (
      <div className="app">
        <LoginGate
          locked={auth === 'locked'}
          lockedEmail={lockedEmail}
          onAuthenticated={onAuthenticated}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={goHome} aria-label="StoryArc home">
          Story<span className="grad-text">Arc</span> <span className="logo-mic">🎙️</span>
        </button>
        {showCrumbs && (
          <nav className="crumbs" aria-label="Progress">
            {crumbs.map((c) => (
              <span key={c.label} className={`crumb ${c.active ? 'active' : ''}`}>{c.label}</span>
            ))}
          </nav>
        )}
        {showCrumbs && (() => {
          const activeIndex = crumbs.findIndex((c) => c.active)
          const current = crumbs[activeIndex] || crumbs[0]
          return (
            <span className="crumbs-mobile" aria-label="Progress">
              {activeIndex + 1} of {crumbs.length} · {current.label}
            </span>
          )
        })()}
        {authed && (auth.unlimited || remaining != null) && (
          <span className="session-box">
            {auth.unlimited ? (
              <span className="session-chip" title={`${auth.email || 'Signed in'} · admin, no cap`}>
                ♾️ Unlimited
              </span>
            ) : (
              <span
                className={`session-chip ${remaining <= 300 ? 'session-chip--low' : ''}`}
                title={`${auth.email || 'Signed in'} · time left on this account`}
              >
                ⏳ {formatRemaining(remaining)} left{remaining <= 300 ? ' · running low' : ''}
              </span>
            )}
            <button className="link-btn" onClick={signOut}>Log out</button>
          </span>
        )}
      </header>

      {authed && !auth.unlimited && remaining != null && remaining > 0 && remaining <= WARN_AT_SECONDS && (
        <div className="time-warning" role="status">
          ⏳ Under a minute left on this account. Finish what you’re doing — when time runs out, anything in progress stops.
        </div>
      )}

      <ErrorBoundary onReset={reset}>
      <main>
        {screen === 'start' && (
          <StartScreen onLab={() => setScreen('lab-pick')} onGym={() => setScreen('gym-pick')} />
        )}

        {screen === 'lab-pick' && <LabPickScreen onPick={pickPrompt} onBack={reset} />}

        {screen === 'record1' && (
          <RecordScreen
            prompt={prompt}
            attemptNumber={1}
            onSubmit={(input) => analyze(input, 1, 'lab')}
            onCancel={() => setScreen('lab-pick')}
          />
        )}

        {screen === 'processing' && (
          <ProcessingScreen
            variant={last?.analysisMode || 'lab'}
            error={procError}
            onRetry={() => analyze(last.input, last.attemptNumber, last.analysisMode)}
            onReRecord={() =>
              setScreen(
                last?.analysisMode === 'gym'
                  ? last?.attemptNumber === 2
                    ? 'gym-record2'
                    : 'gym-record'
                  : last?.attemptNumber === 2
                    ? 'record2'
                    : 'record1',
              )
            }
          />
        )}

        {screen === 'feedback' && attempt1 && (
          <FeedbackScreen
            prompt={prompt}
            analysis={attempt1}
            onRetry={() => setScreen('record2')}
            onStartOver={reset}
          />
        )}

        {screen === 'record2' && (
          <RecordScreen
            prompt={prompt}
            attemptNumber={2}
            onSubmit={(input) => analyze(input, 2, 'lab')}
            onCancel={() => setScreen('feedback')}
          />
        )}

        {screen === 'delta' && attempt1 && attempt2 && (
          <DeltaScreen
            attempt1={attempt1}
            attempt2={attempt2}
            comparison={comparison}
            onNewStory={reset}
            onExport={() => exportSession(loadRecords())}
          />
        )}

        {screen === 'gym-pick' && (
          <GymPickScreen
            onStart={startGym}
            onBack={reset}
            initialFramework={framework}
            initialSituation={situation}
            onDraftChange={(fw, sit) => { setFramework(fw); setSituation(sit) }}
          />
        )}

        {screen === 'gym-record' && (
          <RecordScreen
            prompt={situation}
            attemptNumber={1}
            scaffold={framework}
            onSubmit={(input) => analyze(input, 1, 'gym')}
            onCancel={() => setScreen('gym-pick')}
          />
        )}

        {screen === 'gym-feedback' && gymAttempt1 && (
          <GymFeedbackScreen
            framework={framework}
            situation={situation}
            result={gymAttempt1}
            onAgain={() => setScreen('gym-record2')}
            onNewSituation={() => resetGymRound(nextSituation())}
            onHome={reset}
          />
        )}

        {screen === 'gym-record2' && (
          <RecordScreen
            prompt={situation}
            attemptNumber={2}
            scaffold={framework}
            onSubmit={(input) => analyze(input, 2, 'gym')}
            onCancel={() => setScreen('gym-feedback')}
          />
        )}

        {screen === 'gym-delta' && gymAttempt1 && gymAttempt2 && (
          <GymDeltaScreen
            framework={framework}
            situation={situation}
            attempt1={gymAttempt1}
            attempt2={gymAttempt2}
            comparison={gymComparison}
            onNewSituation={() => resetGymRound(nextSituation())}
            onHome={reset}
          />
        )}

        {screen === 'history' && (
          <HistoryScreen
            onBack={closeSide}
            onExport={() => exportSession(loadRecords())}
            onClear={() => { clearSession(); reset() }}
          />
        )}

        {screen === 'about' && <AboutScreen onBack={closeSide} repoUrl={REPO_URL} />}
      </main>
      </ErrorBoundary>

      {tourOpen && screen === 'start' && <Tour steps={tourSteps} onClose={closeTour} />}
      {modeTour && <Tour key={modeTour} steps={modeTourSteps[modeTour]} label={modeTour === 'lab' ? 'Story Lab' : 'Story Gym'} onClose={closeModeTour} />}

      <footer className="footer">
        <span className="footer-links">
          {screen === 'start' && (
            <button className="link-btn" onClick={replayTour}>Show me around</button>
          )}
          <button className="link-btn" onClick={() => openSide('about')}>How it’s built</button>
          <button className="link-btn" onClick={() => openSide('history')}>History</button>
          <a className="link-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer">View source ↗</a>
          <button className="link-btn footer-export" onClick={() => exportSession(loadRecords())}>⬇️ Export</button>
        </span>
      </footer>
    </div>
  )
}
