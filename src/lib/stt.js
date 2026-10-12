// STT provider abstraction (PRD §10).
// The app consumes only Transcript.text (+ optional words). Provider is picked
// server-side via env; the client just POSTs audio to /api/transcribe.
//
// Zero-key demo mode is decided by the SERVER (STT_PROVIDER=mock returns the
// canned transcripts with provider: 'mock'). The client never substitutes the
// demo story on its own: a failed transcription used to quietly replace the
// user's real recording with "our biggest client…", which the live model then
// coached them on. A failure now throws, and the UI offers a retry.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

async function serverTranscribe(audioBlob, options = {}) {
  const audioBase64 = await blobToBase64(audioBlob)
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
      attemptNumber: options.attemptNumber || 1,
    }),
  })
  if (!res.ok) {
    let info = {}
    try { info = await res.json() } catch { /* non-JSON error body */ }
    throw sttError(`transcribe failed: ${res.status} ${info.error || ''}`.trim(), {
      status: res.status,
      retryable: info.retryable !== false,
      reason: info.reason || null,
    })
  }
  const data = await res.json()
  if (!data || typeof data.text !== 'string') throw sttError('bad transcript payload', { retryable: true })
  return data
}

function sttError(message, { status, retryable, reason = null }) {
  const err = new Error(message)
  err.stage = 'stt'
  err.status = status
  err.retryable = retryable
  err.reason = reason
  return err
}

// Public entry point. Throws on any failure — see the note at the top.
export async function transcribe(audioBlob, options = {}) {
  try {
    return await serverTranscribe(audioBlob, options)
  } catch (err) {
    if (err.stage === 'stt') throw err
    // Network-level failure (offline, DNS, aborted).
    throw sttError(`transcribe unreachable: ${err.message}`, { retryable: true })
  }
}
