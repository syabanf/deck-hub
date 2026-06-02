import { useState } from 'react'
import Cover from './Cover.jsx'
import { PlayIcon, InfoIcon, TrashIcon } from '../lib/icons.jsx'

export default function Card({ deck, onPlay, onDetails, onRemove, onCategoryClick }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className="group relative w-[280px] flex-shrink-0 cursor-pointer card-tilt"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onDetails(deck)}
    >
      <div className="aspect-deck rounded-md overflow-hidden ring-1 ring-deck-border shadow-lg">
        <Cover deck={deck} onCategoryClick={onCategoryClick} />
      </div>

      {/* Action bar appears on hover, anchored to bottom of the cover */}
      <div
        className={`absolute inset-x-0 bottom-0 p-3 flex items-center gap-2 transition-opacity ${
          hover ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPlay(deck)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-sm font-bold hover:bg-white/90 play-pulse shadow-lg"
          title="Open"
        >
          <PlayIcon size={14} />
          Open
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDetails(deck)
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/30 shadow-lg"
          title="Details"
        >
          <InfoIcon size={14} />
        </button>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(deck)
            }}
            className="ml-auto flex items-center justify-center w-8 h-8 rounded-full bg-black/60 hover:bg-red-600/80 border border-white/30 shadow-lg"
            title="Remove"
          >
            <TrashIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
