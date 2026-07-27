import { useState } from 'react'
import { LOGIN_BACKDROP_SEEDS } from '../data/decks.js'
import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
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

// One-click demo sign-in, one account per role, so the role gating is
// immediately visible. Seeded by migrations 000001 + 000003.
const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    email: 'admin@wit.id',
    password: 'admin1234',
    can: 'Decks + users',
    color: '#fb7185',
  },
  {
    role: 'Editor',
    email: 'editor@wit.id',
    password: 'editor1234',
    can: 'Add & remove decks',
    color: '#60a5fa',
  },
  {
    role: 'Viewer',
    email: 'viewer@wit.id',
    password: 'viewer1234',
    can: 'Browse only',
    color: '#8a8a99',
  },
]

export default function LoginPage({ onLogin, notice }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoPending, setDemoPending] = useState(null)
  // Set once registration succeeds — the account exists but cannot sign in yet,
  // so the form is replaced by "check your inbox" rather than cleared.
  const [pendingEmail, setPendingEmail] = useState(null)
  const [resent, setResent] = useState(false)
  // A failed sign-in on an unverified account: same screen, reached the other
  // way round, so it offers the same resend.
  const [needsVerify, setNeedsVerify] = useState(false)

  // A blurred "wall of decks" backdrop, like a streaming-service splash screen.
  // Purely decorative — the images are placeholders keyed off a fixed seed list,
  // so the wall looks identical on every visit without loading the catalog.
  const backdrop = LOGIN_BACKDROP_SEEDS

  const fail = (msg) => {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  // Single sign-in path shared by the form and the demo-account buttons.
  const doLogin = async (emailValue, passwordValue) => {
    setError('')
    setSubmitting(true)
    try {
      const { token, user } = await api.login(emailValue.trim().toLowerCase(), passwordValue)
      onLogin({ ...user, token, remember, since: Date.now() })
    } catch (err) {
      setSubmitting(false)
      setDemoPending(null)
      if (err.code === 'email_not_verified') {
        // Not a credentials problem — the password was right. Offer the inbox,
        // not another attempt at the form.
        setNeedsVerify(true)
        setPendingEmail(emailValue.trim().toLowerCase())
        return
      }
      // A wrong password is the user's problem to fix; anything else is ours
      // to explain, so it goes through the same humanizer as the rest of the app.
      fail(
        err.code === 'unauthorized'
          ? 'That email and password don’t match. Check for typos and try again.'
          : humanizeError(err, { action: 'sign you in' }).message,
      )
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return

    if (mode === 'signup') {
      if (!name.trim()) return fail('Enter your name.')
      if (!EMAIL_RE.test(email.trim())) return fail('Enter a valid email address.')
      if (password.length < 8) return fail('Use at least 8 characters for your password.')

      setError('')
      setSubmitting(true)
      try {
        await api.register(name.trim(), email.trim().toLowerCase(), password)
        // No token comes back: the account is real but unusable until the
        // address is verified, so we show the inbox screen instead of signing in.
        setPendingEmail(email.trim().toLowerCase())
      } catch (err) {
        fail(humanizeError(err, { action: 'create your account' }).message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!EMAIL_RE.test(email.trim())) return fail('Enter a valid email address.')
    if (!password) return fail('Enter your password.')

    await doLogin(email, password)
  }

  const signInAsDemo = async (account) => {
    if (submitting) return
    // Mirror the credentials into the form so it's clear what was used.
    setEmail(account.email)
    setPassword(account.password)
    setDemoPending(account.role)
    await doLogin(account.email, account.password)
  }

  const resendVerification = async () => {
    if (!pendingEmail) return
    try {
      await api.resendVerification(pendingEmail)
    } catch {
      // The endpoint answers 204 for every address by design; a transport
      // hiccup shouldn't contradict that with a scary message.
    }
    setResent(true)
  }

  const backToSignIn = () => {
    setPendingEmail(null)
    setNeedsVerify(false)
    setResent(false)
    setMode('signin')
    setPassword('')
  }

  const continueAsGuest = () => {
    if (submitting) return
    setSubmitting(true)
    setTimeout(
      () => onLogin({ name: 'Guest', email: null, guest: true, since: Date.now() }),
      250,
    )
  }


  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  // Registration succeeded, or a sign-in was refused because the address is
  // unproven. Both land here: the account exists and the only useful next step
  // is the inbox, so showing the form again would just invite a retry that
  // cannot work.
  if (pendingEmail) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 bg-deck-bg text-white">
        <div className="w-full max-w-md text-center animate-scale-in">
          <span className="text-deck-accent font-black text-3xl tracking-tighter">WIT</span>

          <span className="mt-8 mx-auto flex items-center justify-center w-14 h-14 rounded-full bg-deck-accent/15 text-deck-accent">
            <MailIcon size={26} />
          </span>

          <h1 className="text-2xl font-black tracking-tight mt-4">
            {needsVerify ? 'Verify your email to continue' : 'Check your inbox'}
          </h1>
          <p className="text-sm text-deck-muted mt-2 leading-relaxed">
            {needsVerify
              ? 'That password is right — this account just needs its email confirmed first. We sent a link to'
              : 'We sent a verification link to'}{' '}
            <span className="text-white font-semibold">{pendingEmail}</span>. Open it to activate
            your account.
          </p>

          <div className="mt-6 rounded-xl bg-white/5 border border-deck-border p-4 text-left">
            <div className="text-[11px] uppercase tracking-widest font-bold text-deck-muted mb-1">
              Not there?
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Give it a minute, then check spam. The link is good for 24 hours.
            </p>
          </div>

          {resent ? (
            <p className="text-sm text-emerald-400 mt-4 animate-fade-in">
              Sent — a new link is on its way.
            </p>
          ) : (
            <button
              onClick={resendVerification}
              className="mt-4 w-full px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold transition-colors"
            >
              Resend the link
            </button>
          )}

          <button
            onClick={backToSignIn}
            className="mt-4 text-sm text-white/60 hover:text-white underline underline-offset-4 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-deck-bg text-white">
      {/* ─── Backdrop: blurred wall of deck covers ─── */}
      <div className="absolute inset-0 -z-10">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-2 scale-110 blur-[2px] opacity-40">
          {backdrop.map((seed, i) => (
            <div
              key={`${seed}-${i}`}
              className="aspect-deck rounded-md overflow-hidden bg-deck-card"
            >
              <img
                src={imageSrc({ imageSeed: seed })}
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

            {/* Why you're suddenly back at the login screen. Amber, not red —
                nothing went wrong, a session simply ran out. It steps aside as
                soon as there's a real error to show. */}
            {notice && !error && (
              <div className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 animate-fade-in">
                <div className="font-bold text-amber-300">{notice.title}</div>
                <div className="text-amber-200/80 text-xs mt-0.5 leading-relaxed">{notice.message}</div>
              </div>
            )}

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
              <span className="text-white/35 text-xs">
                Accounts are provisioned by an admin
              </span>
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

          {/* Demo accounts — one click per role, no typing required. */}
          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-widest text-white/40 whitespace-nowrap">
              or try a demo account
            </span>
            <span className="flex-1 h-px bg-white/10" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                type="button"
                onClick={() => signInAsDemo(account)}
                disabled={submitting}
                title={`${account.email} · ${account.password}`}
                className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {demoPending === account.role ? (
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: account.color }}
                    />
                  )}
                  {account.role}
                </span>
                <span className="text-[10px] text-white/45 leading-tight text-center">
                  {account.can}
                </span>
              </button>
            ))}
          </div>

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
        Signs in against the WIT API · demo passwords are{' '}
        <span className="text-white/60">admin1234</span> /{' '}
        <span className="text-white/60">editor1234</span> /{' '}
        <span className="text-white/60">viewer1234</span>
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
