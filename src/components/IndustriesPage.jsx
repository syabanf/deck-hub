import { useMemo, useState } from 'react'
import { INDUSTRIES } from '../data/decks.js'
import { IndustryIcon } from '../lib/industryIcons.jsx'

// A dedicated (mock) cover photo per industry, seeded by id so each sector
// always gets the same image. The brand gradient washes over it, so the random
// photo reads as texture while the sector's colour + icon carry the meaning.
const industryImage = (id) =>
  `https://picsum.photos/seed/wit-industry-${id}/600/400`

function IndustryTile({ ind, count, onPick }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const hasDecks = count > 0

  return (
    <button
      onClick={() => onPick(ind.id)}
      className="group relative aspect-[5/3] rounded-xl overflow-hidden ring-1 ring-deck-border shadow-lg card-tilt text-left"
      style={{
        backgroundImage: `linear-gradient(135deg, ${ind.accent} 0%, ${ind.secondary || ind.accent} 100%)`,
      }}
    >
      {/* Mock cover image */}
      {!failed && (
        <img
          src={industryImage(ind.id)}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover img-fade ${
            loaded ? 'is-loaded' : ''
          } group-hover:scale-105 transition-transform duration-500`}
        />
      )}

      {/* Brand-colour wash so the sector's identity dominates the photo */}
      <div
        className="absolute inset-0 mix-blend-multiply opacity-80"
        style={{
          backgroundImage: `linear-gradient(135deg, ${ind.accent} 0%, ${ind.secondary || ind.accent} 100%)`,
        }}
      />

      {/* Large thematic icon watermark — the per-industry motif */}
      <IndustryIcon
        id={ind.id}
        className="absolute -right-3 -bottom-3 w-24 h-24 md:w-28 md:h-28 text-white/15 group-hover:text-white/25 group-hover:scale-110 transition-all duration-300 pointer-events-none"
      />

      {/* Dark bottom gradient for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

      {/* Crisp icon chip, top-right (replaces the old emoji) */}
      <span className="absolute top-3 right-3 flex items-center justify-center w-9 h-9 rounded-lg bg-black/30 backdrop-blur ring-1 ring-white/20 text-white group-hover:scale-110 transition-transform">
        <IndustryIcon id={ind.id} size={20} />
      </span>

      {/* Title + count */}
      <div className="absolute inset-x-0 bottom-0 p-3 md:p-4 z-10">
        <div className="font-black text-white drop-shadow-lg leading-tight text-sm md:text-base">
          {ind.title}
        </div>
        <div className="mt-1">
          <span
            className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
              hasDecks ? 'bg-white/30 text-white' : 'bg-white/10 text-white/60'
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
}

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
    <div className="px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen">
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
        {INDUSTRIES.map((ind) => (
          <IndustryTile
            key={ind.id}
            ind={ind}
            count={counts[ind.id] || 0}
            onPick={onPickIndustry}
          />
        ))}
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
