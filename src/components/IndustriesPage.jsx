import { useMemo } from 'react'
import { INDUSTRIES } from '../data/decks.js'

export default function IndustriesPage({ onPickIndustry, decks = [] }) {
  const counts = useMemo(() => {
    const map = Object.fromEntries(INDUSTRIES.map((i) => [i.id, 0]))
    for (const d of decks) {
      if (d.industry && map[d.industry] !== undefined) map[d.industry]++
    }
    return map
  }, [decks])

  const total = decks.filter((d) => d.industry).length

  return (
    <div className="px-6 md:px-12 pt-28 pb-16 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
          Browse
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">Industries</h1>
        <p className="text-deck-muted mt-1 max-w-2xl">
          Sector-specific decks — from F&amp;B and manufacturing to energy, logistics, and beyond.
          Pick an industry to filter the catalog.
        </p>
        <div className="text-sm text-white/60 mt-3">
          {INDUSTRIES.length} industries · {total} sector-tagged decks
        </div>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
        {INDUSTRIES.map((ind) => {
          const count = counts[ind.id] || 0
          const hasDecks = count > 0
          return (
            <button
              key={ind.id}
              onClick={() => onPickIndustry(ind.id)}
              className="group relative aspect-[5/3] rounded-xl overflow-hidden ring-1 ring-deck-border shadow-lg card-tilt"
              style={{
                backgroundImage: `linear-gradient(135deg, ${ind.accent} 0%, ${ind.secondary || ind.accent} 100%)`,
              }}
            >
              {/* Subtle dot pattern for visual interest */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              />
              {/* Dark bottom gradient for legibility */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

              {/* Big emoji icon top-right */}
              <div className="absolute top-3 right-3 text-3xl md:text-4xl drop-shadow-lg select-none opacity-90 group-hover:scale-110 group-hover:rotate-6 transition-transform">
                {ind.icon}
              </div>

              {/* Title + count */}
              <div className="absolute inset-x-0 bottom-0 p-3 md:p-4 z-10">
                <div className="font-black text-white drop-shadow-lg leading-tight text-sm md:text-base">
                  {ind.title}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                      hasDecks
                        ? 'bg-white/30 text-white'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {hasDecks ? `${count} ${count === 1 ? 'deck' : 'decks'}` : 'coming soon'}
                  </span>
                </div>
              </div>

              {/* Hover shine */}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
            </button>
          )
        })}
      </div>

      {/* Helper */}
      <div className="mt-10 text-center text-xs text-deck-muted">
        Don&apos;t see your industry?{' '}
        <span className="text-white/70">
          Add a deck — pick an industry in the form, or it joins your library by default.
        </span>
      </div>
    </div>
  )
}
