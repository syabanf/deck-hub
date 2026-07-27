import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { CheckIcon, CloseIcon } from '../lib/icons.jsx'

// Landing page for the link in the verification email: /verify?token=…
//
// Redeems the token on mount and signs the user in. Shown before the login gate
// so someone arriving from their inbox never sees a sign-in form first — they
// clicked a link to finish signing up, not to log in.

export default function VerifyPage({ token, onVerified, onDone }) {
  const [state, setState] = useState('working') // 'working' | 'ok' | 'failed'
  const [error, setError] = useState(null)
  const [resent, setResent] = useState(false)
  const [email, setEmail] = useState('')

  // React 18 StrictMode mounts effects twice in development. Without this the
  // second run redeems an already-burned single-use token and reports failure
  // over a success that actually happened.
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    if (!token) {
      setError({
        title: 'That link looks incomplete',
        message: 'It’s missing its verification code. Copy the whole link from the email, or ask for a new one.',
      })
      setState('failed')
      return
    }

    api
      .verifyEmail(token)
      .then(({ token: jwt, user }) => {
        setState('ok')
        // A beat on the success state before the app loads, so the outcome is
        // legible rather than a flash.
        setTimeout(() => onVerified({ ...user, token: jwt, since: Date.now() }), 1200)
      })
      .catch((e) => {
        setError(humanizeError(e, { action: 'verify your email' }))
        setState('failed')
      })
  }, [token, onVerified])

  const resend = async () => {
    if (!email.trim()) return
    try {
      await api.resendVerification(email.trim())
    } catch {
      // Resend answers 204 for every address by design; a transport failure
      // still shouldn't contradict that with an error message here.
    }
    setResent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-deck-bg text-white">
      <div className="w-full max-w-md text-center">
        <span className="text-deck-accent font-black text-3xl tracking-tighter">WIT</span>

        {state === 'working' && (
          <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in">
            <span className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <h1 className="text-xl font-black tracking-tight">Verifying your email…</h1>
            <p className="text-sm text-deck-muted">This only takes a moment.</p>
          </div>
        )}

        {state === 'ok' && (
          <div className="mt-8 flex flex-col items-center gap-4 animate-scale-in">
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckIcon size={28} />
            </span>
            <h1 className="text-2xl font-black tracking-tight">You’re all set</h1>
            <p className="text-sm text-deck-muted">
              Your email is confirmed. Taking you into WIT…
            </p>
          </div>
        )}

        {state === 'failed' && (
          <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in">
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-rose-500/20 text-rose-400">
              <CloseIcon size={26} />
            </span>
            <h1 className="text-2xl font-black tracking-tight">{error?.title}</h1>
            <p className="text-sm text-deck-muted leading-relaxed max-w-sm">{error?.message}</p>

            {resent ? (
              <p className="text-sm text-emerald-400 mt-2 animate-fade-in">
                If that address is waiting to be verified, a new link is on its way.
              </p>
            ) : (
              <div className="w-full mt-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/35 focus:outline-none focus:border-white/40"
                  />
                  <button
                    onClick={resend}
                    disabled={!email.trim()}
                    className="px-4 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold disabled:opacity-40 transition-colors"
                  >
                    Resend
                  </button>
                </div>
                <p className="text-xs text-white/35 mt-2">
                  Enter the address you signed up with and we’ll send a fresh link.
                </p>
              </div>
            )}

            <button
              onClick={onDone}
              className="mt-4 text-sm text-white/60 hover:text-white underline underline-offset-4 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
