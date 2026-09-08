import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { useTaxonomy } from '../lib/taxonomy.jsx'
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
    if (!window.confirm(`Delete the ${kind.noun} “${term.title}”? This cannot be undone.`)) return
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
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => { setKind(k); setAdding(false); setError(null) }}
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
              {terms.map((t) => (
                <tr key={t.slug} className="border-t border-deck-border/60">
                  <td className="px-3 py-2">
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
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-deck-muted">{t.slug}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-deck-muted">{t.sortOrder}</td>
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
                            const title = window.prompt(`Rename “${t.title}” to:`, t.title)
                            if (title && title.trim() && title !== t.title) patch(t, { title: title.trim() })
                          }}
                          className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-white/30 disabled:opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          disabled={busySlug === t.slug}
                          onClick={() => remove(t)}
                          title={t.deckCount > 0 ? 'Decks still use this term' : 'Delete'}
                          className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-red-300 disabled:opacity-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-deck-muted mt-3">
        A slug is what every deck stores, so it cannot be edited — renaming it would leave
        those decks pointing at a value that no longer exists. Retire a term to take it out
        of circulation without touching the decks that already use it.
      </p>
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
