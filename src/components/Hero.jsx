import { useState } from 'react'
import SlideBackground from './SlideBackground.jsx'
import { PlayIcon, InfoIcon } from '../lib/icons.jsx'

const CATEGORY_LABELS = {
  'company-profile': 'Company Profile',
  iconic: 'Iconic Pitch Deck',
  design: 'Design & Brand',
  engineering: 'Engineering & AI',
  strategy: 'Startup Strategy',
  keynotes: 'Keynote',
  mine: 'My Library',
}

const heroImage = (deck) => {
  if (deck.heroImage) return deck.heroImage
  if (deck.image) return deck.image
  const seed = deck.imageSeed || deck.id || deck.title
  return `https://picsum.photos/seed/${encodeURIComponent(seed + '-hero')}/2000/1100`
}

export default function Hero({ deck, onPlay, onDetails, onCategoryNav }) {
  const [imgFailed, setImgFailed] = useState(false)
  if (!deck) return null

  return (
    <section className="relative h-[72vh] min-h-[500px] w-full overflow-hidden">
      {/* Backdrop photo (or gradient fallback) */}
      {!imgFailed ? (
        <img
          src={heroImage(deck)}
          alt=""
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <SlideBackground gradient={deck.gradient} pattern={deck.pattern} />
      )}

      {/* Accent wash from the deck's gradient — gives identity even over a photo */}
      <div
        className="absolute inset-0 mix-blend-multiply"
        style={{
          backgroundImage: `linear-gradient(135deg, ${deck.gradient?.from || '#222'}30 0%, ${deck.gradient?.to || '#111'}50 100%)`,
        }}
      />

      {/* Bottom fade into page */}
      <div className="absolute inset-0 hero-fade pointer-events-none" />
      {/* Left fade for legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-deck-bg/95 via-deck-bg/60 to-transparent pointer-events-none" />

      <div className="relative z-10 h-full flex items-end pb-16 px-8 md:px-14 max-w-5xl">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase font-semibold text-white/70">
            <span className="px-2 py-0.5 rounded bg-deck-accent text-white font-bold tracking-wider">
              Featured
            </span>
            <span className="hidden sm:inline">·</span>
            {onCategoryNav ? (
              <button
                onClick={() => onCategoryNav(deck.category)}
                className="hidden sm:inline hover:text-white transition-colors"
              >
                {CATEGORY_LABELS[deck.category] || 'Deck'} ›
              </button>
            ) : (
              <span className="hidden sm:inline">{CATEGORY_LABELS[deck.category] || 'Deck'}</span>
            )}
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.02] drop-shadow-2xl">
            {deck.title}
          </h1>

          {deck.subtitle && (
            <p className="text-lg md:text-xl text-white/85 font-light max-w-2xl drop-shadow">
              {deck.subtitle}
            </p>
          )}

          <div className="flex items-center gap-3 text-sm text-white/85 font-medium">
            <span className="text-emerald-400 font-bold">{deck.year}</span>
            <span className="text-white/40">·</span>
            <span>{deck.author}</span>
            <span className="text-white/40">·</span>
            <span>{deck.slides?.length || deck.slidesCount || '—'} slides</span>
            <span className="text-white/40">·</span>
            <button
              onClick={() => onDetails(deck)}
              className="text-white/85 hover:text-white underline-offset-2 hover:underline"
            >
              Slide list ›
            </button>
          </div>

          <p className="text-sm md:text-base text-white/80 max-w-2xl leading-relaxed drop-shadow line-clamp-2">
            {deck.description}
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onPlay(deck)}
              className="flex items-center gap-2 px-7 py-3 bg-white text-black font-semibold rounded hover:bg-white/90 transition-colors play-pulse"
            >
              <PlayIcon size={22} />
              Open Deck
            </button>
            <button
              onClick={() => onDetails(deck)}
              className="flex items-center gap-2 px-7 py-3 bg-white/25 text-white font-semibold rounded backdrop-blur hover:bg-white/35 transition-colors"
            >
              <InfoIcon size={20} />
              More Info
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
