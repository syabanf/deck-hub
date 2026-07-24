import { useEffect } from 'react'
import Cover from './Cover.jsx'
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

        {/* Hero preview */}
        <div className="relative aspect-[16/8] bg-deck-card overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            {/* The modal draws its own title, category and year below, so the
                cover renders as artwork only — otherwise both stack up. */}
            <Cover deck={deck} minimal hideBadges />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-deck-surface via-deck-surface/60 to-transparent pointer-events-none" />
          <div className="absolute z-20 bottom-6 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-4xl font-black tracking-tight drop-shadow-lg">{deck.title}</h2>
              {deck.subtitle && (
                <p className="text-base text-white/80 mt-1 drop-shadow">{deck.subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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

        <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
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
              {deck.source?.type === 'url' && (
                <a
                  href={deck.source.value}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:underline break-all"
                >
                  {deck.source.value}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Attachments — only shown when present */}
        {deck.attachments && deck.attachments.length > 0 && (
          <div className="px-6 pb-6">
            <div className="text-xs uppercase tracking-wider text-deck-muted mb-3 flex items-center gap-2">
              <span>Materials</span>
              <span className="text-white/40 normal-case font-normal">
                · {deck.attachments.length} attached
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {deck.attachments.map((a) => {
                // Build a "sub-deck" so onPlay can render this attachment in the player
                const subDeck = {
                  ...deck,
                  title: a.label || deck.title,
                  source: {
                    type: a.type,
                    value: a.value,
                    kind: a.kind,
                    platform: a.platform,
                  },
                }
                return (
                  <button
                    key={a.id}
                    onClick={() => onPlay(subDeck)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-deck-card border border-deck-border hover:border-white/40 transition-colors group"
                  >
                    <span
                      className="w-9 h-9 rounded flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                      style={{ background: a.color || '#444' }}
                    >
                      {a.icon || '↗'}
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-semibold truncate">
                        {a.label}
                      </div>
                      <div className="text-xs text-deck-muted truncate">
                        {a.platform} · {a.type === 'video' ? 'plays as video' : 'opens embedded'}
                      </div>
                    </div>
                    <span className="text-xs text-white/40 group-hover:text-white">
                      Open ›
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
