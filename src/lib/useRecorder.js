import { useEffect, useRef, useState } from 'react'

export const MAX_SECONDS = 180 // hard stop 3:00
export const WARN_SECONDS = 150 // soft warning 2:30
export const MIN_SECONDS = 30 // below this → gentle "too short" nudge

const BAND_COUNT = 12
const ZERO_BANDS = new Array(BAND_COUNT).fill(0)

// States: idle | requesting | denied | recording | stopped | error
// Also exposes `bands`: 12 normalised (0–1) audio levels while recording, so the
// UI can show that the mic is actually capturing — a muted mic otherwise looks
// identical to a working one until the "couldn't make out a story" error.
export function useRecorder({ onStop }) {
  const [status, setStatus] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [bands, setBands] = useState(ZERO_BANDS)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const elapsedRef = useRef(0)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)

  const cleanup = () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setBands(ZERO_BANDS)
  }

  useEffect(() => cleanup, [])

  const startMeter = (stream) => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    try {
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      // Speech energy lives in the low bins; use the first 48 (≈0–8 kHz) so the
      // bars actually move with a voice instead of sitting flat.
      const perBand = 4
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const out = new Array(BAND_COUNT)
        for (let b = 0; b < BAND_COUNT; b++) {
          let sum = 0
          for (let i = 0; i < perBand; i++) sum += data[b * perBand + i]
          out[b] = Math.min(1, (sum / perBand / 255) * 1.6)
        }
        setBands(out)
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // Meter is a nicety; recording works without it.
    }
  }

  const start = async () => {
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      mediaRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        cleanup()
        setStatus('stopped')
        onStop?.(blob, elapsedRef.current)
      }
      rec.start()
      startMeter(stream)
      setElapsed(0)
      elapsedRef.current = 0
      setStatus('recording')
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1
          elapsedRef.current = next
          if (next >= MAX_SECONDS) mediaRef.current?.state === 'recording' && mediaRef.current.stop()
          return next
        })
      }, 1000)
    } catch (err) {
      cleanup()
      setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  const stop = () => {
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
  }

  const cancel = () => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.onstop = null
      mediaRef.current.stop()
    }
    cleanup()
    setStatus('idle')
    setElapsed(0)
    elapsedRef.current = 0
  }

  return { status, elapsed, bands, start, stop, cancel }
}

export function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
