import { useEffect, useRef, useState } from 'react'
import Slide from './Slide.jsx'
import { toEmbedUrl } from '../lib/embed.js'
import {
  loadPdfDocument,
  loadPdfDocumentFromUrl,
  renderPdfPageToCanvas,
  base64ToArrayBuffer,
} from '../lib/pdf.js'
import { recordView } from '../lib/storage.js'
import { useClosable } from '../lib/useClosable.js'
import {
  CloseIcon,
  ChevronLeft,
  ChevronRight,
  FullscreenIcon,
  ExitFullscreenIcon,
} from '../lib/icons.jsx'

// A deck's PDF is either an uploaded file served over HTTP (source.remote) or
// legacy inline base64.
const openPdf = (source) =>
  source.remote
    ? loadPdfDocumentFromUrl(source.value)
    : loadPdfDocument(base64ToArrayBuffer(source.value))

const MockSlideStage = ({ deck, index }) => (
  <div className="aspect-[16/9] w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
    <Slide deck={deck} slide={deck.slides[index]} sizeClass="text-[2.2vw] sm:text-[1.6vw] lg:text-[1.1vw]" />
  </div>
)

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

const VideoStage = ({ deck }) => {
  const { value, kind } = deck.source
  if (kind === 'native') {
    return (
      <div className="aspect-[16/9] w-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 bg-black">
        <video
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
        src={value}
        title={deck.title}
        className="w-full h-full"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export default function DeckPlayer({ deck, startIndex = 0, onClose }) {
  const { closing, requestClose } = useClosable(onClose)
  const [index, setIndex] = useState(startIndex)
  const [isFull, setIsFull] = useState(false)
  const [pdfPageCount, setPdfPageCount] = useState(null)
  const containerRef = useRef(null)

  const sourceType = deck.source?.type || 'mock'

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

  const totalSlides =
    sourceType === 'mock' ? deck.slides.length :
    sourceType === 'pdf' ? (pdfPageCount || deck.slidesCount || 1) :
    1

  const canNavigate = sourceType === 'mock' || sourceType === 'pdf'
  const goPrev = () => canNavigate && setIndex((i) => Math.max(0, i - 1))
  const goNext = () => canNavigate && setIndex((i) => Math.min(totalSlides - 1, i + 1))

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') requestClose()
      if (!canNavigate) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'l' || e.key === 'j') {
        e.preventDefault()
        goNext()
      }
      if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'k') {
        e.preventDefault()
        goPrev()
      }
      if (e.key === 'Home') setIndex(0)
      if (e.key === 'End') setIndex(totalSlides - 1)
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [requestClose, totalSlides, canNavigate])

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

  return (
    <div
      ref={containerRef}
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
        {sourceType === 'mock' && <MockSlideStage deck={deck} index={index} />}
        {sourceType === 'pdf' && <PdfSlideStage deck={deck} index={index} />}
        {sourceType === 'url' && <UrlStage deck={deck} />}
        {sourceType === 'video' && <VideoStage deck={deck} />}

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
              <span>navigate</span>
              <span>·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">F</kbd>
              <span>fullscreen</span>
              <span>·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10">Esc</kbd>
              <span>close</span>
            </>
          ) : (
            <span>{sourceType === 'video' ? 'Video player — use inline controls' : 'Embedded deck — use the inline controls'}</span>
          )}
        </div>
        <div className="ml-auto font-semibold tabular-nums">
          {canNavigate ? `${index + 1} / ${totalSlides}` : '— / —'}
        </div>
      </div>
    </div>
  )
}
