import { useEffect, useRef, useState } from 'react'

import { DECK_PATH } from '../lib/share.js'
import { slugProblem, slugify } from '../lib/slug.js'

// Naming a deck's link, at the moment somebody is about to send it.
//
// This used to sit in the add and edit forms, which was the wrong place: the
// moment a person wants to choose what a link says is the moment they are
// pasting it into a message to a client, not a week earlier while they were
// uploading the file. So it lives at the top of the share menu, above the
// things that hand the link over.
//
// It saves on its own — there is no form around it to submit — and everything
// below it in the menu rebuilds from the saved value, so Copy, WhatsApp, email
// and the QR code all carry the new link the moment it is saved.
export default function ShareLinkEditor({ deck, onRename }) {
  const [value, setValue] = useState(deck.slug || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef(null)

  // A different deck behind the same menu starts from that deck's link.
  //
  // Keyed on the id alone, not on the slug: a successful save replaces the
  // deck object with one carrying the new slug, and reacting to that would
  // clear the "Saved." line in the same tick it was set — the save would look
  // like it had not happened.
  useEffect(() => {
    setValue(deck.slug || '')
    setError('')
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.id])

  const host = typeof window === 'undefined' ? '' : window.location.host
  const clean = value.trim()
  const dirty = clean !== (deck.slug || '')
  const problem = slugProblem(clean)

  const save = async () => {
    if (!dirty || problem || saving) return
    setSaving(true)
    setError('')
    try {
      await onRename(clean)
      setSaved(true)
    } catch (e) {
      // 409 is the one worth naming: somebody else holds this link, including
      // a deck that used to be called it. Everything else is reported as it
      // came back.
      setError(
        e?.status === 409
          ? 'That link already belongs to another deck.'
          : e?.message || 'Could not save that link.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pt-3 pb-3 border-b border-deck-border/60">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-widest font-bold text-deck-muted">
          Link
        </span>
        {!deck.slug && deck.title && !value && (
          <button
            type="button"
            onClick={() => {
              setValue(slugify(deck.title))
              inputRef.current?.focus()
            }}
            className="text-[11px] font-semibold text-deck-muted hover:text-white transition-colors shrink-0"
          >
            Use the title
          </button>
        )}
      </div>

      {/* The host is a line of its own rather than a prefix beside the input.
          The menu is 288px wide at most and narrower on a phone; side by side,
          the host would take most of that row and leave a sliver for the part
          being typed in. */}
      <div className="text-[11px] font-mono text-deck-muted truncate">
        {host}
        {DECK_PATH}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            // Cleaned as it is typed, so what is in the box is what the link
            // will be — nobody should find out after sending it.
            setValue(slugify(e.target.value))
            setError('')
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder="company-profile-2026"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-deck-bg border border-deck-border text-sm font-mono placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors"
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={!!problem || saving}
            className="shrink-0 px-3 py-1.5 rounded-md bg-white text-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-deck-muted">
        {problem ? (
          <span className="text-red-300">{problem}</span>
        ) : error ? (
          <span className="text-red-300">{error}</span>
        ) : saved ? (
          <span className="text-emerald-300">Saved. The links below use it now.</span>
        ) : dirty ? (
          'Press Save, then copy.'
        ) : deck.slug ? (
          'Rename it any time — the old link keeps working.'
        ) : (
          'Give it a name, or send the long id as it is.'
        )}
      </p>
    </div>
  )
}
