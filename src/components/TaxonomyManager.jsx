import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { settingNumber, useSettings } from '../lib/settings.jsx'
import { useTaxonomy } from '../lib/taxonomy.jsx'
import { copyToClipboard } from '../lib/share.js'
import { PlusIcon, TrashIcon, CloseIcon } from '../lib/icons.jsx'

// The master lists the catalog is browsed by. Until migration 000010 these
// were constants in the bundle, so this screen is the whole point of moving
// them: changing a category no longer needs a deploy.
//
// Source types are not here. They look like a third list, but they are a
// rendering contract the player implements — adding one through this form
// would only produce decks nothing knows how to play, and the failure would
// reach a viewer at playback rather than whoever added it. That list lives in
// domain.SourceTypes, beside the code that has to change with it.
//
// Retired terms are shown, not hidden. Retiring is the reversible way to take
// something out of circulation, and a screen that hid the result would leave
// no way to undo it.
const KINDS = [
  { id: 'categories', label: 'Categories', noun: 'category', colored: false },
  { id: 'industries', label: 'Industries', noun: 'industry', colored: true },
]

const blankDraft = { slug: '', title: '', accent: '', secondary: '' }

// The API's own message is preferred here, unlike everywhere else in the app.
// This is an admin screen, and the server's copy carries the detail that makes
// the refusal actionable — how many decks still use the term. humanizeError's
// friendlier wording would drop exactly that number.
const explain = (err) => err?.message || humanizeError(err, { action: 'save that' }).message

export default function TaxonomyManager({ canManage = false }) {
  const [kind, setKind] = useState(KINDS[0])
  const [terms, setTerms] = useState([])
  const [unknown, setUnknown] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(blankDraft)
  const [busySlug, setBusySlug] = useState(null)
  // Editing and deleting both happen in the row. window.prompt and
  // window.confirm were doing this job, and a Chrome dialog dropped on top of
  // the app is jarring enough that people hesitate over it — besides only ever
  // being able to ask for one string, which left the gradient uneditable after
  // creation.
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const { refresh: refreshBrowse } = useTaxonomy()

  // Unfiltered: the admin needs to see retired terms. The browse context asks
  // for active only, which is why this screen keeps its own copy rather than
  // reading from useTaxonomy().
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, orphans] = await Promise.all([
        api.listTerms(kind.id),
        api.unknownTerms(kind.id),
      ])
      setTerms(list)
      setUnknown(orphans)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    load()
  }, [load])

  // Every mutation refreshes the browse copy too, or the nav keeps the list it
  // fetched at startup and the change looks like it did not save.
  const after = useCallback(async () => {
    await load()
    refreshBrowse()
  }, [load, refreshBrowse])

  const stats = useMemo(() => {
    const active = terms.filter((t) => t.active).length
    return {
      total: terms.length,
      active,
      retired: terms.length - active,
      unfiled: unknown.reduce((n, u) => n + u.deckCount, 0),
    }
  }, [terms, unknown])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await api.createTerm(kind.id, {
        slug: draft.slug.trim().toLowerCase(),
        title: draft.title.trim(),
        accent: draft.accent.trim(),
        secondary: draft.secondary.trim(),
      })
      setDraft(blankDraft)
      setAdding(false)
      await after()
    } catch (e2) {
      setError(e2)
    }
  }

  const patch = async (term, body) => {
    setBusySlug(term.slug)
    setError(null)
    try {
      await api.updateTerm(kind.id, term.slug, body)
      await after()
    } catch (e) {
      setError(e)
    } finally {
      setBusySlug(null)
    }
  }

  const saveEdit = async () => {
    const t = terms.find((x) => x.slug === editing.slug)
    if (!t) return
    const body = {}
    if (editing.title.trim() && editing.title.trim() !== t.title) body.title = editing.title.trim()
    const order = Number(editing.sortOrder)
    if (Number.isFinite(order) && order !== t.sortOrder) body.sortOrder = order
    if (kind.colored && (editing.accent !== (t.accent || '') || editing.secondary !== (t.secondary || ''))) {
      body.accent = editing.accent
      body.secondary = editing.secondary
    }
    if (Object.keys(body).length === 0) {
      setEditing(null)
      return
    }
    await patch(t, body)
    setEditing(null)
  }

  const remove = async (term) => {
    // The API refuses this while decks still point at the term, but saying so
    // before the round trip is kinder than a 409 the user has to decode.
    if (term.deckCount > 0) {
      setError(new Error(
        `${term.deckCount} deck${term.deckCount === 1 ? '' : 's'} still use “${term.title}”. ` +
        `Retire it instead, or move them to another ${kind.noun} first.`,
      ))
      return
    }
    setConfirming(null)
    setBusySlug(term.slug)
    setError(null)
    try {
      await api.deleteTerm(kind.id, term.slug)
      await after()
    } catch (e) {
      setError(e)
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <div>
      {canManage && <NavLimit onError={setError} />}
      {canManage && <DemoPin onError={setError} />}
      {canManage && <ApiKeys onError={setError} />}

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => {
              setKind(k)
              setAdding(false)
              setEditing(null)
              setConfirming(null)
              setError(null)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              k.id === kind.id
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Terms" value={stats.total} />
        <Stat label="In use" value={stats.active} accent="#34d399" />
        <Stat label="Retired" value={stats.retired} accent="#fbbf24" />
        <Stat label="Decks unfiled" value={stats.unfiled} accent={stats.unfiled ? '#f87171' : undefined} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-3">
          <span className="flex-1">{explain(error)}</span>
          <button onClick={() => setError(null)} className="text-red-200/60 hover:text-red-100">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {unknown.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <div className="text-sm font-bold text-amber-200 mb-1">
            Values in use that no term defines
          </div>
          <p className="text-xs text-white/55 mb-2">
            These columns are plain text and always have been, so a deck can carry a value
            this list never had. Those decks are invisible to the filter that should find
            them. Add the term to adopt it, or edit the decks.
          </p>
          <div className="flex flex-wrap gap-2">
            {unknown.map((u) => (
              <button
                key={u.value}
                disabled={!canManage}
                onClick={() => { setDraft({ ...blankDraft, slug: u.value, title: u.value }); setAdding(true) }}
                className="text-xs font-mono px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30 disabled:cursor-default"
              >
                {u.value}
                <span className="ml-2 text-white/40">{u.deckCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        adding ? (
          <form onSubmit={submit} className="mb-5 rounded-xl bg-deck-card border border-deck-border p-4">
            <div className="grid md:grid-cols-2 gap-3">
              <Field
                label="Slug"
                hint="What decks store. Chosen once — it cannot be changed later."
                value={draft.slug}
                onChange={(v) => setDraft({ ...draft, slug: v })}
                placeholder="fintech"
              />
              <Field
                label="Title"
                hint="What people read."
                value={draft.title}
                onChange={(v) => setDraft({ ...draft, title: v })}
                placeholder="Finance & Fintech"
              />
              {kind.colored && (
                <>
                  <ColorField
                    label="Accent"
                    hint="Gradient start."
                    value={draft.accent}
                    onChange={(v) => setDraft({ ...draft, accent: v })}
                  />
                  <ColorField
                    label="Secondary"
                    hint="Gradient end."
                    value={draft.secondary}
                    onChange={(v) => setDraft({ ...draft, secondary: v })}
                  />
                  <div className="md:col-span-2 -mt-1">
                    <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
                      Preview
                    </span>
                    <div
                      className="mt-1 h-10 rounded-lg border border-white/10"
                      style={{
                        background: `linear-gradient(135deg, ${draft.accent || '#1b1b22'}, ${
                          draft.secondary || '#1b1b22'
                        })`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="px-4 h-9 rounded-lg bg-deck-accent font-bold text-sm">
                Add {kind.noun}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setDraft(blankDraft); setError(null) }}
                className="px-4 h-9 rounded-lg bg-white/5 border border-white/10 font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mb-5 inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 font-semibold text-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Add {kind.noun}
          </button>
        )
      )}

      <div className="rounded-xl border border-deck-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-deck-muted">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Title</th>
                <th className="text-left px-3 py-2 font-bold">Slug</th>
                <th className="text-right px-3 py-2 font-bold">Order</th>
                <th className="text-right px-3 py-2 font-bold">Decks</th>
                <th className="text-left px-3 py-2 font-bold">State</th>
                {canManage && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-deck-muted">Loading…</td></tr>
              )}
              {!loading && terms.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-deck-muted">Nothing here yet.</td></tr>
              )}
              {terms.map((t) => {
                const isEditing = editing?.slug === t.slug
                return (
                <tr key={t.slug} className={`border-t border-deck-border/60 ${isEditing ? 'bg-white/[0.03]' : ''}`}>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        {kind.colored && (
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${editing.accent || '#1b1b22'}, ${
                                editing.secondary || '#1b1b22'
                              })`,
                            }}
                          />
                        )}
                        <input
                          autoFocus
                          value={editing.title}
                          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          className="w-full h-8 px-2 rounded bg-black/40 border border-white/20 focus:border-white/40 outline-none text-sm font-semibold"
                        />
                        {kind.colored && (
                          <>
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(editing.accent) ? editing.accent : '#1b1b22'}
                              onChange={(e) => setEditing({ ...editing, accent: e.target.value })}
                              className="w-8 h-8 shrink-0 rounded bg-black/40 border border-white/10 cursor-pointer p-0.5"
                              aria-label="Accent colour"
                            />
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(editing.secondary) ? editing.secondary : '#1b1b22'}
                              onChange={(e) => setEditing({ ...editing, secondary: e.target.value })}
                              className="w-8 h-8 shrink-0 rounded bg-black/40 border border-white/10 cursor-pointer p-0.5"
                              aria-label="Secondary colour"
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {t.accent && (
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.secondary})` }}
                          />
                        )}
                        <span className={t.active ? 'font-semibold' : 'font-semibold text-white/45'}>
                          {t.title}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-deck-muted">{t.slug}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-deck-muted">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editing.sortOrder}
                        onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="w-20 h-8 px-2 rounded bg-black/40 border border-white/20 focus:border-white/40 outline-none text-sm text-right tabular-nums"
                      />
                    ) : (
                      t.sortOrder
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.deckCount}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={
                        t.active
                          ? { background: '#34d39925', color: '#34d399' }
                          : { background: '#fbbf2425', color: '#fbbf24' }
                      }
                    >
                      {t.active ? 'In use' : 'Retired'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              disabled={busySlug === t.slug}
                              onClick={saveEdit}
                              className="text-xs font-bold px-3 py-1 rounded bg-deck-accent disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30"
                            >
                              Cancel
                            </button>
                          </>
                        ) : confirming === t.slug ? (
                          <>
                            {/* An inline confirmation rather than window.confirm:
                                same pause before an irreversible click, without
                                a browser dialog landing on top of the app. */}
                            <span className="text-xs text-white/60">Delete for good?</span>
                            <button
                              disabled={busySlug === t.slug}
                              onClick={() => remove(t)}
                              className="text-xs font-bold px-3 py-1 rounded bg-red-500/80 hover:bg-red-500 disabled:opacity-50"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={busySlug === t.slug}
                              onClick={() => patch(t, { active: !t.active })}
                              className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30 disabled:opacity-50"
                            >
                              {t.active ? 'Retire' : 'Restore'}
                            </button>
                            <button
                              disabled={busySlug === t.slug}
                              onClick={() => {
                                setConfirming(null)
                                setError(null)
                                setEditing({
                                  slug: t.slug,
                                  title: t.title,
                                  sortOrder: String(t.sortOrder),
                                  accent: t.accent || '',
                                  secondary: t.secondary || '',
                                })
                              }}
                              className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              disabled={busySlug === t.slug}
                              onClick={() => {
                                // Say why up front. Offering a delete that the
                                // server will refuse wastes the click and reads
                                // as a bug rather than a rule.
                                if (t.deckCount > 0) {
                                  remove(t)
                                  return
                                }
                                setEditing(null)
                                setConfirming(t.slug)
                              }}
                              title={t.deckCount > 0 ? 'Decks still use this term' : 'Delete'}
                              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-red-300 disabled:opacity-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-deck-muted mt-3">
        Edit changes the title, the browse order and — for industries — the gradient. The
        slug is what every deck stores, so it stays fixed: changing it would leave those
        decks pointing at a value that no longer exists. Retire a term to take it out of
        circulation without touching the decks that already use it.
      </p>
    </div>
  )
}

// The shared PIN in front of the Demo Center.
//
// Admin only, and write-only: the PIN is stored as a bcrypt hash, so it can be
// replaced and never read back. That is the trade for a gate a database backup
// does not hand over — and it means the only way to recover a forgotten one is
// to set a new one here.
function DemoPin({ onError }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setDone(false)
    onError?.(null)
    try {
      await api.setDemoPin(value.trim())
      setValue('')
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch (err) {
      onError?.(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mb-5 rounded-xl bg-deck-card border border-deck-border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex-1 min-w-[16rem]">
        <div className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
          Demo Center PIN
        </div>
        <p className="text-xs text-deck-muted mt-1 leading-snug">
          Asked for on top of signing in, because that page lists working credentials.
          Stored hashed, so it can be replaced but never shown — and changing it locks
          out every tab still holding the old one.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New PIN"
          className="w-32 h-9 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm font-mono"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length < 4}
          className="px-3 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-sm font-semibold disabled:opacity-40"
        >
          {done ? 'Changed' : busy ? 'Saving…' : 'Replace'}
        </button>
      </div>
    </form>
  )
}

// Keys that let a system outside this company call the API.
//
// Admin only, and one endpoint wide: a key opens GET /roles and nothing else.
// That endpoint returns the three roles, what each may do and how many
// accounts hold them — no names, no addresses — which is what makes handing a
// key to another team a small decision rather than a large one.
//
// The key is shown once, on creation, and never again: the row keeps a
// SHA-256 hash. Revoked keys stay in the list on purpose, because "who issued
// this and when" is the question people ask exactly when one has gone wrong.
function ApiKeys({ onError }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // The plaintext of the key just created. Held in state, never re-fetchable.
  const [fresh, setFresh] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setKeys(await api.listApiKeys())
    } catch (err) {
      onError?.(err)
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    onError?.(null)
    try {
      const res = await api.createApiKey(name.trim())
      setFresh(res.plaintextShownOnce)
      setCopied(false)
      setName('')
      await load()
    } catch (err) {
      onError?.(err)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id) => {
    setConfirmingId(null)
    onError?.(null)
    try {
      await api.revokeApiKey(id)
      await load()
    } catch (err) {
      onError?.(err)
    }
  }

  const copyFresh = async () => {
    if (await copyToClipboard(fresh)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const when = (v) => (v ? String(v).slice(0, 10) : '—')

  return (
    <div className="mb-5 rounded-xl bg-deck-card border border-deck-border px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
        API keys
      </div>
      <p className="text-xs text-deck-muted mt-1 leading-snug max-w-2xl">
        For systems outside WIT. A key opens one endpoint — <code className="text-white/70">GET /api/roles</code>,
        the roles and how many people hold each — and carries no account, no role and no
        access to anything else. No names or addresses go through it.
      </p>

      <form onSubmit={create} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Who is this key for?"
          maxLength={200}
          className="flex-1 min-w-[14rem] h-9 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="px-3 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Issuing…' : 'Issue key'}
        </button>
      </form>

      {/* Shown once. Nothing can produce this value again. */}
      {fresh && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <div className="text-xs font-bold text-amber-300">
            Copy this now — it cannot be shown again.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs font-mono text-amber-100">{fresh}</code>
            <button
              type="button"
              onClick={copyFresh}
              className="px-2.5 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold shrink-0"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => setFresh(null)}
              className="px-2.5 h-8 rounded-lg bg-transparent border border-white/15 hover:border-white/35 text-xs font-semibold shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-xs text-deck-muted">Loading keys…</div>
      ) : keys.length === 0 ? (
        <div className="mt-3 text-xs text-deck-muted">No keys issued yet.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-[10px] uppercase tracking-widest text-deck-muted">
              <tr>
                <th className="text-left px-2 py-1.5 font-bold">Name</th>
                <th className="text-left px-2 py-1.5 font-bold">Key</th>
                <th className="text-left px-2 py-1.5 font-bold">Created</th>
                <th className="text-left px-2 py-1.5 font-bold">Last used</th>
                <th className="text-right px-2 py-1.5 font-bold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-deck-border">
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? 'text-deck-muted' : ''}>
                  <td className="px-2 py-2 font-semibold">{k.name}</td>
                  <td className="px-2 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-2 py-2 text-xs tabular-nums">{when(k.createdAt)}</td>
                  <td className="px-2 py-2 text-xs tabular-nums">{when(k.lastUsedAt)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {k.revokedAt ? (
                      <span className="text-xs">Revoked {when(k.revokedAt)}</span>
                    ) : confirmingId === k.id ? (
                      <>
                        <button
                          onClick={() => revoke(k.id)}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300"
                        >
                          Revoke
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="ml-3 text-xs text-deck-muted hover:text-white"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(k.id)}
                        className="text-xs text-deck-muted hover:text-rose-300"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// How many categories the header shows before the rest fold into "More".
//
// It lives on this screen because it is a decision about the same list: the
// order comes from the Order column below, and this is how far down that order
// the header reaches.
function NavLimit({ onError }) {
  const { settings, save } = useSettings()
  const current = settingNumber(settings, 'nav_max_categories', 5)
  const [busy, setBusy] = useState(false)

  const set = async (n) => {
    setBusy(true)
    onError?.(null)
    try {
      await save({ nav_max_categories: String(n) })
    } catch (e) {
      onError?.(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-5 rounded-xl bg-deck-card border border-deck-border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex-1 min-w-[16rem]">
        <div className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">
          Categories in the header
        </div>
        <p className="text-xs text-deck-muted mt-1 leading-snug">
          The first {current} by the Order column below. The rest move into “More”, and a
          narrow window may fold in more than this on its own.
        </p>
      </div>
      <div className="flex items-center gap-1">
        {[3, 4, 5, 6, 7, 8].map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={() => set(n)}
            className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${
              n === current
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-deck-card border border-deck-border px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-deck-muted">{label}</div>
      <div className="text-2xl font-black mt-0.5" style={{ color: accent || 'white' }}>
        {value}
      </div>
    </div>
  )
}

// A picker plus the hex, not the hex alone. The API wants #rrggbb and typing
// it by hand is both slower and the only way to get it wrong; the text field
// stays so an existing brand colour can still be pasted in.
function ColorField({ label, hint, value, onChange }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          // The native input has no empty state, so an unset colour shows as
          // black. Keeping the text field authoritative avoids writing a value
          // nobody chose.
          value={valid ? value : '#1b1b22'}
          onChange={(e) => onChange(e.target.value)}
          className="w-11 h-10 rounded-lg bg-black/40 border border-white/10 cursor-pointer p-1"
          aria-label={`${label} colour`}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="unset"
          className="flex-1 h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm font-mono"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-white/50 hover:text-white px-2"
          >
            Clear
          </button>
        )}
      </div>
      {hint && <span className="block text-[11px] text-deck-muted mt-1">{hint}</span>}
    </label>
  )
}

function Field({ label, hint, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-deck-muted font-bold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-white/30 outline-none text-sm"
      />
      {hint && <span className="block text-[11px] text-deck-muted mt-1">{hint}</span>}
    </label>
  )
}
