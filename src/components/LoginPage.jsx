import { useMemo, useState } from 'react'
import { MOCK_DECKS } from '../data/decks.js'
import { api } from '../lib/api.js'
import {
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  GoogleIcon,
  PlayIcon,
} from '../lib/icons.jsx'

const imageSrc = (deck, w = 400, h = 250) => {
  if (deck.image) return deck.image
  const seed = deck.imageSeed || deck.id || deck.title
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // A blurred "wall of decks" backdrop, like a streaming-service splash screen.
  const backdrop = useMemo(() => {
    const pool = MOCK_DECKS.filter((d) => !d.featured)
    const picks = []
    for (let i = 0; picks.length < 24 && i < pool.length * 2; i++) {
      picks.push(pool[i % pool.length])
    }
    return picks
  }, [])

  const fail = (msg) => {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return

    // The backend has no public registration — accounts are provisioned by an
    // admin. Guide the user to sign in instead.
    if (mode === 'signup') {
      return fail('New accounts are created by an admin. Ask your admin to add you, then sign in.')
    }

    if (!EMAIL_RE.test(email.trim())) return fail('Enter a valid email address.')
    if (!password) return fail('Enter your password.')

    setError('')
    setSubmitting(true)
    try {
      const { token, user } = await api.login(email.trim().toLowerCase(), password)
      onLogin({ ...user, token, remember, since: Date.now() })
    } catch (err) {
      setSubmitting(false)
      fail(err.code === 'unauthorized' ? 'Incorrect email or password.' : err.message)
    }
  }

  const continueAsGuest = () => {
    if (submitting) return
    setSubmitting(true)
    setTimeout(
      () => onLogin({ name: 'Guest', email: null, guest: true, since: Date.now() }),
      250,
    )
  }

  const useDemoAdmin = () => {
    setEmail('admin@wit.id')
    setPassword('admin1234')
    setError('')
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-deck-bg text-white">
      {/* ─── Backdrop: blurred wall of deck covers ─── */}
      <div className="absolute inset-0 -z-10">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-2 scale-110 blur-[2px] opacity-40">
          {backdrop.map((deck, i) => (
            <div
              key={`${deck.id}-${i}`}
              className="aspect-deck rounded-md overflow-hidden bg-deck-card"
            >
              <img
                src={imageSrc(deck)}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
        {/* Vignette + brand wash for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-deck-bg via-deck-bg/85 to-deck-bg/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-deck-bg/90 via-transparent to-deck-bg/90" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, rgba(229,9,20,0.18) 0%, transparent 55%)',
          }}
        />
      </div>

      {/* ─── Brand bar ─── */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 h-16">
        <span className="text-deck-accent font-black text-2xl md:text-3xl tracking-tighter">
          WIT
        </span>
        <button
          onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-sm text-white/70 hover:text-white transition-colors"
        >
          {mode === 'signin' ? 'Create account' : 'Sign in'}
        </button>
      </header>

      {/* ─── Card ─── */}
      <div className="relative z-10 flex items-center justify-center px-4 min-h-[calc(100vh-4rem)] py-8">
        <div
          className={`w-full max-w-md rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-7 sm:p-9 animate-scale-in ${
            shake ? 'animate-wiggle' : ''
          }`}
        >
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-accent mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Get started'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            {mode === 'signin' ? 'Sign in to WIT' : 'Create your account'}
          </h1>
          <p className="text-deck-muted text-sm mt-1.5">
            {mode === 'signin'
              ? 'Pick up where you left off across every deck.'
              : 'Unlock the full catalog and your own library.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === 'signup' && (
              <Field
                icon={<UserIcon size={18} />}
                type="text"
                placeholder="Full name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
            )}
            <Field
              icon={<MailIcon size={18} />}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Field
              icon={<LockIcon size={18} />}
              type={showPw ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="text-white/40 hover:text-white/80 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              }
            />

            {error && (
              <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 animate-fade-in">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-1 text-sm">
              <button
                type="button"
                onClick={() => setRemember((r) => !r)}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                    remember
                      ? 'bg-deck-accent border-deck-accent text-white'
                      : 'border-white/30'
                  }`}
                >
                  {remember && <CheckIcon size={12} />}
                </span>
                Remember me
              </button>
              <button
                type="button"
                onClick={useDemoAdmin}
                className="text-white/50 hover:text-white transition-colors"
              >
                Use demo admin
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim disabled:opacity-70 font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-deck-accent/30 hover:shadow-deck-accent/60 hover:-translate-y-px active:translate-y-0"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <PlayIcon size={16} />
                  {mode === 'signin' ? 'Sign In' : 'Create account'}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-white/10" />
            <span className="text-xs uppercase tracking-widest text-white/40">or</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>

          {/* Alt actions */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => fail('Social sign-in is mocked in this demo. Use email or continue as guest.')}
              className="w-full h-11 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors"
            >
              <GoogleIcon size={18} />
              Continue with Google
            </button>
            <button
              type="button"
              onClick={continueAsGuest}
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-transparent hover:bg-white/5 border border-dashed border-white/15 hover:border-white/30 text-sm text-white/80 hover:text-white font-semibold transition-colors disabled:opacity-60"
            >
              Continue as guest
            </button>
          </div>

          {/* Mode toggle */}
          <p className="text-center text-sm text-deck-muted mt-6">
            {mode === 'signin' ? "New to WIT?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-white font-semibold hover:text-deck-accent transition-colors"
            >
              {mode === 'signin' ? 'Sign up now' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      {/* Footer note */}
      <div className="relative z-10 text-center text-xs text-white/35 pb-6 px-4">
        Signs in against the WIT API · demo admin{' '}
        <span className="text-white/60">admin@wit.id</span> /{' '}
        <span className="text-white/60">admin1234</span>
      </div>
    </div>
  )
}

function Field({ icon, trailing, value, onChange, ...rest }) {
  return (
    <label className="group flex items-center gap-3 h-12 px-3.5 rounded-lg bg-white/5 border border-white/10 focus-within:border-deck-accent/70 focus-within:bg-white/[0.07] transition-colors">
      <span className="text-white/40 group-focus-within:text-deck-accent transition-colors">
        {icon}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/40 text-white"
      />
      {trailing}
    </label>
  )
}
