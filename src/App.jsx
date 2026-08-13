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
import { transcribe } from './lib/stt.js'
import { analyzeFillers, analyzeStructure, analyzeFramework, compareAttempts } from './lib/analyze.js'
import { detectTierA, mergeEvents, fillerRate, countWords } from './lib/fillers.js'
import { randomSituation } from './lib/frameworks.js'
import { newPairId, buildAttemptRecord, saveRecord, loadRecords, exportSession } from './lib/session.js'

// Lab loop:  start → lab-pick → record1 → processing → feedback → record2 → processing → delta
// Gym loop:  start → gym-pick → gym-record → processing → gym-feedback
//                 → gym-record2 → processing → gym-delta
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
  const lastBlobRef = useRef(null)

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

  // New situation / new framework run: keep the mode, drop the prior round.
  const resetGymRound = (nextSituation) => {
    setGymAttempt1(null)
    setGymAttempt2(null)
    setGymComparison(null)
    setProcError(null)
    if (nextSituation) setSituation(nextSituation)
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
    pairIdRef.current = newPairId()
    setScreen('gym-record')
  }

  async function runLabAnalysis(blob, attemptNumber) {
    const t = await transcribe(blob, { attemptNumber })
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    const [tierB, structure] = await Promise.all([
      analyzeFillers(t.text),
      analyzeStructure(t.text),
    ])
    const events = mergeEvents(t.text, detectTierA(t.text), tierB.events)
    const analysis = {
      transcript: t.text,
      events,
      eventCount: events.length,
      wordCount,
      fillerRateValue: fillerRate(events.length, wordCount),
      structure,
      sttProvider: t.provider,
      fillerProvider: tierB.provider,
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
    }))
    return { analysis }
  }

  async function runGymAnalysis(blob, attemptNumber) {
    const t = await transcribe(blob, { attemptNumber })
    const wordCount = countWords(t.text)
    if (wordCount < 10) return { gibberish: true }
    const fwAnalysis = await analyzeFramework(t.text, framework.id)
    const events = detectTierA(t.text)
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
      fillerRateValue: fillerRate(events.length, wordCount),
      structure: null,
      sttProvider: t.provider,
    }))
    return {
      result: {
        transcript: t.text,
        analysis: fwAnalysis,
        sttProvider: t.provider,
        events,
        wordCount,
        fillerRateValue: fillerRate(events.length, wordCount),
      },
    }
  }

  async function analyze(blob, attemptNumber, analysisMode = mode) {
    setProcError(null)
    setScreen('processing')
    lastBlobRef.current = { blob, attemptNumber, analysisMode }
    try {
      if (analysisMode === 'gym') {
        const out = await runGymAnalysis(blob, attemptNumber)
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        if (attemptNumber === 1) {
          setGymAttempt1(out.result)
          setScreen('gym-feedback')
        } else {
          setGymAttempt2(out.result)
          setGymComparison(
            await compareAttempts({
              mode: 'gym',
              transcript1: gymAttempt1.transcript,
              transcript2: out.result.transcript,
              frameworkId: framework.id,
              steps1: gymAttempt1.analysis.steps,
            }),
          )
          setScreen('gym-delta')
        }
      } else {
        const out = await runLabAnalysis(blob, attemptNumber)
        if (out.gibberish) return setProcError({ kind: 'gibberish' })
        if (attemptNumber === 1) {
          setAttempt1(out.analysis)
          setScreen('feedback')
        } else {
          setAttempt2(out.analysis)
          setComparison(
            await compareAttempts({
              mode: 'lab',
              transcript1: attempt1.transcript,
              transcript2: out.analysis.transcript,
              suggestedFix: attempt1.structure?.suggested_fix,
            }),
          )
          setScreen('delta')
        }
      }
    } catch (err) {
      console.error(err)
      setProcError({ kind: 'llm' })
    }
  }

  const last = lastBlobRef.current
  const isGymContext = mode === 'gym' || (screen === 'processing' && last?.analysisMode === 'gym')
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

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={reset} aria-label="StoryArc home">
          Story<span className="grad-text">Arc</span> <span className="logo-mic">🎙️</span>
        </button>
        {screen !== 'start' && (
          <nav className="crumbs" aria-label="Progress">
            {crumbs.map((c) => (
              <span key={c.label} className={`crumb ${c.active ? 'active' : ''}`}>{c.label}</span>
            ))}
          </nav>
        )}
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
            onRecorded={(blob) => analyze(blob, 1, 'lab')}
            onCancel={() => setScreen('lab-pick')}
          />
        )}

        {screen === 'processing' && (
          <ProcessingScreen
            variant={last?.analysisMode || 'lab'}
            error={procError}
            onRetry={() => analyze(last.blob, last.attemptNumber, last.analysisMode)}
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
            onRecorded={(blob) => analyze(blob, 2, 'lab')}
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
            onRecorded={(blob) => analyze(blob, 1, 'gym')}
            onCancel={() => setScreen('gym-pick')}
          />
        )}

        {screen === 'gym-feedback' && gymAttempt1 && (
          <GymFeedbackScreen
            framework={framework}
            situation={situation}
            result={gymAttempt1}
            onAgain={() => setScreen('gym-record2')}
            onNewSituation={() => resetGymRound(randomSituation(situation?.id))}
            onHome={reset}
          />
        )}

        {screen === 'gym-record2' && (
          <RecordScreen
            prompt={situation}
            attemptNumber={2}
            scaffold={framework}
            onRecorded={(blob) => analyze(blob, 2, 'gym')}
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
            onNewSituation={() => resetGymRound(randomSituation(situation?.id))}
            onHome={reset}
          />
        )}
      </main>

      <footer className="footer">
        <span>Local-first · no accounts · your recordings never persist</span>
        <button className="link-btn footer-export" onClick={() => exportSession(loadRecords())}>
          ⬇️ Export session data
        </button>
      </footer>
    </div>
  )
}
