import { useEffect, useState } from 'react'

import DeckPlayer from './DeckPlayer.jsx'
import Cover from './Cover.jsx'
import { api, normalizeDecks } from '../lib/api.js'
import { PlayIcon } from '../lib/icons.jsx'

// What someone sees when they follow a shared link without an account.
//
// One deck, and nothing else. This deliberately does not mount the navbar, the
// categories, search, the library or settings — there is no route from here
// into the catalog, because the person was sent a single deck and that is all
// they were given.
//
// It used to hand them a guest session instead, which rendered the whole
// application around the player. Closing the deck left a stranger sitting in
// the dashboard, free to browse everything the company had published. The link
// is the access, and it should be access to exactly one thing.
//
// Signed-in people never reach this: App routes them to the normal app, where
// the same link opens the same deck with everything else still available.
export default function SharedDeckPage({ deckId, onSignIn }) {
  const [state, setState] = useState({ status: 'loading', deck: null })
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .listDecksByIds([deckId])
      .then((res) => {
        if (cancelled) return
        const [deck] = normalizeDecks(res.data || [])
        setState(deck ? { status: 'ready', deck } : { status: 'missing', deck: null })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', deck: null })
      })
    return () => {
      cancelled = true
    }
  }, [deckId])

  if (state.status === 'loading') {
    return (
      <Shell>
        <p className="text-deck-muted text-sm">Opening the deck…</p>
      </Shell>
    )
  }

  if (state.status !== 'ready') {
    return (
      <Shell onSignIn={onSignIn}>
        <h1 className="text-2xl font-black tracking-tight">
          {state.status === 'missing' ? 'That deck is gone' : "Couldn't open that deck"}
        </h1>
        <p className="text-deck-muted text-sm mt-2 max-w-sm">
          {state.status === 'missing'
            ? 'The link points at a deck that is no longer in the catalog. Ask whoever sent it for a new one.'
            : 'The link looks right, but the catalog did not answer. Try again in a moment.'}
        </p>
      </Shell>
    )
  }

  const { deck } = state

  return (
    <>
      <Shell onSignIn={onSignIn}>
        <div className="w-full max-w-sm">
          {/* `minimal` keeps the cover from offering a category link — there is
              no category page to send anyone to from here. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block w-full aspect-deck relative rounded-lg overflow-hidden ring-1 ring-deck-border shadow-2xl hover:ring-white/30 transition-shadow"
            aria-label={`Open ${deck.title}`}
          >
            <Cover deck={deck} minimal />
          </button>

          <h1 className="text-2xl font-black tracking-tight mt-5">{deck.title}</h1>
          {(deck.author || deck.year) && (
            <p className="text-sm text-deck-muted mt-1">
              {[deck.author, deck.year].filter(Boolean).join(' · ')}
            </p>
          )}
          {deck.description && (
            <p className="text-sm text-deck-muted mt-3 leading-relaxed">{deck.description}</p>
          )}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-6 w-full h-11 rounded-lg bg-white text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 transition-colors"
          >
            <PlayIcon size={15} />
            Open the deck
          </button>
        </div>
      </Shell>

      {open && <DeckPlayer deck={deck} onClose={() => setOpen(false)} />}
    </>
  )
}

// The frame around it: a wordmark, the content, and a way in for someone who
// does have an account. No navigation of any kind.
function Shell({ children, onSignIn }) {
  return (
    <div className="min-h-screen bg-deck-bg text-white flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between">
        <span className="text-2xl font-black tracking-tight text-deck-accent select-none">
          WIT<span className="text-white">.</span>
        </span>
        {onSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="text-xs font-semibold text-deck-muted hover:text-white transition-colors"
          >
            Sign in
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16 text-center">
        {children}
      </main>

      <footer className="px-6 py-5 text-center text-[11px] text-deck-muted">
        Shared with you by WIT. This link opens this deck only.
      </footer>
    </div>
  )
}
