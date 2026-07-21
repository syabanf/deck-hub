import { useRef, useState, useEffect } from 'react'
import Card from './Card.jsx'
import { smoothScrollBy, attachScrollCancel } from '../lib/scroll.js'
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
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(0)

  const updateScrollState = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    const p = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth))
    setPages(p)
    setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  useEffect(() => {
    updateScrollState()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    const detachCancel = attachScrollCancel(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
      detachCancel()
    }
  }, [decks])

  const scrollBy = (dir) => {
    const el = scrollerRef.current
    if (!el) return
    smoothScrollBy(el, dir * el.clientWidth * 0.82)
  }

  if (!decks || decks.length === 0) return null

  return (
    <section className="mb-8 group/row">
      <div className="px-8 md:px-12 mb-2 flex items-end justify-between gap-3">
        <div>
          {onTitleClick ? (
            <button
              onClick={onTitleClick}
              className="group/title inline-flex items-baseline gap-2 hover:text-white"
            >
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
              <span className="text-sm text-deck-accent font-bold opacity-0 -translate-x-1 group-hover/title:opacity-100 group-hover/title:translate-x-0 transition-[opacity,transform] duration-200 ease-out">
                Explore all ›
              </span>
            </button>
          ) : (
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
          )}
          {subtitle && <p className="text-sm text-deck-muted mt-1">{subtitle}</p>}
        </div>

        {/* Segmented page indicator — Netflix's row progress marks. */}
        {pages > 1 && (
          <div className="hidden md:flex items-center gap-1 pb-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {Array.from({ length: Math.min(pages, 8) }).map((_, i) => (
              <span
                key={i}
                className={`h-0.5 w-4 rounded-full transition-colors ${
                  i === Math.min(page, 7) ? 'bg-white/90' : 'bg-white/25'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="deck-row flex gap-3 px-8 md:px-12 pt-6 pb-10 overflow-x-auto no-scrollbar scroll-snap-x"
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
            className="hidden md:flex absolute left-0 top-6 bottom-10 w-14 items-center justify-start pl-2 row-arrow-fade-left opacity-0 group-hover/row:opacity-100 transition-opacity z-20"
            aria-label="Scroll left"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 hover:scale-110 transition-[transform,background-color] duration-200 ease-out">
              <ChevronLeft size={22} />
            </span>
          </button>
        )}
        {canNext && (
          <button
            onClick={() => scrollBy(1)}
            className="hidden md:flex absolute right-0 top-6 bottom-10 w-14 items-center justify-end pr-2 row-arrow-fade opacity-0 group-hover/row:opacity-100 transition-opacity z-20"
            aria-label="Scroll right"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 hover:scale-110 transition-[transform,background-color] duration-200 ease-out">
              <ChevronRight size={22} />
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
