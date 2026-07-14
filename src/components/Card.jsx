import { useRef, useState } from 'react'
import Cover from './Cover.jsx'
import {
  PlayIcon,
  PlusIcon,
  CheckIcon,
  ThumbsUpIcon,
  ChevronDown,
  TrashIcon,
} from '../lib/icons.jsx'

// A round icon button in the hover panel's action cluster.
function CircleBtn({ children, onClick, title, filled = false, active = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center justify-center rounded-full transition-all duration-150 hover:scale-110 active:scale-95 ${
        filled
          ? 'w-9 h-9 bg-white text-black hover:bg-white/90 shadow-lg'
          : `w-8 h-8 border text-white backdrop-blur ${
              active
                ? 'border-white bg-white/20'
                : 'border-white/40 bg-black/40 hover:border-white'
            }`
      }`}
    >
      {children}
    </button>
  )
}

export default function Card({ deck, onPlay, onDetails, onRemove, onCategoryClick }) {
  const [hover, setHover] = useState(false)
  const [listed, setListed] = useState(false)
  const [liked, setLiked] = useState(false)
  const timer = useRef(null)

  // Netflix-style delay before the card expands, so a quick skim doesn't
  // trigger a wall of expanding cards.
  const enter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setHover(true), 260)
  }
  const leave = () => {
    clearTimeout(timer.current)
    setHover(false)
  }

  const slides = deck.slides?.length || deck.slidesCount
  const tags = (deck.tags || []).slice(0, 3)
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn?.(e)
  }

  return (
    <div
      className="relative w-[280px] flex-shrink-0"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div
        className={`hover-card group relative cursor-pointer ${hover ? 'is-hovered' : ''}`}
        onClick={() => onDetails(deck)}
      >
        <div className="aspect-deck rounded-md overflow-hidden ring-1 ring-deck-border shadow-lg">
          <Cover deck={deck} onCategoryClick={onCategoryClick} />
        </div>

        {/* Expanded hover panel: action cluster + rich metadata, over the
            lower poster. Scales with the card, so no row-overflow clipping. */}
        <div
          className={`hover-panel absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 rounded-b-md bg-gradient-to-t from-black via-black/90 to-transparent ${
            hover ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <CircleBtn filled title="Open deck" onClick={stop(() => onPlay(deck))}>
              <PlayIcon size={16} />
            </CircleBtn>
            <CircleBtn
              title={listed ? 'On your list' : 'Add to My List'}
              active={listed}
              onClick={stop(() => setListed((v) => !v))}
            >
              {listed ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
            </CircleBtn>
            <CircleBtn
              title="Like"
              active={liked}
              onClick={stop(() => setLiked((v) => !v))}
            >
              <ThumbsUpIcon size={14} />
            </CircleBtn>
            {onRemove && (
              <CircleBtn title="Remove" onClick={stop(() => onRemove(deck))}>
                <TrashIcon size={14} />
              </CircleBtn>
            )}
            <CircleBtn
              title="More info"
              onClick={stop(() => onDetails(deck))}
            >
              <ChevronDown size={16} />
            </CircleBtn>
          </div>

          <div className="mt-2.5 leading-tight">
            <div className="text-sm font-bold line-clamp-1 drop-shadow">{deck.title}</div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/70">
              {deck.featured ? (
                <span className="text-emerald-400 font-bold">Featured</span>
              ) : (
                <span className="text-emerald-400 font-bold">{deck.year}</span>
              )}
              {slides ? (
                <>
                  <span className="text-white/30">•</span>
                  <span>{slides} slides</span>
                </>
              ) : null}
              <span className="text-white/30">•</span>
              <span className="border border-white/30 rounded px-1 leading-normal text-[10px] uppercase tracking-wide">
                {deck.author?.split(' ')[0] || 'Deck'}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-white/80 flex-wrap">
                {tags.map((t, i) => (
                  <span key={t} className="flex items-center gap-1.5">
                    {i > 0 && <span className="w-1 h-1 rounded-full bg-white/40" />}
                    <span className="capitalize">{t}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
