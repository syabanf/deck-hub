import { useRef, useState, useEffect } from 'react'
import Card from './Card.jsx'
import { ChevronLeft, ChevronRight } from '../lib/icons.jsx'

export default function Row({
  title,
  subtitle,
  decks,
  onPlay,
  onDetails,
  onRemove,
  onTitleClick,
  onCategoryClick,
}) {
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

  return (
    <section className="mb-10 group/row">
      <div className="px-8 md:px-12 mb-3">
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
        {subtitle && <p className="text-sm text-deck-muted mt-1">{subtitle}</p>}
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-3 px-8 md:px-12 pb-8 overflow-x-auto no-scrollbar scroll-snap-x"
        >
          {decks.map((deck) => (
            <Card
              key={deck.id}
              deck={deck}
              onPlay={onPlay}
              onDetails={onDetails}
              onRemove={onRemove}
              onCategoryClick={onCategoryClick}
            />
          ))}
        </div>

        {canPrev && (
          <button
            onClick={() => scrollBy(-1)}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-16 items-center justify-center bg-black/60 hover:bg-black/80 rounded-r-md opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label="Scroll left"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {canNext && (
          <button
            onClick={() => scrollBy(1)}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-16 items-center justify-center bg-black/60 hover:bg-black/80 rounded-l-md opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label="Scroll right"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </section>
  )
}
