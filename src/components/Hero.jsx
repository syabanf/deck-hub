import { useState, useRef, useEffect } from 'react'
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
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)

  // A cached backdrop can decode before onLoad is wired up.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true)
  }, [])

  if (!deck) return null

  const slideCount = deck.slides?.length || deck.slidesCount
  const srcType = deck.source?.type
  const srcLabel =
    srcType === 'video'
      ? deck.source?.platform || 'Video'
      : srcType === 'pdf'
        ? 'PDF'
        : srcType === 'url'
          ? 'Linked deck'
          : null

  return (
    <section className="relative h-[58vh] min-h-[420px] sm:h-[72vh] sm:min-h-[500px] w-full overflow-hidden">
      {/* Backdrop photo (or gradient fallback), with a slow cinematic drift */}
      {!imgFailed ? (
        <img
          src={heroImage(deck)}
          alt=""
          ref={imgRef}
          onError={() => setImgFailed(true)}
          onLoad={() => setLoaded(true)}
          className={`ken-burns img-fade absolute inset-0 w-full h-full object-cover ${
            loaded ? 'is-loaded' : ''
          }`}
        />
      ) : (
        <div className="ken-burns absolute inset-0">
          <SlideBackground gradient={deck.gradient} pattern={deck.pattern} />
        </div>
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
      <div className="absolute inset-0 bg-gradient-to-r from-deck-bg/95 via-deck-bg/55 to-transparent pointer-events-none" />
      {/* Corner vignette for a cinematic frame */}
      <div className="absolute inset-0 hero-vignette pointer-events-none" />

      <div className="relative z-10 h-full flex items-end pb-10 sm:pb-16 px-5 sm:px-8 md:px-14 max-w-5xl">
        <div className="space-y-3 sm:space-y-4">
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

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.05] sm:leading-[1.02] drop-shadow-2xl">
            {deck.title}
          </h1>

          {deck.subtitle && (
            <p className="text-base sm:text-lg md:text-xl text-white/85 font-light max-w-2xl drop-shadow line-clamp-2">
              {deck.subtitle}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-white/85 font-medium">
            <span className="text-emerald-400 font-bold">{deck.year}</span>
            <span className="text-white/40">·</span>
            <span>{deck.author}</span>
            {(slideCount || srcLabel) && <span className="text-white/40">·</span>}
            {slideCount ? <span>{slideCount} slides</span> : srcLabel ? <span>{srcLabel}</span> : null}
            <span className="text-white/40">·</span>
            <button
              onClick={() => onDetails(deck)}
              className="text-white/85 hover:text-white underline-offset-2 hover:underline"
            >
              More info ›
            </button>
          </div>

          <p className="hidden sm:block text-sm md:text-base text-white/80 max-w-2xl leading-relaxed drop-shadow line-clamp-2">
            {deck.description}
          </p>

          <div className="flex gap-2.5 sm:gap-3 pt-1 sm:pt-2">
            <button
              onClick={() => onPlay(deck)}
              className="flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 bg-white text-black font-bold text-sm sm:text-base rounded-md whitespace-nowrap hover:bg-white/90 hover:-translate-y-0.5 active:translate-y-0 transition-[transform,background-color] duration-200 ease-out shadow-xl shadow-black/30 play-pulse"
            >
              <PlayIcon size={20} />
              Open Deck
            </button>
            <button
              onClick={() => onDetails(deck)}
              className="flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 bg-white/20 text-white font-bold text-sm sm:text-base rounded-md whitespace-nowrap backdrop-blur border border-white/15 hover:bg-white/30 hover:-translate-y-0.5 active:translate-y-0 transition-[transform,background-color] duration-200 ease-out"
            >
              <InfoIcon size={18} />
              More Info
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
