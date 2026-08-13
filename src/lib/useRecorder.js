import { useEffect, useRef, useState } from 'react'

export const MAX_SECONDS = 180 // hard stop 3:00
export const WARN_SECONDS = 150 // soft warning 2:30
export const MIN_SECONDS = 30 // below this → gentle "too short" nudge

// States: idle | requesting | denied | recording | stopped | error
export function useRecorder({ onStop }) {
  const [status, setStatus] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const elapsedRef = useRef(0)

  const cleanup = () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => cleanup, [])

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

  return { status, elapsed, start, stop, cancel }
}

export function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
