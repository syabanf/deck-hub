import { useCallback, useEffect, useRef, useState } from 'react'
import { toEmbedUrl } from '../lib/embed.js'
import {
  loadPdfDocument,
  loadPdfDocumentFromUrl,
  renderPdfPageToCanvas,
  base64ToArrayBuffer,
} from '../lib/pdf.js'
import { recordView } from '../lib/storage.js'
import { useClosable } from '../lib/useClosable.js'
import { useSwipe } from '../lib/useSwipe.js'
import { useVideoControls } from '../lib/useVideoControls.js'
import { formatTime } from '../lib/videoControl.js'
import {
  CloseIcon,
  ChevronLeft,
  ChevronRight,
  FullscreenIcon,
  ExitFullscreenIcon,
  PlayIcon,
  PauseIcon,
  Replay10Icon,
  Forward10Icon,
} from '../lib/icons.jsx'

// A deck's PDF is either an uploaded file served over HTTP (source.remote) or
// legacy inline base64.
const openPdf = (source) =>
  source.remote
    ? loadPdfDocumentFromUrl(source.value)
    : loadPdfDocument(base64ToArrayBuffer(source.value))

const PdfSlideStage = ({ deck, index }) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const d = await openPdf(deck.source)
        if (!cancelled) setDoc(d)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load PDF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deck.id])

  useEffect(() => {
    if (!doc || !canvasRef.current || !containerRef.current) return
    let cancelled = false
    const renderPage = async () => {
      const targetWidth = containerRef.current.clientWidth
      try {
        await renderPdfPageToCanvas(doc, index + 1, canvasRef.current, targetWidth)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    renderPage()
    return () => {
      cancelled = true
    }
  }, [doc, index])

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden bg-white shadow-2xl flex items-center justify-center"
      style={{ minHeight: '60vh' }}
    >
      {loading && (
        <div className="text-gray-700 py-12 text-sm">Loading PDF…</div>
      )}
      {error && (
        <div className="text-red-600 py-12 text-sm">PDF error: {error}</div>
      )}
      {!loading && !error && <canvas ref={canvasRef} className="block" />}
    </div>
  )
}

const UrlStage = ({ deck }) => {
  const url = deck.source.value
  const embedUrl = toEmbedUrl(url)
  return (
    <div className="aspect-[16/9] w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black">
      <iframe
        src={embedUrl}
        title={deck.title}
        className="w-full h-full"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

const VideoStage = ({ deck, mediaRef }) => {
  const { value, kind } = deck.source
  if (kind === 'native') {
    return (
      <div className="aspect-[16/9] w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black">
        <video
          ref={mediaRef}
          src={value}
          controls
          autoPlay
          className="w-full h-full object-contain bg-black"
        />
      </div>
    )
  }
  return (
    <div className="aspect-[16/9] w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black">
      <iframe
        ref={mediaRef}
        src={value}
        title={deck.title}
        className="w-full h-full"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export default function DeckPlayer({
  deck,
  startIndex = 0,
  onClose,
  // Sibling decks so "next" means something even for embeds we can't page.
  playlist = [],
  onSelectDeck,
}) {
  const { closing, requestClose } = useClosable(onClose)
  const [index, setIndex] = useState(startIndex)
  const [isFull, setIsFull] = useState(false)
  const [pdfPageCount, setPdfPageCount] = useState(null)
  const containerRef = useRef(null)
  const mediaRef = useRef(null)

  // Every persisted deck has a source type; 'url' is the safe fallback for a
  // malformed one, since it renders in an iframe without dereferencing anything.
  const sourceType = deck.source?.type || 'url'

  // For PDFs, discover page count up front so navigation works.
  useEffect(() => {
    if (sourceType !== 'pdf') return
    let cancelled = false
    ;(async () => {
      try {
        const d = await openPdf(deck.source)
        if (!cancelled) setPdfPageCount(d.numPages)
      } catch {
        if (!cancelled) setPdfPageCount(1)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deck.id, sourceType])

  const totalSlides = sourceType === 'pdf' ? (pdfPageCount || deck.slidesCount || 1) : 1

  // Only PDFs page in-app. Cross-origin embeds own their own navigation.
  const canNavigate = sourceType === 'pdf'
  const goPrev = () => canNavigate && setIndex((i) => Math.max(0, i - 1))
  const goNext = () => canNavigate && setIndex((i) => Math.min(totalSlides - 1, i + 1))

  // Deck-level navigation. Cross-origin embeds (Google Slides, YouTube) can't
  // be paged from here, so for those this *is* the "next" control.
  const deckPos = playlist.findIndex((d) => d.id === deck.id)
  const hasDeckNav = !!onSelectDeck && deckPos !== -1 && playlist.length > 1
  const hasPrevDeck = hasDeckNav && deckPos > 0
  const hasNextDeck = hasDeckNav && deckPos < playlist.length - 1
  const goPrevDeck = () => hasPrevDeck && onSelectDeck(playlist[deckPos - 1])
  const goNextDeck = () => hasNextDeck && onSelectDeck(playlist[deckPos + 1])

  // Slides start from the top whenever the deck changes.
  useEffect(() => {
    setIndex(startIndex)
  }, [deck.id, startIndex])

  // Playback control for uploaded videos and YouTube embeds. Anything else
  // reports unsupported and we defer to the provider's own controls.
  const media = useVideoControls(mediaRef, deck.source)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') return requestClose()
      if (e.key === 'f' || e.key === 'F') return toggleFullscreen()

      // N / P always step decks, whichever kind of deck is open.
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        return goNextDeck()
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        return goPrevDeck()
      }

      const next = e.key === 'ArrowRight' || e.key === ' ' || e.key === 'l' || e.key === 'j'
      const prev = e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'k'

      if (canNavigate) {
        if (next) { e.preventDefault(); goNext() }
        if (prev) { e.preventDefault(); goPrev() }
        if (e.key === 'Home') setIndex(0)
        if (e.key === 'End') setIndex(totalSlides - 1)
        return
      }

      // Embeds have no slides of our own to page — arrows move between decks.
      // Space is left alone so it still plays/pauses the embedded player.
      if (e.key === 'ArrowRight') { e.preventDefault(); goNextDeck() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevDeck() }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [requestClose, totalSlides, canNavigate, deckPos, playlist.length])

  useEffect(() => {
    recordView(deck.id, index, totalSlides)
  }, [deck.id, index, totalSlides])

  useEffect(() => {
    const onFsChange = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {})
    } else {
      await document.exitFullscreen().catch(() => {})
    }
  }

  const progress = totalSlides > 1 ? ((index + 1) / totalSlides) * 100 : 100

  // Touch: swipe to page slides (or step decks for embeds), swipe down to
  // close. Ignore the media itself and the control buttons so their own
  // gestures/taps aren't hijacked.
  // Swipe to page slides (or step decks for embeds), swipe down to close.
  // Ignores the media and control buttons so their own gestures aren't hijacked.
  const swipeRef = useSwipe({
    onLeft: () => (canNavigate ? goNext() : goNextDeck()),
    onRight: () => (canNavigate ? goPrev() : goPrevDeck()),
    onDown: () => requestClose(),
    ignore: 'iframe, video, button, a, input',
  })
  // The container also needs containerRef for fullscreen — merge both.
  const setStageRef = useCallback(
    (node) => {
      containerRef.current = node
      swipeRef(node)
    },
    [swipeRef],
  )

  return (
    <div
      ref={setStageRef}
      className={`fixed inset-0 z-50 bg-black flex flex-col animate-fade-in ${closing ? 'is-closing' : ''}`}
    >
      {/* Top progress bar */}
      <div className="absolute top-0 inset-x-0 h-1 bg-white/10 z-20">
        <div
          className="h-full bg-deck-accent transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-sm">
          <div className="font-semibold">{deck.title}</div>
          <div className="text-white/60 text-xs">{deck.author} · {deck.year}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            title="Fullscreen (F)"
          >
            {isFull ? <ExitFullscreenIcon size={18} /> : <FullscreenIcon size={18} />}
          </button>
          <button
            onClick={requestClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            title="Close (Esc)"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-12 py-16 relative">
        {sourceType === 'pdf' && <PdfSlideStage deck={deck} index={index} />}
        {sourceType === 'url' && <UrlStage deck={deck} />}
        {sourceType === 'video' && <VideoStage deck={deck} mediaRef={mediaRef} />}

        {/* Click zones for prev / next */}
        {canNavigate && (
          <>
            <button
              onClick={goPrev}
              className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize group/zone focus:outline-none"
              aria-label="Previous slide"
            >
              <div className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 items-center justify-center opacity-0 group-hover/zone:opacity-100 transition-opacity">
                <ChevronLeft size={24} />
              </div>
            </button>
            <button
              onClick={goNext}
              className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize group/zone focus:outline-none"
              aria-label="Next slide"
            >
              <div className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 items-center justify-center opacity-0 group-hover/zone:opacity-100 transition-opacity">
                <ChevronRight size={24} />
              </div>
            </button>
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-6 py-4 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-xs text-white/70">
        <div className="hidden sm:flex items-center gap-3">
          {canNavigate ? (
            <>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">←</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">→</kbd>
              <span>slides</span>
            </>
          ) : sourceType === 'video' && media.supported ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => media.seekBy(-10)}
                title="Back 10s"
                aria-label="Back 10 seconds"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <Replay10Icon size={16} />
              </button>
              <button
                onClick={media.togglePlay}
                title={media.isPlaying ? 'Pause' : 'Play'}
                aria-label={media.isPlaying ? 'Pause' : 'Play'}
                className="w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
              >
                {media.isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={15} />}
              </button>
              <button
                onClick={() => media.seekBy(10)}
                title="Forward 10s"
                aria-label="Forward 10 seconds"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <Forward10Icon size={16} />
              </button>
              {media.duration > 0 && (
                <span className="ml-1.5 tabular-nums text-white/70">
                  {formatTime(media.current)} / {formatTime(media.duration)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-white/50">
              {sourceType === 'video'
                ? 'Playback controls are inside the player'
                : 'Slide controls are inside the embed'}
            </span>
          )}
          {hasDeckNav && (
            <>
              <span>·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">N</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">P</kbd>
              <span>deck</span>
            </>
          )}
          <span>·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10">Esc</kbd>
          <span>close</span>
        </div>
        {/* Deck stepper — the only navigation that works for cross-origin
            embeds, so it's always visible when there are siblings. */}
        <div className="ml-auto flex items-center gap-3">
          {hasDeckNav && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={goPrevDeck}
                disabled={!hasPrevDeck}
                title="Previous deck (P)"
                aria-label="Previous deck"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold tabular-nums whitespace-nowrap">
                Deck {deckPos + 1} / {playlist.length}
              </span>
              <button
                onClick={goNextDeck}
                disabled={!hasNextDeck}
                title="Next deck (N)"
                aria-label="Next deck"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          {canNavigate && (
            <span className="font-semibold tabular-nums">
              {index + 1} / {totalSlides}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
