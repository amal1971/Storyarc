import { useRef, useState } from 'react'
import { StartScreen } from './components/StartScreen.jsx'
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

  const mode = screen.startsWith('gym') ? 'gym' : 'lab'

  const reset = () => {
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

  async function runLabAnalysis(input, attemptNumber) {
    const t = await getTranscript(input, attemptNumber)
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    const [tierB, structure] = await Promise.all([
      analyzeFillers(t.text),
      analyzeStructure(t.text),
    ])
    const events = mergeEvents(t.text, detectDeterministic(t.text), tierB.events)
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
    saveRecord(buildAttemptRecord({
      pairId: pairIdRef.current,
      attemptNumber,
      promptId: prompt.id,
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
    }))
    return { analysis }
  }

  async function runGymAnalysis(input, attemptNumber) {
    const t = await getTranscript(input, attemptNumber)
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    const fwAnalysis = await analyzeFramework(t.text, framework.id)
    const events = detectDeterministic(t.text)
    const durationS = input.seconds ?? null
    const wpm = wordsPerMinute(wordCount, durationS)
    const inputMode = input.inputMode || 'mic'
    const fillerRateValue = fillerRate(events.length, wordCount)
    saveRecord(buildAttemptRecord({
      mode: 'gym',
      frameworkId: framework.id,
      situationId: situation.id,
      frameworkSteps: fwAnalysis.steps,
      pairId: pairIdRef.current,
      attemptNumber,
      promptId: situation.id,
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
    lastInputRef.current = { input, attemptNumber, analysisMode }
    try {
      if (analysisMode === 'gym') {
        const out = await runGymAnalysis(input, attemptNumber)
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        if (attemptNumber === 1) {
          setGymAttempt1(out.result)
          setScreen('gym-feedback')
        } else {
          setGymAttempt2(out.result)
          const cmp = await compareAttempts({
            mode: 'gym',
            transcript1: gymAttempt1.transcript,
            transcript2: out.result.transcript,
            frameworkId: framework.id,
            steps1: gymAttempt1.analysis.steps,
          })
          setGymComparison(cmp)
          annotatePair(pairIdRef.current, { fix_addressed: cmp.fix_addressed, comparison_headline: cmp.headline })
          setScreen('gym-delta')
        }
      } else {
        const out = await runLabAnalysis(input, attemptNumber)
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        if (attemptNumber === 1) {
          setAttempt1(out.analysis)
          setScreen('feedback')
        } else {
          setAttempt2(out.analysis)
          const cmp = await compareAttempts({
            mode: 'lab',
            transcript1: attempt1.transcript,
            transcript2: out.analysis.transcript,
            suggestedFix: attempt1.structure?.suggested_fix,
          })
          setComparison(cmp)
          annotatePair(pairIdRef.current, { fix_addressed: cmp.fix_addressed, comparison_headline: cmp.headline })
          setScreen('delta')
        }
      }
    } catch (err) {
      console.error(err)
      setProcError({ kind: 'llm' })
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

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={reset} aria-label="StoryArc home">
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
      </header>

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
            onBack={reset}
            onExport={() => exportSession(loadRecords())}
            onClear={() => { clearSession(); setScreen('start') }}
          />
        )}

        {screen === 'about' && <AboutScreen onBack={reset} repoUrl={REPO_URL} />}
      </main>

      <footer className="footer">
        <span>Local-first · no accounts · audio never leaves your device · transcripts stay in this browser</span>
        <span className="footer-links">
          <button className="link-btn" onClick={() => setScreen('about')}>How it’s built</button>
          <button className="link-btn" onClick={() => setScreen('history')}>History</button>
          <a className="link-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer">View source ↗</a>
          <button className="link-btn footer-export" onClick={() => exportSession(loadRecords())}>⬇️ Export</button>
        </span>
      </footer>
    </div>
  )
}
