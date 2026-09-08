import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { copyToClipboard } from '../lib/share.js'
import { PlusIcon, TrashIcon, SearchIcon } from '../lib/icons.jsx'

const blank = { name: '', product: '', url: '', username: '', password: '', notes: '' }

// The credentials for WIT's own product demos, with one click to copy each
// field into whatever form is asking for it.
export default function DemoCenter({ canEdit = false, onNotify }) {
  const [demos, setDemos] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [draft, setDraft] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDemos(await api.listDemos())
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Filtered here rather than by refetching: the whole list is small, and a
  // request per keystroke against a page of credentials is more traffic than
  // the search is worth.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return demos
    return demos.filter((d) =>
      [d.name, d.product, d.username, d.notes].some((v) => (v || '').toLowerCase().includes(q)),
    )
  }, [demos, search])

  const startNew = () => {
    setDraft(blank)
    setEditing('new')
    setError(null)
  }

  const startEdit = (d) => {
    setDraft({
      name: d.name, product: d.product, url: d.url,
      username: d.username, password: d.password, notes: d.notes,
    })
    setEditing(d.id)
    setError(null)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing === 'new') await api.createDemo(draft)
      else await api.updateDemo(editing, draft)
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
      await api.deleteDemo(d.id)
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const toggleActive = async (d) => {
    setError(null)
    try {
      await api.updateDemo(d.id, { active: !d.active })
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const field = 'w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm'

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
            <Labelled label="Product">
              <input
                value={draft.product}
                onChange={(e) => setDraft({ ...draft, product: e.target.value })}
                className={field}
                placeholder="ORYX"
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
          {demo.product && (
            <div className="text-xs text-deck-muted truncate">{demo.product}</div>
          )}
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
        <CopyRow label="Password" value={demo.password} mono onNotify={onNotify} />
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
function CopyRow({ label, value, href, mono, onNotify }) {
  const [copied, setCopied] = useState(false)

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
