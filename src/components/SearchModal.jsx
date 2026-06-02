import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import { SearchIcon, CloseIcon } from '../lib/icons.jsx'

const SUGGESTIONS = ['Airbnb', 'Tesla', 'Transformer', 'Atomic Design', 'OpenAI', 'Lean Startup']

const matchesQuery = (deck, q) => {
  if (!q) return true
  const s = q.toLowerCase()
  return (
    deck.title.toLowerCase().includes(s) ||
    (deck.subtitle || '').toLowerCase().includes(s) ||
    (deck.author || '').toLowerCase().includes(s) ||
    (deck.description || '').toLowerCase().includes(s) ||
    (deck.tags || []).some((t) => t.toLowerCase().includes(s))
  )
}

export default function SearchModal({
  onClose,
  query,
  onQueryChange,
  industries,
  activeIndustry,
  onIndustryClick,
  allDecks,
  onPickDeck,
  totalDecks,
}) {
  const inputRef = useRef(null)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const results = useMemo(() => {
    return allDecks
      .filter((d) => matchesQuery(d, query))
      .filter((d) => !activeIndustry || d.industry === activeIndustry)
      .slice(0, 8)
  }, [allDecks, query, activeIndustry])

  // Reset highlight when results change
  useEffect(() => {
    setHighlight(0)
  }, [query, activeIndustry])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!results.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % results.length)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + results.length) % results.length)
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const deck = results[highlight]
        if (deck) onPickDeck(deck)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [results, highlight, onClose, onPickDeck])

  const hasQuery = !!query.trim()

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center bg-black/80 backdrop-blur-sm animate-fade-in pt-20 px-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/60 mb-2">
            {totalDecks}+ open decks · curated
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            Find any deck.{' '}
            <span className="text-deck-accent">Open instantly.</span>
          </h2>
        </div>

        {/* Search box */}
        <div className="relative rounded-full bg-deck-card border-2 border-deck-accent shadow-2xl shadow-deck-accent/30 flex items-center gap-3 px-5 py-3.5">
          <SearchIcon size={20} className="text-white/80 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Try ‘pitch deck’, ‘Tesla’, ‘design systems’…"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-white/40"
          />
          {query ? (
            <button
              onClick={() => onQueryChange('')}
              className="text-[10px] uppercase tracking-wider text-white/60 hover:text-white px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
              title="Clear (Esc to close)"
            >
              Clear
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white"
              title="Close (Esc)"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>

        {/* Suggestions when empty */}
        {!hasQuery && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className="text-deck-muted mr-1">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onQueryChange(s)}
                className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Industry chips */}
        {industries && industries.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            <button
              onClick={() => onIndustryClick(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                !activeIndustry
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/15 hover:text-white'
              }`}
            >
              All industries
            </button>
            {industries.map((ind) => {
              const active = activeIndustry === ind.id
              return (
                <button
                  key={ind.id}
                  onClick={() => onIndustryClick(ind.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                    active
                      ? 'text-black border-transparent'
                      : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/15 hover:text-white'
                  }`}
                  style={active ? { backgroundColor: ind.accent } : undefined}
                >
                  {ind.title}
                </button>
              )
            })}
          </div>
        )}

        {/* Live results */}
        {(hasQuery || activeIndustry) && (
          <div className="mt-5 bg-deck-surface rounded-xl ring-1 ring-deck-border overflow-hidden shadow-2xl">
            <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-deck-muted flex items-center justify-between border-b border-deck-border">
              <span>{results.length} matches</span>
              {results.length > 0 && (
                <span className="hidden sm:flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">↑</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">↓</kbd>
                  <span>navigate</span>
                  <span>·</span>
                  <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">↵</kbd>
                  <span>open</span>
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div className="px-4 py-10 text-center text-deck-muted text-sm">
                No matches. Try a different keyword.
              </div>
            ) : (
              <ul className="divide-y divide-deck-border max-h-[55vh] overflow-y-auto thin-scroll">
                {results.map((deck, i) => (
                  <li key={deck.id}>
                    <button
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => onPickDeck(deck)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        highlight === i ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0 ring-1 ring-deck-border">
                        <Cover deck={deck} sizeClass="text-[8px]" minimal />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{deck.title}</div>
                        <div className="text-xs text-deck-muted truncate">
                          {deck.author} · {deck.year}
                        </div>
                      </div>
                      {highlight === i && (
                        <span className="text-xs text-deck-muted hidden sm:inline">
                          ↵ Open
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 text-center text-[10px] uppercase tracking-widest text-white/40">
          Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/70">Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
