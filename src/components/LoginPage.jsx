import { useState } from 'react'
import { LOGIN_BACKDROP_SEEDS } from '../data/decks.js'
import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import {
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  PlayIcon,
} from '../lib/icons.jsx'

const imageSrc = (deck, w = 400, h = 250) => {
  if (deck.image) return deck.image
  const seed = deck.imageSeed || deck.id || deck.title
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/


export default function LoginPage({ onLogin, notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

    if (!EMAIL_RE.test(email.trim())) return fail('Enter a valid email address.')
    if (!password) return fail('Enter your password.')

    await doLogin(email, password)
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
    setPassword('')
    setError('')
  }

  // A sign-in refused because the address is unproven — an account an admin
  // created, or one made before self-registration was taken off this screen.
  // The account exists and the only useful next step is the inbox, so showing
  // the form again would just invite a retry that cannot work.
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
      </header>

      {/* ─── Card ─── */}
      <div className="relative z-10 flex items-center justify-center px-4 min-h-[calc(100vh-4rem)] py-8">
        <div
          className={`w-full max-w-md rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-7 sm:p-9 animate-scale-in ${
            shake ? 'animate-wiggle' : ''
          }`}
        >
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-accent mb-2">
            Welcome back
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Sign in to WIT</h1>
          <p className="text-deck-muted text-sm mt-1.5">
            Pick up where you left off across every deck.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
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
              autoComplete="current-password"
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
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Nothing below the form on purpose. "Continue with Google" was a
              button that only ever produced an apology, and the sign-up link
              offered a way in that this catalog does not want: accounts are
              made by an admin, in Settings → Users. */}
        </div>
      </div>

      {/* Footer note */}
      <div className="relative z-10 text-center text-xs text-white/35 pb-6 px-4">
        Signs in against the WIT API
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
