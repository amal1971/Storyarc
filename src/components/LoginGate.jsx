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
    const tryRender = () => {
      if (cancelled) return
      const id = window.google?.accounts?.id
      if (!id) return setTimeout(tryRender, 120)
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
        <p className="screen-sub">
          StoryArc is a public demo, so each Google account gets a lifetime total of{' '}
          {limitLabel(limitMins)} — it counts down from the moment you sign in.
        </p>
      )}

      <div className="gate-panel">
        <div ref={buttonRef} className="gate-button" />
        {status === 'signing' && <p className="gate-note">Checking your account…</p>}
        {error && <p className="gate-error">{error}</p>}
      </div>

      <p className="gate-fineprint">
        We store your Google account id and how many seconds you’ve used — nothing else.
        Recordings are transcribed and analysed by our AI providers but never stored on our servers; your practice history stays in this browser.
      </p>
    </div>
  )
}
