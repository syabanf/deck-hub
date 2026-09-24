import { useEffect } from 'react'
import Cover from './Cover.jsx'
import ShareMenu from './ShareMenu.jsx'
import { linkLabel, safeHref } from '../lib/link.js'
import { useClosable } from '../lib/useClosable.js'
import {
  PlayIcon,
  CloseIcon,
  ClockIcon,
  TrashIcon,
  BookmarkIcon,
  BookmarkFilledIcon,
} from '../lib/icons.jsx'

export default function DetailsModal({
  onNotify,
  deck,
  onClose,
  onPlay,
  onRemove,
  onSearch,
  onCategoryNav,
  isFavorite = false,
  onToggleFavorite,
}) {
  const { closing, requestClose } = useClosable(onClose)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [requestClose])

  if (!deck) return null
  const totalSlides = deck.slides?.length || deck.slidesCount || 0
  const estMinutes = Math.max(1, Math.round(totalSlides * 0.4))

  // Preview thumbnails: up to 6 first slides (only for mock; PDFs/URLs show cover instead)

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm animate-fade-in ${
        closing ? 'is-closing' : ''
      }`}
      onClick={requestClose}
    >
      <div
        className="modal-panel relative w-full max-w-4xl my-12 mx-4 bg-deck-surface rounded-xl overflow-hidden ring-1 ring-deck-border shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={requestClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
          aria-label="Close"
        >
          <CloseIcon size={20} />
        </button>

        {/* Hero preview.
            The artwork and the header are separate boxes, and only the artwork
            is clipped. Both used to live in one `aspect-[16/8] overflow-hidden`
            box with the header absolutely positioned at its bottom — which
            meant a long title grew *upward*, out of the top of the panel. On a
            phone "Warehouse Management System WMS 1.0" ran off the top edge and
            collided with the close button, and the Open control was pushed off
            the right. Neither could be reached.

            So below `sm` the header is an ordinary block under the picture and
            the modal simply gets taller, the way a phone has room to be. At
            `sm` and up it goes back to sitting over the gradient, anchored to
            the bottom of this container — which is exactly the height of the
            artwork, because an absolutely positioned child adds nothing to it. */}
        <div className="relative bg-deck-card">
          <div className="relative aspect-[16/9] sm:aspect-[16/8] overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              {/* The modal draws its own title, category and year below, so the
                  cover renders as artwork only — otherwise both stack up. */}
              <Cover deck={deck} minimal hideBadges />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-deck-surface via-deck-surface/60 to-transparent pointer-events-none" />
          </div>

          <div className="px-4 pt-4 sm:px-0 sm:pt-0 sm:absolute sm:z-20 sm:bottom-6 sm:left-6 sm:right-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            {/* min-w-0 is load-bearing once these share a row: a flex child
                defaults to min-width:auto and refuses to shrink below its own
                content, which is what pushed the buttons off the edge. */}
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight drop-shadow-lg break-words">
                {deck.title}
              </h2>
              {deck.subtitle && (
                <p className="text-sm sm:text-base text-white/80 mt-1 drop-shadow">{deck.subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ShareMenu deck={deck} onNotify={onNotify} />
              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  title={isFavorite ? 'In My Library' : 'Add to My Library'}
                  aria-label={isFavorite ? 'Remove from My Library' : 'Add to My Library'}
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-2 backdrop-blur transition-colors ${
                    isFavorite
                      ? 'bg-white/20 border-white text-white'
                      : 'bg-black/40 border-white/60 hover:border-white text-white'
                  }`}
                >
                  {isFavorite ? <BookmarkFilledIcon size={20} /> : <BookmarkIcon size={20} />}
                </button>
              )}
              <button
                onClick={() => onPlay(deck)}
                className="flex items-center gap-2 px-5 py-3 bg-white text-black font-bold rounded hover:bg-white/90 play-pulse shadow-lg"
              >
                <PlayIcon size={20} />
                Open
              </button>
            </div>
          </div>
        </div>

        {/* Matches the header's gutter on a phone, which is narrower than the
            desktop one — 24px on each side of a 375px screen is a sixth of it. */}
        <div className="px-4 sm:px-6 py-5 sm:py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-deck-muted">
              <span className="text-emerald-400 font-semibold">{deck.year}</span>
              <span>·</span>
              {onSearch ? (
                <button
                  onClick={() => {
                    onSearch(deck.author)
                    onClose()
                  }}
                  className="text-white/85 hover:text-white underline-offset-2 hover:underline"
                  title={`More by ${deck.author}`}
                >
                  {deck.author}
                </button>
              ) : (
                <span>{deck.author}</span>
              )}
              {totalSlides > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <ClockIcon size={14} />
                    {estMinutes} min read
                  </span>
                  <span>·</span>
                  <span>{totalSlides} slides</span>
                </>
              )}
              {onCategoryNav && deck.category && deck.category !== 'mine' && (
                <>
                  <span>·</span>
                  <button
                    onClick={() => {
                      onCategoryNav(deck.category)
                      onClose()
                    }}
                    className="text-deck-accent font-semibold uppercase tracking-wider text-xs hover:underline"
                  >
                    {deck.category}
                  </button>
                </>
              )}
            </div>
            <p className="text-base text-white/85 leading-relaxed">
              {deck.description || 'No description.'}
            </p>
            {deck.tags && deck.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {deck.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (onSearch) {
                        onSearch(t)
                        onClose()
                      }
                    }}
                    className={`text-xs uppercase tracking-wider px-2 py-1 rounded bg-white/5 text-white/70 ${
                      onSearch ? 'hover:bg-white/15 hover:text-white cursor-pointer' : ''
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {onRemove && (
              <button
                onClick={() => {
                  onRemove(deck)
                  onClose()
                }}
                className="mt-2 inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
              >
                <TrashIcon size={14} />
                Remove deck
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-deck-muted">Source</div>
            <div className="text-sm">
              {deck.source?.type === 'pdf' && 'Uploaded PDF'}
              {deck.source?.type === 'video' && (deck.source.platform || 'Video')}
              {/* A gallery has no address worth printing — what it is, is how
                  many photos are in it. A count of zero should not happen (a
                  gallery is created from its photos), so it says "Photos"
                  rather than "0 photos" if it ever does. */}
              {deck.source?.type === 'photos' &&
                (deck.images?.length
                  ? `${deck.images.length} photo${deck.images.length === 1 ? '' : 's'}`
                  : 'Photos')}
              {deck.source?.type === 'url' && (
                /* The host, not the whole URL. A pasted Canva or Slides link
                   drags its utm_* trail along and printed in full it filled
                   this panel with tracking parameters nobody reads. The href
                   is still the complete URL — this shortens the label, never
                   the destination, so the link goes where it says it goes. */
                <a
                  href={safeHref(deck.source.value)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:underline break-all"
                  title={deck.source.value}
                >
                  {linkLabel(deck.source.value) || deck.source.value}
                  <span aria-hidden="true" className="text-deck-muted ml-1">↗</span>
                </a>
              )}
            </div>
          </div>
        </div>

</div>
    </div>
  )
}
