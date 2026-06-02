import { useState } from 'react'
import { SearchIcon } from '../lib/icons.jsx'

const SUGGESTIONS = ['Airbnb', 'Tesla', 'Transformer', 'Atomic Design', 'OpenAI']

export default function SearchHero({
  query,
  onQueryChange,
  industries,
  activeIndustry,
  onIndustryClick,
  totalDecks,
}) {
  const [focused, setFocused] = useState(false)
  return (
    <section className="relative pt-10 pb-8 px-6 md:px-12 flex flex-col items-center text-center">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-deck-bg/70 via-deck-bg/95 to-deck-bg" />

      <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
        {totalDecks}+ open decks · curated
      </div>
      <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">
        Find any deck.{' '}
        <span className="text-deck-accent">Open instantly.</span>
      </h2>

      {/* Centered search */}
      <div
        className={`mt-5 w-full max-w-2xl rounded-full bg-deck-card border-2 transition-all flex items-center gap-3 px-5 py-3 ${
          focused
            ? 'border-deck-accent shadow-2xl shadow-deck-accent/20 scale-[1.01]'
            : 'border-deck-border'
        }`}
      >
        <SearchIcon size={18} className="text-white/70 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Try ‘pitch deck’, ‘Tesla’, ‘design systems’…"
          className="flex-1 bg-transparent outline-none text-sm md:text-base placeholder:text-white/40"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="text-[10px] uppercase tracking-wider text-white/60 hover:text-white px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Quick suggestion + industry chips on one tidy row */}
      {!query && (
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
        <div className="mt-6 w-full max-w-4xl">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
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
        </div>
      )}
    </section>
  )
}
