// POST /api/transcribe — server-side STT proxy (keys never touch the browser).
// Provider selected via STT_PROVIDER=mock|deepgram|assemblyai|gemini (PRD §10).
// Body: { audioBase64, mimeType, attemptNumber }
// Returns: { text, words?, provider, raw? }

// Mock transcripts mirror src/lib/stt.js so the demo loop reads the same
// whether requests hit this endpoint or the client-side fallback.
const MOCK_ATTEMPT_1 =
  'So, um, last month I was supposed to run the demo for our biggest client, and, uh, the night before I realized the staging environment was, like, completely broken. I mean, nothing loaded, just a white screen. So I basically started panicking, you know, because the account team had already flown in. Um, I stayed up trying different builds and, uh, kind of rewrote the seed data at two in the morning. And, um, yeah, the morning was pretty stressful, we were all sort of scrambling around trying to figure out what to show them instead.'

const MOCK_ATTEMPT_2 =
  'Last month I was supposed to run the demo for our biggest client, and the night before I found the staging environment completely broken — white screen, nothing loading. The account team had already flown in, so there was no moving the meeting. I stayed up rebuilding the seed data and, um, rehearsed a backup path on my laptop. In the morning I ran the whole demo locally instead. It went so smoothly the client never knew, and we closed the renewal two weeks later. Now I always keep a local fallback ready before any big demo.'

async function deepgram(audioBuffer, mimeType) {
  // filler_words=true is the load-bearing param here: Deepgram strips "um"/"uh"
  // by default, which would silently break Tier-A filler detection downstream.
  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&filler_words=true&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    },
  )
  if (!res.ok) throw new Error(`deepgram ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const alt = data.results?.channels?.[0]?.alternatives?.[0]
  return {
    text: alt?.transcript || '',
    words: alt?.words?.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    provider: 'deepgram',
  }
}

async function assemblyai(audioBuffer) {
  const headers = { authorization: process.env.ASSEMBLYAI_API_KEY }
  const up = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers,
    body: audioBuffer,
  })
  if (!up.ok) throw new Error(`assemblyai upload ${up.status}`)
  const { upload_url } = await up.json()

  const tr = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, disfluencies: true }),
  })
  if (!tr.ok) throw new Error(`assemblyai transcript ${tr.status}`)
  const { id } = await tr.json()

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers })
    const data = await poll.json()
    if (data.status === 'completed') {
      return {
        text: data.text || '',
        words: data.words?.map((w) => ({ word: w.text, start: w.start / 1000, end: w.end / 1000 })),
        provider: 'assemblyai',
      }
    }
    if (data.status === 'error') throw new Error(`assemblyai: ${data.error}`)
  }
  throw new Error('assemblyai: polling timed out')
}

async function geminiSTT(audioBuffer, mimeType) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'Transcribe this audio VERBATIM. Preserve every disfluency: um, uh, er, ' +
                  'false starts, repeated words, filler phrases. Do not clean up or ' +
                  'paraphrase anything. Output only the raw transcript text.',
              },
              { inline_data: { mime_type: mimeType, data: audioBuffer.toString('base64') } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini stt ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '',
    provider: 'gemini',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const { audioBase64, mimeType = 'audio/webm', attemptNumber } = req.body || {}
    const provider = (process.env.STT_PROVIDER || 'mock').toLowerCase()

    if (provider === 'mock' || !audioBase64) {
      const text = Number(attemptNumber) === 2 ? MOCK_ATTEMPT_2 : MOCK_ATTEMPT_1
      return res.status(200).json({ text, provider: 'mock' })
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    let out
    if (provider === 'deepgram') out = await deepgram(audioBuffer, mimeType)
    else if (provider === 'assemblyai') out = await assemblyai(audioBuffer)
    else if (provider === 'gemini') out = await geminiSTT(audioBuffer, mimeType)
    else return res.status(400).json({ error: `unknown STT_PROVIDER: ${provider}` })

    return res.status(200).json(out)
  } catch (err) {
    console.error('[transcribe]', err)
    return res.status(502).json({ error: 'transcription failed' })
  }
}
