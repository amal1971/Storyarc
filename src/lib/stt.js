// STT provider abstraction (PRD §10).
// The app consumes only Transcript.text (+ optional words). Provider is picked
// server-side via env; the client just POSTs audio to /api/transcribe and falls
// back to MockProvider when no backend is reachable (local dev, Milestone Zero).

// Two mock transcripts so the full attempt-1 → attempt-2 → delta loop can be
// demoed with zero API dependency. Attempt 1 is fillery and has no outcome;
// attempt 2 is cleaner and lands an ending.
const MOCK_ATTEMPT_1 =
  'So, um, last month I was supposed to run the demo for our biggest client, and, uh, the night before I realized the staging environment was, like, completely broken. I mean, nothing loaded, just a white screen. So I basically started panicking, you know, because the account team had already flown in. Um, I stayed up trying different builds and, uh, kind of rewrote the seed data at two in the morning. And, um, yeah, the morning was pretty stressful, we were all sort of scrambling around trying to figure out what to show them instead.'

const MOCK_ATTEMPT_2 =
  'Last month I was supposed to run the demo for our biggest client, and the night before I found the staging environment completely broken — white screen, nothing loading. The account team had already flown in, so there was no moving the meeting. I stayed up rebuilding the seed data and, um, rehearsed a backup path on my laptop. In the morning I ran the whole demo locally instead. It went so smoothly the client never knew, and we closed the renewal two weeks later. Now I always keep a local fallback ready before any big demo.'

export const MockProvider = {
  name: 'mock',
  async transcribe(_audioBlob, options = {}) {
    // Simulate real STT latency so the processing screen is honest.
    await new Promise((r) => setTimeout(r, 1400))
    const text = options.attemptNumber === 2 ? MOCK_ATTEMPT_2 : MOCK_ATTEMPT_1
    return { text, words: undefined, provider: 'mock', raw: null }
  },
}

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
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`)
  const data = await res.json()
  if (!data || typeof data.text !== 'string') throw new Error('bad transcript payload')
  return data
}

// Public entry point. Tries the serverless endpoint; degrades to MockProvider.
export async function transcribe(audioBlob, options = {}) {
  try {
    return await serverTranscribe(audioBlob, options)
  } catch (err) {
    console.warn('[stt] falling back to MockProvider:', err.message)
    return MockProvider.transcribe(audioBlob, options)
  }
}
