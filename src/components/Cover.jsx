import { useState, useRef, useEffect } from 'react'
import SlideBackground from './SlideBackground.jsx'

const CATEGORY_LABEL = {
  'company-profile': 'Company',
  iconic: 'Pitch Deck',
  design: 'Design',
  engineering: 'Engineering',
  strategy: 'Strategy',
  keynotes: 'Keynote',
  mine: 'Library',
}

const imageSrc = (deck, w = 800, h = 500) => {
  if (deck.image) return deck.image
  const seed = deck.imageSeed || deck.id || deck.title
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`
}

// Netflix-style poster: photographic thumbnail with gradient overlay + title + badge.
// Falls back to the gradient pattern if the image fails to load.
// `minimal`: hides the bottom title block so the caller can render its own (used in grid views).
export default function Cover({
  deck,
  sizeClass = 'text-xs',
  large = false,
  minimal = false,
  onCategoryClick,
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)

  // A cached image can finish decoding before onLoad is wired up, which would
  // otherwise leave it stuck at opacity 0.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true)
  }, [])
  const categoryLabel = CATEGORY_LABEL[deck.category] || ''
  const isLinked = deck.source?.type === 'url'
  const isPdf = deck.source?.type === 'pdf'
  const isVideo = deck.source?.type === 'video'
  const slideCount = deck.slides?.length || deck.slidesCount

  const bottomBlock = !minimal ? (
    <div className="cover-caption absolute inset-x-0 bottom-0 p-3 z-10 max-h-[58%] flex flex-col justify-end">
      <div
        className="font-black leading-[1.1] tracking-tight text-white drop-shadow-lg overflow-hidden"
        style={{
          fontSize: '1.2em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {deck.title}
      </div>
      {deck.subtitle && (
        <div className="text-white/80 mt-0.5 truncate" style={{ fontSize: '0.78em' }}>
          {deck.subtitle}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1.5 text-white/70" style={{ fontSize: '0.68em' }}>
        <span className="truncate flex-1">{deck.author}</span>
        {slideCount ? (
          <>
            <span>·</span>
            <span className="font-semibold whitespace-nowrap">{slideCount} slides</span>
          </>
        ) : null}
        {(isLinked || isPdf || isVideo) && (
          <>
            <span>·</span>
            <span
              className={
                isVideo ? 'text-rose-300' : isLinked ? 'text-emerald-300' : 'text-blue-300'
              }
            >
              {isVideo ? 'Video' : isLinked ? 'Linked' : 'PDF'}
            </span>
          </>
        )}
        {deck.attachments && deck.attachments.length > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-300">+{deck.attachments.length}</span>
          </>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className={`relative w-full h-full overflow-hidden bg-deck-card ${sizeClass}`}>
      {!imgFailed && (
        <img
          src={imageSrc(deck, large ? 1600 : 800, large ? 900 : 500)}
          alt=""
          ref={imgRef}
          onError={() => setImgFailed(true)}
          onLoad={() => setLoaded(true)}
          loading="lazy"
          className={`poster-zoom img-fade absolute inset-0 w-full h-full object-cover ${
            loaded ? 'is-loaded' : ''
          }`}
        />
      )}
      {imgFailed && (
        <div className="poster-zoom absolute inset-0">
          <SlideBackground gradient={deck.gradient} pattern={deck.pattern} />
        </div>
      )}

      {/* Color wash so text is legible no matter the photo */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${deck.gradient?.from || '#222'}55 0%, transparent 45%, rgba(0,0,0,0.85) 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-0 inset-x-0 p-3 flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          {deck.featured && (
            <span className="text-[10px] uppercase tracking-widest font-black text-deck-accent bg-black/50 backdrop-blur px-1.5 py-0.5 rounded">
              Featured
            </span>
          )}
          {categoryLabel && (
            onCategoryClick && deck.category !== 'mine' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCategoryClick(deck.category)
                }}
                className="text-[10px] uppercase tracking-widest font-semibold text-white/90 bg-black/50 hover:bg-black/80 backdrop-blur px-1.5 py-0.5 rounded transition-colors"
                title={`More in ${categoryLabel}`}
              >
                {categoryLabel}
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-widest font-semibold text-white/90 bg-black/50 backdrop-blur px-1.5 py-0.5 rounded">
                {categoryLabel}
              </span>
            )
          )}
        </div>
        <span className="text-[10px] font-semibold text-white/90 bg-black/50 backdrop-blur rounded px-1.5 py-0.5">
          {deck.year}
        </span>
      </div>

      {bottomBlock}
    </div>
  )
}
