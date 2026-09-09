// Bundled sample recordings so a visitor with no microphone (or no patience for
// permission prompts) can push real audio through the REAL Deepgram → Gemini
// pipeline with one click. These are synthesized voice clips shipped as static
// assets; durations are baked in because the browser never "records" them.
export const SAMPLES = {
  lab1: {
    id: 'lab1',
    file: '/samples/lab1.m4a',
    mimeType: 'audio/mp4',
    seconds: 40,
    label: 'a first telling — fillers and no ending',
  },
  lab2: {
    id: 'lab2',
    file: '/samples/lab2.m4a',
    mimeType: 'audio/mp4',
    seconds: 34,
    label: 'a cleaner retelling with an ending',
  },
  gym: {
    id: 'gym',
    file: '/samples/gym.m4a',
    mimeType: 'audio/mp4',
    seconds: 35,
    label: 'a story with a clear turn',
  },
}

// Which clip fits which screen.
export function sampleFor({ attemptNumber, gym }) {
  if (gym) return SAMPLES.gym
  return attemptNumber === 2 ? SAMPLES.lab2 : SAMPLES.lab1
}

export async function loadSampleBlob(sample) {
  const res = await fetch(sample.file)
  if (!res.ok) throw new Error(`sample ${sample.id} failed: ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Blob([buf], { type: sample.mimeType })
}
