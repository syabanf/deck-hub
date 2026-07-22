import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, INDUSTRIES } from '../data/decks.js'
import { useClosable } from '../lib/useClosable.js'
import { CloseIcon, CheckIcon, LinkIcon } from '../lib/icons.jsx'

// Edit an existing deck's catalog metadata.
//
// Deliberately a *patch* editor, not a re-creation form: it sends only the
// fields that actually changed. That keeps an unrelated field from being
// clobbered by a stale value, and means two admins editing different fields
// don't overwrite each other.
//
// Source editing is limited to link-based decks. An uploaded PDF or video lives
// at a generated path on the server; swapping it is a re-upload, not a text
// edit, so those show the current file read-only rather than offering a text
// box that would quietly break the deck.

const SOURCE_EDITABLE = new Set(['url', 'video'])

const sameTags = (a, b) => a.length === b.length && a.every((t, i) => t === b[i])

const parseTags = (raw) =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

export default function EditDeckModal({ deck, onSave, onClose, saving = false, error = null }) {
  const { closing, requestClose } = useClosable(onClose)

  // The form is seeded from the deck's *stored* values. source.raw is the
  // untouched backend value — source.value has been rewritten for playback.
  const [title, setTitle] = useState(deck.title || '')
  const [subtitle, setSubtitle] = useState(deck.subtitle || '')
  const [author, setAuthor] = useState(deck.author || '')
  const [year, setYear] = useState(deck.year || new Date().getFullYear())
  const [category, setCategory] = useState(deck.category || 'mine')
  const [industry, setIndustry] = useState(deck.industry || '')
  const [tagsRaw, setTagsRaw] = useState((deck.tags || []).join(', '))
  const [description, setDescription] = useState(deck.description || '')
  const [featured, setFeatured] = useState(!!deck.featured)
  const [sourceValue, setSourceValue] = useState(deck.source?.raw ?? deck.source?.value ?? '')

  // Two different types matter here. The normalized type decides whether the
  // source is a text-editable link at all; the stored type is what gets written
  // back — normalizing collapses gslides/embed into 'url', and saving that
  // would quietly change what the deck is.
  const playbackType = deck.source?.type || 'url'
  const storedType = deck.source?.rawType || playbackType
  const canEditSource = SOURCE_EDITABLE.has(playbackType)
  const originalSource = deck.source?.raw ?? deck.source?.value ?? ''
  const originalTags = deck.tags || []

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [requestClose])

  // Only what actually differs is sent — see the note at the top of the file.
  const patch = useMemo(() => {
    const p = {}
    const tags = parseTags(tagsRaw)
    if (title.trim() !== (deck.title || '')) p.title = title.trim()
    if (subtitle !== (deck.subtitle || '')) p.subtitle = subtitle
    if (author !== (deck.author || '')) p.author = author
    if (Number(year) !== Number(deck.year)) p.year = Number(year)
    if (category !== (deck.category || '')) p.category = category
    if (industry !== (deck.industry || '')) p.industry = industry
    if (!sameTags(tags, originalTags)) p.tags = tags
    if (description !== (deck.description || '')) p.description = description
    if (featured !== !!deck.featured) p.featured = featured
    if (canEditSource && sourceValue.trim() !== originalSource) {
      p.source = { type: storedType, value: sourceValue.trim() }
    }
    return p
  }, [
    title, subtitle, author, year, category, industry, tagsRaw, description,
    featured, sourceValue, deck, originalTags, originalSource, canEditSource, storedType,
  ])

  const changedCount = Object.keys(patch).length
  const titleEmpty = !title.trim()
  const canSave = changedCount > 0 && !titleEmpty && !saving

  const submit = (e) => {
    e.preventDefault()
    if (!canSave) return
    onSave(deck.id, patch)
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-start md:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4 overflow-y-auto ${
        closing ? 'is-closing' : ''
      }`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${deck.title}`}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="modal-panel relative w-full max-w-2xl my-8 md:my-0 bg-deck-surface rounded-2xl ring-1 ring-deck-border shadow-2xl animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-deck-border">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold text-deck-accent">
              Edit deck
            </div>
            <h2 className="text-xl font-black tracking-tight truncate mt-0.5">{deck.title}</h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close editor"
            className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="Deck title"
              autoFocus
            />
            {titleEmpty && (
              <p className="text-xs text-rose-400 mt-1">A deck needs a title.</p>
            )}
          </Field>

          <Field label="Subtitle">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={inputCls}
              placeholder="One line under the title"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Author">
              <input value={author} onChange={(e) => setAuthor(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Year">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min="1900"
                max="2100"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id} className="bg-deck-card">
                    {c.title}
                  </option>
                ))}
                <option value="mine" className="bg-deck-card">My Uploads</option>
              </select>
            </Field>
            <Field label="Industry">
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls}>
                <option value="" className="bg-deck-card">— none —</option>
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id} className="bg-deck-card">
                    {i.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Tags" hint="Comma separated">
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className={inputCls}
              placeholder="strategy, ai, 2026"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputCls} resize-y`}
              placeholder="What's in this deck?"
            />
          </Field>

          {/* Source */}
          <Field
            label="Source"
            hint={canEditSource ? `Type: ${storedType}` : 'Uploaded file — replace by re-uploading'}
          >
            {canEditSource ? (
              <div className="relative">
                <LinkIcon
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
                />
                <input
                  value={sourceValue}
                  onChange={(e) => setSourceValue(e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="https://…"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-deck-border text-sm text-white/50">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 shrink-0">
                  {storedType}
                </span>
                <span className="truncate">{deck.source?.raw || deck.source?.value}</span>
              </div>
            )}
          </Field>

          <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
            <span
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${
                featured ? 'bg-deck-accent' : 'bg-white/10 border border-deck-border'
              }`}
            >
              {featured && <CheckIcon size={13} />}
            </span>
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="sr-only"
            />
            <span className="text-sm">
              Feature on the home hero
              <span className="block text-xs text-deck-muted">
                The newest featured deck is the one that shows.
              </span>
            </span>
          </label>

          {error && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 animate-fade-in">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-deck-border">
          <span className="text-xs text-deck-muted">
            {changedCount === 0
              ? 'No changes yet'
              : `${changedCount} ${changedCount === 1 ? 'change' : 'changes'} to save`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="px-4 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold shadow-lg shadow-deck-accent/30 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm placeholder:text-white/35 focus:outline-none focus:border-white/40 transition-colors'

function Field({ label, hint, required, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-deck-muted">
          {label}
          {required && <span className="text-deck-accent ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[11px] text-white/35 truncate">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
