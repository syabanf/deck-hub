import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { copyToClipboard } from '../lib/share.js'
import { PlusIcon, TrashIcon, SearchIcon } from '../lib/icons.jsx'

const blank = {
  name: '', category: '', url: '', username: '', password: '',
  notes: '', environment: '', status: '',
}

// The PIN lives in sessionStorage, so it lasts the tab and no longer. A gate
// that survives closing the browser is a gate that stops meaning anything.
const PIN_KEY = 'wit.demoPin'
const loadPin = () => {
  try { return sessionStorage.getItem(PIN_KEY) || '' } catch { return '' }
}
const savePin = (pin) => {
  try { sessionStorage.setItem(PIN_KEY, pin) } catch { /* private mode */ }
}
const clearPin = () => {
  try { sessionStorage.removeItem(PIN_KEY) } catch { /* private mode */ }
}

const ENVIRONMENT_COLOR = {
  Confidential: '#f87171',
  Production: '#34d399',
  'Demo WIT': '#c084fc',
  Development: '#60a5fa',
}

// The credentials for WIT's own product demos, with one click to copy each
// field into whatever form is asking for it.
export default function DemoCenter({ canEdit = false, onNotify }) {
  const [pin, setPin] = useState(loadPin)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(null)
  const [demos, setDemos] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [draft, setDraft] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)

  const load = useCallback(async () => {
    if (!pin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setDemos(await api.listDemos(pin))
    } catch (e) {
      // A PIN the server rejects sends us back to the gate rather than showing
      // an error over an empty page. It can go stale on its own: an admin
      // changing it invalidates every tab still holding the old one.
      if (e?.code === 'demo_pin_required') {
        clearPin()
        setPin('')
        setPinError('That PIN is no longer accepted. Ask an admin for the current one.')
      } else {
        setError(e)
      }
    } finally {
      setLoading(false)
    }
  }, [pin])

  useEffect(() => {
    load()
  }, [load])

  const submitPin = async (e) => {
    e.preventDefault()
    setPinError(null)
    const entered = pinInput.trim()
    if (!entered) return
    try {
      // Verified against the server before it is kept, so a wrong PIN is
      // rejected here rather than looking accepted until the list comes back
      // empty.
      await api.listDemos(entered)
      savePin(entered)
      setPin(entered)
      setPinInput('')
    } catch (err) {
      if (err?.code === 'demo_pin_required') setPinError('That PIN is not right.')
      else setPinError(err?.message || humanizeError(err, { action: 'check that PIN' }).message)
    }
  }

  // Filtered here rather than by refetching: the whole list is small, and a
  // request per keystroke against a page of credentials is more traffic than
  // the search is worth.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return demos
    return demos.filter((d) =>
      [d.name, d.category, d.username, d.notes, d.environment].some((v) =>
        (v || '').toLowerCase().includes(q),
      ),
    )
  }, [demos, search])

  const startNew = () => {
    setDraft(blank)
    setEditing('new')
    setError(null)
  }

  const startEdit = (d) => {
    setDraft({
      name: d.name, category: d.category, url: d.url,
      username: d.username, password: d.password, notes: d.notes,
      environment: d.environment, status: d.status,
    })
    setEditing(d.id)
    setError(null)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing === 'new') await api.createDemo(pin, draft)
      else await api.updateDemo(pin, editing, draft)
      setEditing(null)
      setDraft(blank)
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (d) => {
    setConfirming(null)
    setError(null)
    try {
      await api.deleteDemo(pin, d.id)
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const toggleActive = async (d) => {
    setError(null)
    try {
      await api.updateDemo(pin, d.id, { active: !d.active })
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const field = 'w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm'

  if (!pin) {
    return (
      <div className="px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen flex justify-center">
        <form onSubmit={submitPin} className="w-full max-w-sm mt-8">
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
            Credentials
          </div>
          <h1 className="text-3xl font-black tracking-tight">Demo Center</h1>
          <p className="text-sm text-deck-muted mt-2 mb-6">
            This page lists working sign-ins for the demo environments, so it asks
            for the shared PIN as well as your account.
          </p>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-center text-lg tracking-[0.4em] font-mono"
          />
          {pinError && <p className="text-sm text-red-300 mt-3">{pinError}</p>}
          <button
            type="submit"
            disabled={!pinInput.trim()}
            className="mt-4 w-full h-11 rounded-lg bg-deck-accent font-bold text-sm disabled:opacity-40"
          >
            Open the Demo Center
          </button>
          <p className="text-[11px] text-deck-muted mt-4 leading-snug">
            The PIN is checked by the server, not by this page, and it is kept only
            until you close the tab. An admin can change it in Settings.
          </p>
        </form>
      </div>
    )
  }

  return (
    <div className="px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
          Credentials
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">Demo Center</h1>
        <p className="text-deck-muted mt-1">
          Where every WIT product demo lives, and what to sign in with.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[16rem]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            <SearchIcon size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a demo or a product"
            className={`${field} pl-9`}
          />
        </div>
        {canEdit && (
          <button
            onClick={startNew}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-deck-accent font-bold text-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Add a demo
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error?.message || humanizeError(error, { action: 'do that' }).message}
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="mb-6 rounded-xl bg-deck-card border border-deck-border p-5">
          <h3 className="font-bold mb-4">{editing === 'new' ? 'Add a demo' : 'Edit this demo'}</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Labelled label="Name" hint="What people will look for.">
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={field}
                placeholder="ORYX sandbox"
                required
              />
            </Labelled>
            <Labelled label="Category">
              <input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className={field}
                placeholder="Shopfloor"
              />
            </Labelled>
            <Labelled label="Environment" hint="Development, Demo WIT, Production, Confidential.">
              <input
                value={draft.environment}
                onChange={(e) => setDraft({ ...draft, environment: e.target.value })}
                className={field}
                placeholder="Development"
              />
            </Labelled>
            <Labelled label="Status" hint="Whether it works today.">
              <input
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                className={field}
                placeholder="Active"
              />
            </Labelled>
            <Labelled label="Link" className="md:col-span-2">
              <input
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                className={field}
                placeholder="https://demo.example.com"
              />
            </Labelled>
            <Labelled label="ID / username">
              <input
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                className={field}
              />
            </Labelled>
            <Labelled label="Password" hint="Stored as typed, spaces included.">
              {/* Not type="password": the whole point is that whoever opens
                  this page can read it, and hiding it behind dots would only
                  make it harder to check against what was pasted. */}
              <input
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                className={`${field} font-mono`}
              />
            </Labelled>
            <Labelled label="Notes" className="md:col-span-2" hint="Anything the person opening the demo needs to know.">
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm resize-none"
                placeholder="Resets every night at 02:00. Use the sample dataset, not the live one."
              />
            </Labelled>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={saving || !draft.name.trim()}
              className="px-4 h-9 rounded-lg bg-deck-accent font-bold text-sm disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(null); setDraft(blank); setError(null) }}
              className="px-4 h-9 rounded-lg bg-white/5 border border-white/10 font-semibold text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-deck-muted">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl bg-deck-card border border-deck-border px-5 py-10 text-center">
          <p className="font-semibold">{demos.length ? 'Nothing matches that' : 'No demos yet'}</p>
          <p className="text-sm text-deck-muted mt-1">
            {demos.length
              ? 'Try a different word.'
              : canEdit
                ? 'Add the first one and it will show up here for the whole team.'
                : 'An admin or editor can add them.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((d) => (
          <DemoCard
            key={d.id}
            demo={d}
            canEdit={canEdit}
            onEdit={() => startEdit(d)}
            onToggle={() => toggleActive(d)}
            onAskDelete={() => setConfirming(d.id)}
            onDelete={() => remove(d)}
            onCancelDelete={() => setConfirming(null)}
            confirming={confirming === d.id}
            onNotify={onNotify}
          />
        ))}
      </div>

      <p className="text-xs text-deck-muted mt-6 max-w-2xl leading-snug">
        These passwords are stored so they can be read back — a hash cannot be copied
        into a login form. Anyone who can open this page can see them, so keep it to
        demo environments: nothing here should be a credential to anything real.
      </p>
    </div>
  )
}

function DemoCard({ demo, canEdit, onEdit, onToggle, onAskDelete, onDelete, onCancelDelete, confirming, onNotify }) {
  return (
    <div className={`rounded-xl bg-deck-card border p-4 flex flex-col gap-3 ${demo.active ? 'border-deck-border' : 'border-amber-500/25 bg-amber-500/[0.03]'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{demo.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {demo.category && (
              <span className="text-xs text-deck-muted truncate">{demo.category}</span>
            )}
            {demo.environment && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: `${ENVIRONMENT_COLOR[demo.environment] || '#8a8a99'}25`,
                  color: ENVIRONMENT_COLOR[demo.environment] || '#8a8a99',
                }}
                title={
                  demo.environment === 'Confidential'
                    ? 'Not to be shown outside WIT'
                    : undefined
                }
              >
                {demo.environment}
              </span>
            )}
            {demo.status && demo.status !== 'Active' && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: '#fbbf2425', color: '#fbbf24' }}>
                {demo.status}
              </span>
            )}
          </div>
        </div>
        {!demo.active && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                style={{ background: '#fbbf2425', color: '#fbbf24' }}>
            Retired
          </span>
        )}
      </div>

      <div className="space-y-2">
        <CopyRow label="Link" value={demo.url} href={demo.url} onNotify={onNotify} />
        <CopyRow label="ID" value={demo.username} onNotify={onNotify} />
        <CopyRow label="Password" value={demo.password} mono secret onNotify={onNotify} />
      </div>

      {demo.notes && (
        <p className="text-xs text-deck-muted leading-snug whitespace-pre-line border-t border-deck-border/60 pt-2">
          {demo.notes}
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-2 pt-1 border-t border-deck-border/60">
          {confirming ? (
            <>
              <span className="text-xs text-white/60">Delete for good?</span>
              <button onClick={onDelete} className="text-xs font-bold px-3 py-1 rounded bg-red-500/80 hover:bg-red-500">
                Delete
              </button>
              <button onClick={onCancelDelete} className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={onEdit} className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30">
                Edit
              </button>
              <button onClick={onToggle} className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30">
                {demo.active ? 'Retire' : 'Restore'}
              </button>
              <button
                onClick={onAskDelete}
                className="ml-auto p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-red-300"
                title="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// One field with the button that copies it. Empty fields are shown as a dash
// rather than hidden, so a demo missing a password looks incomplete instead of
// looking like it has none.
function CopyRow({ label, value, href, mono, secret, onNotify }) {
  const [copied, setCopied] = useState(false)
  // Press and hold to read it. Hidden by default so a password is not sitting
  // on screen behind whoever is walking past, and held rather than toggled so
  // it cannot be left showing by accident — letting go puts it back.
  const [revealed, setRevealed] = useState(false)

  const copy = async () => {
    if (!value) return
    try {
      await copyToClipboard(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      onNotify?.({
        type: 'error',
        title: "Couldn't copy",
        message: 'Your browser blocked clipboard access. Select the text and copy it by hand.',
      })
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-deck-muted w-16 shrink-0">
        {label}
      </span>
      {href && value ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={`flex-1 min-w-0 truncate text-sm text-emerald-300 hover:underline ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </a>
      ) : secret && value ? (
        <button
          type="button"
          // Pointer events rather than mouse ones, so a long press on a phone
          // works the same as holding the button with a mouse.
          onPointerDown={() => setRevealed(true)}
          onPointerUp={() => setRevealed(false)}
          onPointerLeave={() => setRevealed(false)}
          onPointerCancel={() => setRevealed(false)}
          // And for anyone on a keyboard, who has no pointer to hold down.
          onFocus={() => setRevealed(true)}
          onBlur={() => setRevealed(false)}
          className={`flex-1 min-w-0 truncate text-left text-sm font-mono select-none cursor-pointer ${
            revealed ? '' : 'text-white/60 tracking-widest'
          }`}
          title={revealed ? value : 'Hold to reveal'}
          aria-label={revealed ? `${label}: ${value}` : `${label}, hidden. Hold to reveal.`}
        >
          {revealed ? value : '•'.repeat(Math.min(value.length, 16))}
        </button>
      ) : (
        <span
          className={`flex-1 min-w-0 truncate text-sm ${value ? '' : 'text-white/30'} ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value || '—'}
        </span>
      )}
      <button
        onClick={copy}
        disabled={!value}
        className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded border transition-colors ${
          copied
            ? 'border-emerald-400/60 text-emerald-300'
            : 'bg-white/5 border-white/10 hover:border-white/30 disabled:opacity-30'
        }`}
        title={`Copy the ${label.toLowerCase()}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Labelled({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-[11px] text-deck-muted mt-1">{hint}</span>}
    </label>
  )
}
