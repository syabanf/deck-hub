import { useRef, useState, useEffect } from 'react'
import Cover from './Cover.jsx'
import { ChevronLeft, ChevronRight } from '../lib/icons.jsx'

// Netflix-signature row: giant outlined numerals beside each cover.
export default function TopTenRow({ title, subtitle, decks, onPlay, onDetails, onTitleClick, onCategoryClick }) {
  const scrollerRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)

  const updateScrollState = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateScrollState()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [decks])

  const scrollBy = (dir) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (!decks || decks.length === 0) return null
  const top = decks.slice(0, 10)

  return (
    <section className="mb-12 group/row">
      <div className="px-8 md:px-12 mb-3 flex items-baseline gap-3">
        {onTitleClick ? (
          <button
            onClick={onTitleClick}
            className="group/title inline-flex items-baseline gap-2 hover:text-white"
          >
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
            <span className="text-sm text-deck-accent font-bold opacity-0 -translate-x-1 group-hover/title:opacity-100 group-hover/title:translate-x-0 transition-all">
              Explore all ›
            </span>
          </button>
        ) : (
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
        )}
        <span className="text-xs uppercase tracking-widest font-bold text-deck-accent">
          Top 10
        </span>
      </div>
      {subtitle && (
        <p className="px-8 md:px-12 text-sm text-deck-muted mb-3 -mt-2">{subtitle}</p>
      )}

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-4 px-8 md:px-12 pb-10 overflow-x-auto no-scrollbar scroll-snap-x"
        >
          {top.map((deck, i) => (
            <div
              key={deck.id}
              className="relative flex items-end flex-shrink-0 cursor-pointer card-tilt"
              onClick={() => onDetails(deck)}
              style={{ width: 380 }}
            >
              {/* Giant numeral on the left, outlined */}
              <div
                className="select-none font-black leading-[0.78] text-deck-bg pointer-events-none"
                style={{
                  fontSize: 240,
                  WebkitTextStroke: '4px #4a4a55',
                  textShadow: '0 0 0 transparent',
                  marginRight: -52,
                  zIndex: 0,
                }}
              >
                {i + 1}
              </div>
              <div className="relative z-10 aspect-deck w-[220px] rounded-md overflow-hidden ring-1 ring-deck-border shadow-2xl">
                <Cover deck={deck} sizeClass="text-xs" onCategoryClick={onCategoryClick} />
              </div>
            </div>
          ))}
        </div>

        {canPrev && (
          <button
            onClick={() => scrollBy(-1)}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-20 items-center justify-center bg-black/60 hover:bg-black/80 rounded-r-md opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label="Scroll left"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {canNext && (
          <button
            onClick={() => scrollBy(1)}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-20 items-center justify-center bg-black/60 hover:bg-black/80 rounded-l-md opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label="Scroll right"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </section>
  )
}
