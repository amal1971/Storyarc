// Session data model (PRD §12) — local-first, browser-only, exportable JSON.

const STORAGE_KEY = 'storyarc_session_v1'

export function newPairId() {
  return 'pair_' + Math.random().toString(36).slice(2, 8) + '_' + Date.now().toString(36)
}

export function buildAttemptRecord({
  pairId, testerId, attemptNumber, promptId, transcript, wordCount,
  fillerEvents, fillerRateValue, structure, retryStarted, sttProvider,
  mode = 'lab', frameworkId = null, situationId = null, frameworkSteps = null,
  inputMode = 'mic', durationS = null, wpm = null,
  retelling = null, frameworkFeedbackLine = null, provenance = null,
}) {
  return {
    mode,
    framework_id: frameworkId,
    situation_id: situationId,
    framework_steps: frameworkSteps,
    // The retelling is the app's most valuable generated artifact and was
    // previously discarded the moment the screen unmounted. Persisted now so
    // exports double as a review corpus for improving the prompts.
    retelling,
    framework_feedback_line: frameworkFeedbackLine,
    pair_id: pairId,
    tester_id: testerId || null,
    attempt_number: attemptNumber,
    prompt_id: promptId,
    timestamp: new Date().toISOString(),
    // How the words got here — keeps exports honest about provenance.
    input_mode: inputMode, // 'mic' | 'text' | 'sample'
    duration_s: durationS,
    wpm,
    transcript,
    word_count: wordCount,
    filler_events: fillerEvents.map((e) => ({
      token: e.token,
      tier: e.tier,
      category: e.category,
      context: e.context || null,
    })),
    filler_rate: fillerRateValue,
    situation_present: structure?.situation_present ?? null,
    complication_present: structure?.complication_present ?? null,
    outcome_present: structure?.outcome_present ?? null,
    element_count: structure?.element_count ?? null,
    flagged_element: structure?.flagged_element ?? null,
    outcome_connected: structure?.outcome_connected ?? null,
    suggested_fix_text: structure?.suggested_fix ?? null,
    feedback_line: structure?.feedback_line ?? null,
    retry_started: !!retryStarted,
    stt_provider: sttProvider,
    // Which model and which prompt version produced the generated fields, so a
    // bad output can be traced to its cause rather than guessed at.
    provenance,
  }
}

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function persist(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // storage full/blocked — session export still works from memory
  }
}

export function saveRecord(record) {
  const records = loadRecords()
  records.push(record)
  persist(records)
  return records
}

// Merge extra fields into the most recent record for a pair — used to attach
// the cross-attempt comparison verdict to attempt 2 after it comes back.
export function annotatePair(pairId, patch) {
  const records = loadRecords()
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].pair_id === pairId) {
      records[i] = { ...records[i], ...patch }
      persist(records)
      return records[i]
    }
  }
  return null
}

// Group records into rounds (attempt 1 + attempt 2 sharing a pair_id), newest first.
export function loadPairs() {
  const byPair = new Map()
  for (const r of loadRecords()) {
    if (!byPair.has(r.pair_id)) byPair.set(r.pair_id, { pairId: r.pair_id, mode: r.mode, a1: null, a2: null })
    const p = byPair.get(r.pair_id)
    if (r.attempt_number === 2) p.a2 = r
    else p.a1 = r
    p.promptId = r.prompt_id
    p.frameworkId = r.framework_id
    p.timestamp = p.timestamp && p.timestamp > r.timestamp ? p.timestamp : r.timestamp
  }
  return [...byPair.values()].filter((p) => p.a1).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function exportSession(records) {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `storyarc-session-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
