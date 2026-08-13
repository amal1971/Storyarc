// Session data model (PRD §12) — local-first, browser-only, exportable JSON.

const STORAGE_KEY = 'storyarc_session_v1'

export function newPairId() {
  return 'pair_' + Math.random().toString(36).slice(2, 8) + '_' + Date.now().toString(36)
}

export function buildAttemptRecord({
  pairId, testerId, attemptNumber, promptId, transcript, wordCount,
  fillerEvents, fillerRateValue, structure, retryStarted, sttProvider,
  mode = 'lab', frameworkId = null, situationId = null, frameworkSteps = null,
}) {
  return {
    mode,
    framework_id: frameworkId,
    situation_id: situationId,
    framework_steps: frameworkSteps,
    pair_id: pairId,
    tester_id: testerId || null,
    attempt_number: attemptNumber,
    prompt_id: promptId,
    timestamp: new Date().toISOString(),
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
  }
}

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveRecord(record) {
  const records = loadRecords()
  records.push(record)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // storage full/blocked — session export still works from memory
  }
  return records
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
