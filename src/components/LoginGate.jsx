import { useEffect, useRef, useState } from 'react'
import { loginWithGoogle } from '../lib/auth.js'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function limitLabel(mins) {
  if (!mins) return 'a limited number of minutes'
  return `${mins} minute${mins === 1 ? '' : 's'}`
}

export function LoginGate({ locked = false, lockedEmail = null, onAuthenticated }) {
  const buttonRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [lockedNow, setLockedNow] = useState(locked)
  const [lockedAs, setLockedAs] = useState(lockedEmail)
  const [gsiFailed, setGsiFailed] = useState(false)
  // Read the real allowance from the server rather than hardcoding it, so the
  // copy always matches USAGE_LIMIT_MINUTES in Vercel.
  const [limitMins, setLimitMins] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (live && h?.usageLimitMinutes > 0) setLimitMins(h.usageLimitMinutes) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return
    let cancelled = false

    // The GSI script is async/defer, so it may not have defined window.google
    // by the time this mounts. Poll briefly rather than racing it.
    // Give up after ~8 s: blockers and some in-app browsers (LinkedIn's) never
    // load Google's script, which used to leave an empty box with no explanation.
    const startedAt = Date.now()
    const tryRender = () => {
      if (cancelled) return
      const id = window.google?.accounts?.id
      if (!id) {
        if (Date.now() - startedAt > 8000) return setGsiFailed(true)
        return setTimeout(tryRender, 120)
      }
      setGsiFailed(false)
      id.initialize({
        client_id: CLIENT_ID,
        callback: async (response) => {
          setStatus('signing')
          setError(null)
          try {
            const session = await loginWithGoogle(response.credential)
            onAuthenticated(session)
          } catch (err) {
            if (err.status === 403) {
              setLockedAs(err.email)
              setLockedNow(true)
            } else if (err.code === 'storage_not_configured' || err.code === 'auth_not_configured') {
              setError('Sign-in isn’t finished being set up on the server yet.')
            } else {
              setError('That sign-in didn’t go through. Try again.')
            }
            setStatus('idle')
          }
        },
      })
      id.renderButton(buttonRef.current, { theme: 'outline', size: 'large', shape: 'pill' })
    }
    tryRender()

    return () => { cancelled = true }
  }, [onAuthenticated])

  if (!CLIENT_ID) {
    return (
      <div className="screen gate">
        <h1 className="screen-title">Sign-in isn’t configured</h1>
        <p className="screen-sub">
          Set <code>VITE_GOOGLE_CLIENT_ID</code> (and <code>GOOGLE_CLIENT_ID</code> server-side)
          in <code>.env.local</code>, then restart the dev server. See <code>.env.example</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="screen gate">
      <h1 className="screen-title">
        {lockedNow ? 'That account’s time is used up' : 'Sign in to start practising'}
      </h1>

      {lockedNow ? (
        <p className="screen-sub">
          {lockedAs ? <><strong>{lockedAs}</strong> has</> : 'This account has'} used its full{' '}
          {limitLabel(limitMins)} of StoryArc. There’s no reset — it’s a lifetime allowance per account.
          You can sign in with a different Google account below.
        </p>
      ) : (
        <>
          <p className="screen-sub gate-pitch">
            Tell a short story out loud. StoryArc highlights your filler words, shows whether your
            story sets a scene, hits a problem and lands an ending — then you tell it again and see
            exactly what improved.
          </p>
          <p className="screen-sub">
            It’s a free public demo, so each Google account gets a lifetime total of{' '}
            {limitLabel(limitMins)}, counting from the moment you sign in.
          </p>
        </>
      )}

      <div className="gate-panel">
        <div ref={buttonRef} className="gate-button" />
        {gsiFailed && (
          <p className="gate-error">
            Google sign-in didn’t load here. If you opened this inside an app (like LinkedIn),
            open the link in Chrome or Safari instead — or turn off any blocker for this page.
          </p>
        )}
        {status === 'signing' && <p className="gate-note">Checking your account…</p>}
        {error && <p className="gate-error">{error}</p>}
      </div>

      <p className="gate-fineprint">
        We store your email address, your Google account ID, and how much time and how many analyses you’ve used — nothing else.
        Your recording goes to Deepgram (speech-to-text) and the text to Google’s Gemini AI for analysis; StoryArc keeps neither. Your practice history stays in this browser.
      </p>
    </div>
  )
}
