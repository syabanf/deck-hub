import { useEffect, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'

// The signed-in account's own page: who they are, what they have added, and
// the one thing only they can change.
export default function ProfilePage({ user }) {
  const [me, setMe] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (user?.guest) return
    api.getMe().then(setMe).catch(setLoadError)
  }, [user])

  // A guest has no account to show. Saying so beats an empty page or a
  // spinner that never resolves.
  if (user?.guest) {
    return (
      <div className="rounded-xl bg-deck-card border border-deck-border px-5 py-8 text-center">
        <p className="font-semibold">You are browsing as a guest</p>
        <p className="text-sm text-deck-muted mt-1">
          Sign in with an account to see a profile and change a password.
        </p>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setNotice(null)
    if (next !== confirm) {
      setNotice({ ok: false, text: 'The two new passwords do not match.' })
      return
    }
    setSaving(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setNotice({ ok: true, text: 'Password changed. It applies the next time you sign in.' })
    } catch (err) {
      // The API's own message is the useful one here: it distinguishes a wrong
      // current password from a new one that is too short, and the person
      // typing needs to know which.
      setNotice({ ok: false, text: err?.message || humanizeError(err, { action: 'change your password' }).message })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm'

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 items-start">
      <div className="rounded-xl bg-deck-card border border-deck-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-deck-accent/20 border border-deck-accent/40 grid place-items-center text-xl font-black">
            {(me?.name || user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{me?.name || user?.name}</div>
            <div className="text-sm text-deck-muted truncate">{me?.email || user?.email}</div>
          </div>
        </div>

        {loadError && (
          <p className="mt-4 text-sm text-red-300">
            {humanizeError(loadError, { action: 'load your profile' }).message}
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Role" value={me?.role || user?.role || '—'} />
          <Stat label="Status" value={me?.status || '—'} />
          <Stat label="Decks added" value={me ? me.deckCount : '—'} />
          <Stat label="Joined" value={me?.createdAt ? String(me.createdAt).slice(0, 10) : '—'} />
        </dl>

        {me?.deckCount === 0 && (
          <p className="mt-4 text-[11px] text-deck-muted leading-snug">
            Decks added before this catalog started recording who added them are
            attributed to nobody, so an early contributor can still read zero here.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="rounded-xl bg-deck-card border border-deck-border p-5">
        <h3 className="font-bold">Change your password</h3>
        <p className="text-xs text-deck-muted mt-1 mb-4">
          You are asked for the current one because a signed-in session on its own
          should not be enough to take over the account.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
              Current password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={`mt-1 ${field}`}
              required
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={`mt-1 ${field}`}
              minLength={8}
              required
            />
            <span className="block text-[11px] text-deck-muted mt-1">At least 8 characters.</span>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
              Repeat the new password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`mt-1 ${field}`}
              required
            />
          </label>
        </div>

        {notice && (
          <p className={`mt-4 text-sm ${notice.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {notice.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !current || !next || !confirm}
          className="mt-4 px-4 h-9 rounded-lg bg-deck-accent font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-widest text-deck-muted">{label}</dt>
      <dd className="text-lg font-black mt-0.5 capitalize">{value}</dd>
    </div>
  )
}
