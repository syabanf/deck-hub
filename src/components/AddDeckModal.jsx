import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import { CloseIcon, UploadIcon, LinkIcon } from '../lib/icons.jsx'
import { loadPdfDocument, fileToArrayBuffer, renderPdfPageToCanvas } from '../lib/pdf.js'
import { uploadFile } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { detectVideo, isVideoFile, formatBytes as formatVideoBytes } from '../lib/video.js'
import { useClosable } from '../lib/useClosable.js'
import { useTaxonomy } from '../lib/taxonomy.jsx'

const PALETTES = [
  { name: 'Ember', from: '#ff5f6d', to: '#ffc371', text: '#1a0d00' },
  { name: 'Violet', from: '#7f00ff', to: '#e100ff', text: '#ffffff' },
  { name: 'Ocean', from: '#00c6fb', to: '#005bea', text: '#ffffff' },
  { name: 'Emerald', from: '#11998e', to: '#38ef7d', text: '#001a0d' },
  { name: 'Sunset', from: '#fa709a', to: '#fee140', text: '#1a0008' },
  { name: 'Slate', from: '#232526', to: '#414345', text: '#ffffff' },
  { name: 'Crimson', from: '#cb2d3e', to: '#ef473a', text: '#ffffff' },
  { name: 'Midnight', from: '#0f2027', to: '#2c5364', text: '#ffffff' },
]
const PATTERNS = ['orbs', 'grid', 'wave', 'rays']

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const detectPlatform = (url) => {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host.includes('docs.google.com') && u.pathname.includes('/presentation'))
      return { name: 'Google Slides', icon: 'G', color: '#fbbc04', embed: true }
    if (host.includes('speakerdeck.com'))
      return { name: 'SpeakerDeck', icon: 'S', color: '#009287', embed: false }
    if (host.includes('slideshare.net'))
      return { name: 'SlideShare', icon: 'S', color: '#117db8', embed: false }
    if (host.includes('canva.com'))
      return { name: 'Canva', icon: 'C', color: '#00c4cc', embed: true }
    if (host.includes('figma.com'))
      return { name: 'Figma', icon: 'F', color: '#a259ff', embed: true }
    if (u.pathname.toLowerCase().endsWith('.pdf'))
      return { name: 'PDF link', icon: 'P', color: '#e50914', embed: false }
    return { name: u.hostname, icon: '↗', color: '#8a8a99', embed: false }
  } catch {
    return null
  }
}

const VideoIcon = (props) => (
  <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
  </svg>
)

const Tab = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className="relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors"
  >
    <span className={active ? 'text-white' : 'text-white/55 hover:text-white/80'}>
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
    </span>
    {active && (
      <span className="absolute bottom-0 inset-x-2 h-[3px] rounded-t bg-deck-accent" />
    )}
  </button>
)

const FieldLabel = ({ children, hint }) => (
  <label className="block">
    <span className="text-[10px] uppercase tracking-widest font-bold text-deck-muted">
      {children}
    </span>
    {hint && <span className="ml-1.5 text-[10px] text-white/40">{hint}</span>}
  </label>
)

// The first page of a PDF is the cover the deck already has — it is what
// somebody opening the file sees first. Rendering it here means uploading a
// deck produces artwork that belongs to it, instead of the stock photograph
// picsum hands out for an unknown seed.
//
// JPEG rather than PNG: a rendered slide is a photograph as far as the encoder
// is concerned, and a 1200px PNG of one runs to several megabytes against a
// 25MB upload cap shared with the deck itself.
async function coverFromFirstPage(doc, name) {
  const canvas = document.createElement('canvas')
  // pdf.js can stall indefinitely on a page it cannot rasterise — a tab the
  // browser has stopped painting does it too. Neither is worth waiting on
  // forever when the fallback is artwork that already exists.
  const rendered = await Promise.race([
    renderPdfPageToCanvas(doc, 1, canvas, 1200).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 20000)),
  ])
  if (!rendered) return null
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) return null
  const base = name.replace(/\.pdf$/i, '')
  const file = new File([blob], `${base}-cover.jpg`, { type: 'image/jpeg' })
  return { file, name: file.name, preview: URL.createObjectURL(file), fromPdf: true }
}

// Optional artwork. Skipping it is the normal path — Cover generates a
// deterministic image from the deck id, so a deck without one still looks
// designed rather than unfinished. That is why there is no placeholder box
// shouting for a file.
function CoverPicker({ cover, busy, onPick }) {
  return (
    <div className="space-y-2">
      <FieldLabel>
        Cover image <span className="text-white/40">optional</span>
      </FieldLabel>
      <div className="flex items-center gap-3">
        <div
          className="w-24 h-16 rounded-lg border border-deck-border bg-deck-card overflow-hidden shrink-0 grid place-items-center"
        >
          {cover?.preview ? (
            <img src={cover.preview} alt="" className="w-full h-full object-cover" />
          ) : busy ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-[10px] text-white/35 text-center leading-tight px-1">
              Generated<br />artwork
            </span>
          )}
        </div>
        <div className="flex-1">
          <label className="inline-block px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-sm font-semibold cursor-pointer">
            {cover ? 'Replace' : 'Choose image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                onPick({ file, name: file.name, preview: URL.createObjectURL(file) })
                // Reset, or picking the same file twice fires no change event.
                e.target.value = ''
              }}
            />
          </label>
          {cover && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="ml-2 text-xs text-white/50 hover:text-white"
            >
              Remove
            </button>
          )}
          <p className="text-[11px] text-deck-muted mt-1">
            {busy && !cover
              ? 'Reading page 1…'
              : cover?.fromPdf
              ? 'Taken from page 1 — replace it if you want something else.'
                : cover
                  ? cover.name
                  : 'Leave empty to use the generated cover.'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AddDeckModal({ onClose, onAdd }) {
  const { categories, industries } = useTaxonomy()
  const { closing, requestClose } = useClosable(onClose)
  const [tab, setTab] = useState('upload')
  const [dragOver, setDragOver] = useState(false)
  const [working, setWorking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Required + common fields
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [author, setAuthor] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  // Defaulted from the master list rather than to a literal. 'mine' used to
  // sit here and is not a category any list contains, so every deck created
  // this way was invisible to the filter that should have found it — and the
  // API refuses it outright now.
  const [category, setCategory] = useState('')
  const [industry, setIndustry] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [featured, setFeatured] = useState(false)
  // An optional cover. Without one the deck renders the generated artwork,
  // which is the default and looks deliberate rather than missing.
  const [cover, setCover] = useState(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [paletteIndex, setPaletteIndex] = useState(1)
  const [pattern, setPattern] = useState('orbs')

  // Source state per tab
  const [pdfFile, setPdfFile] = useState(null)
  const [url, setUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoFile, setVideoFile] = useState(null) // { name, size, dataUrl }
  const [videoDrag, setVideoDrag] = useState(false)

  // Success
  const [successDeck, setSuccessDeck] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [requestClose])

  // The list arrives from the API a moment after mount, so the default is set
  // when it does rather than at initialisation.
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0].id)
  }, [categories, category])

  // An object URL held past its file is a leak, and there is one per pick.
  useEffect(() => () => { if (cover?.preview) URL.revokeObjectURL(cover.preview) }, [cover])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  const platform = useMemo(() => detectPlatform(url), [url])
  const videoInfo = useMemo(() => detectVideo(videoUrl), [videoUrl])

  const tags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [tagsInput],
  )

  const previewDeck = useMemo(() => {
    const palette = PALETTES[paletteIndex]
    const base = {
      id: 'preview',
      title: title.trim() || (tab === 'upload' && pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'Your deck title'),
      subtitle: subtitle.trim() || undefined,
      author: author.trim() || 'You',
      year: parseInt(year, 10) || new Date().getFullYear(),
      category,
      industry: industry || undefined,
      description: description.trim() || undefined,
      tags: tags.length ? tags : undefined,
      gradient: { from: palette.from, to: palette.to, text: palette.text },
      pattern,
      // Without this the preview showed whatever photograph picsum returns for
      // an unknown seed — a stock image with no relationship to the deck, and
      // no sign that a cover had been chosen at all.
      image: cover?.preview,
    }
    if (tab === 'upload' && pdfFile) {
      return { ...base, slidesCount: pdfFile.pages, source: { type: 'pdf' } }
    }
    if (tab === 'url' && url) {
      return { ...base, slidesCount: 1, source: { type: 'url' } }
    }
    if (tab === 'video' && videoUrl) {
      return { ...base, slidesCount: 1, source: { type: 'video' } }
    }
    // Nothing chosen yet. An empty type matches none of Cover's badges, which
    // is the intent — it used to say 'mock', a leftover from the offline catalog.
    return { ...base, slidesCount: '—', source: { type: '' } }
  }, [tab, pdfFile, url, videoUrl, title, subtitle, author, year, category, industry, description, tags, paletteIndex, pattern, cover])

  const handleVideoFile = async (file) => {
    if (!file) return
    if (!isVideoFile(file)) {
      setError('Please drop a video file (.mp4, .webm, .mov)')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Video files must be under 25MB')
      return
    }
    setError(null)
    // The file is uploaded on submit, not now — just hold onto it.
    setVideoFile({ name: file.name, size: file.size, file })
    setVideoUrl('') // clear URL since we now have a file
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
  }

  const handlePdfFile = async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please drop a .pdf file')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('PDFs must be under 25MB')
      return
    }
    setError(null)
    setWorking(true)
    try {
      // Read locally only to discover the page count for the preview; the file
      // itself is uploaded to the server on submit.
      const buf = await fileToArrayBuffer(file)
      const doc = await loadPdfDocument(buf.slice(0))
      setPdfFile({ name: file.name, size: file.size, pages: doc.numPages, file })
      if (!title) setTitle(file.name.replace(/\.pdf$/i, ''))

      // Deliberately not awaited. Rasterising a page is the slowest thing here
      // and the least important: the deck is complete without it. Awaiting it
      // held the whole form behind a render that can stall, with nothing on
      // screen to say why.
      //
      // Only when nothing was chosen by hand — a deliberate pick should not be
      // overwritten by dropping a replacement file.
      if (!cover) {
        setCoverBusy(true)
        coverFromFirstPage(doc, file.name)
          .then((generated) => { if (generated) setCover(generated) })
          .catch(() => {})
          .finally(() => setCoverBusy(false))
      }
    } catch (e) {
      // Reading happens in the browser, so this is a bad/corrupt file — not
      // a server problem. Say what the person can actually do about it.
      setError('We couldn’t read that PDF. It may be corrupted or password-protected — try another file.')
    } finally {
      setWorking(false)
    }
  }

  const canSubmit =
    (tab === 'upload' && pdfFile) ||
    (tab === 'url' && url.trim()) ||
    (tab === 'video' && (videoUrl.trim() || videoFile))

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(
        tab === 'upload'
          ? 'Drop a PDF first'
          : tab === 'video'
          ? 'Paste a video URL first'
          : 'Paste a URL first',
      )
      return
    }
    if (tab === 'video' && !videoFile && !videoInfo) {
      setError('Could not recognize that video URL (try YouTube, Vimeo, Loom, or a direct .mp4)')
      return
    }
    const palette = PALETTES[paletteIndex]
    const base = {
      id: `user-${Date.now()}`,
      title: title.trim() || (pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'Untitled deck'),
      subtitle: subtitle.trim() || undefined,
      author: author.trim() || 'You',
      year: parseInt(year, 10) || new Date().getFullYear(),
      category: category || 'mine',
      industry: industry || undefined,
      description: description.trim() || undefined,
      tags: tags.length ? tags : ['my-upload'],
      featured,
      gradient: { from: palette.from, to: palette.to, text: palette.text },
      pattern,
    }
    if (tab === 'url') {
      try { new URL(url) } catch { setError("That doesn't look like a valid URL"); return }
    }

    if (!category) {
      setError('Pick a category first')
      return
    }

    setError(null)
    setUploading(true)
    try {
      // The cover goes up before the deck so the failure, if there is one,
      // happens while nothing has been created yet.
      if (cover?.file) {
        const up = await uploadFile(cover.file)
        base.coverImage = up.path
      }
      let deck
      if (tab === 'upload') {
        // Store the server-relative path; the client absolutises it on read.
        const up = await uploadFile(pdfFile.file)
        deck = { ...base, slidesCount: pdfFile.pages, source: { type: 'pdf', value: up.path } }
      } else if (tab === 'url') {
        deck = { ...base, slidesCount: 1, source: { type: 'url', value: url.trim() } }
      } else if (videoFile) {
        // Video tab — an uploaded file beats a pasted URL.
        const up = await uploadFile(videoFile.file)
        deck = {
          ...base,
          slidesCount: 1,
          source: { type: 'video', kind: 'native', value: up.path, platform: 'Uploaded video' },
        }
      } else {
        deck = {
          ...base,
          slidesCount: 1,
          source: { type: 'video', value: videoInfo.embedUrl, kind: videoInfo.kind, platform: videoInfo.platform },
        }
      }
      setSuccessDeck(deck)
      setTimeout(() => onAdd(deck), 900)
    } catch (e) {
      setError(humanizeError(e, { action: 'upload this deck' }).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm animate-fade-in py-8 px-4 overflow-y-auto ${
        closing ? 'is-closing' : ''
      }`}
      onClick={requestClose}
    >
      <div
        className="modal-panel relative w-full max-w-3xl bg-deck-surface rounded-2xl overflow-hidden ring-1 ring-deck-border shadow-2xl animate-scale-in my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {successDeck ? (
          <SuccessOverlay deck={successDeck} />
        ) : (
          <>
            <button
              onClick={requestClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center z-20 transition-colors"
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>

            <div className="px-4 pt-6 pb-3 sm:px-7 sm:pt-7">
              <h2 className="text-2xl font-black tracking-tight">Add a deck</h2>
              <p className="text-sm text-deck-muted mt-1">
                Upload a PDF, paste a hosted slides link, or embed a video demo.
              </p>
            </div>

            <div className="flex border-b border-deck-border px-3">
              <Tab active={tab === 'upload'} onClick={() => setTab('upload')} icon={<UploadIcon size={16} />} label="Upload PDF" />
              <Tab active={tab === 'url'} onClick={() => setTab('url')} icon={<LinkIcon size={16} />} label="Paste URL" />
              <Tab active={tab === 'video'} onClick={() => setTab('video')} icon={<VideoIcon width={16} height={16} />} label="Video demo" />
            </div>

            <div className="grid md:grid-cols-[1fr_240px] gap-5 sm:gap-6 p-4 sm:p-7 max-h-[76vh] sm:max-h-[70vh] overflow-y-auto thin-scroll">
              <div className="space-y-4">
                <div key={tab} className="animate-tab-slide">
                  {tab === 'upload' && (
                    <UploadPanel dragOver={dragOver} setDragOver={setDragOver} working={working} pdfFile={pdfFile} onFile={handlePdfFile} onClearFile={() => setPdfFile(null)} />
                  )}
                  {tab === 'url' && <UrlPanel url={url} setUrl={setUrl} platform={platform} />}
                  {tab === 'video' && (
                    <VideoPanel
                      videoUrl={videoUrl}
                      setVideoUrl={(v) => { setVideoUrl(v); if (v) setVideoFile(null) }}
                      info={videoInfo}
                      videoFile={videoFile}
                      onClearFile={() => setVideoFile(null)}
                      onFile={handleVideoFile}
                      working={working}
                      dragOver={videoDrag}
                      setDragOver={setVideoDrag}
                    />
                  )}
                </div>

                {/* Required */}
                <div className="space-y-2">
                  <FieldLabel>Title</FieldLabel>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Acme Co. — Q4 2024 Review"
                    className="w-full px-3 py-2.5 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <FieldLabel>Author</FieldLabel>
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="You / Team / Source"
                      className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Year</FieldLabel>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      min="1900"
                      max="2099"
                      className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <FieldLabel>Category</FieldLabel>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
                    >
                      {/* "My Library" used to sit here as value="mine". It is
                          not a category any list contains, so a deck filed
                          under it was reachable from no filter at all — and the
                          API refuses it now. My Library is the favourites
                          feature, which is a different thing entirely. */}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Industry</FieldLabel>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
                    >
                      <option value="">— None —</option>
                      {industries.map((i) => (
                        <option key={i.id} value={i.id}>{i.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Advanced fields toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs uppercase tracking-widest font-bold text-deck-muted hover:text-white transition-colors flex items-center gap-1"
                >
                  <span>{showAdvanced ? '▾' : '▸'}</span>
                  More options
                </button>

                {showAdvanced && (
                  <div className="space-y-3 animate-tab-slide">
                    <div className="space-y-2">
                      <FieldLabel>Sub-Title</FieldLabel>
                      <input
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="A one-liner shown below the title"
                        className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Description <span className="text-white/40">optional</span></FieldLabel>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="A short summary shown in the details modal."
                        className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40 resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>Tags <span className="text-white/40">comma-separated</span></FieldLabel>
                      <input
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="strategy, ai, q4-review"
                        className="w-full px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
                      />
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {tags.map((t) => (
                            <span key={t} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/70">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                      <input
                        type="checkbox"
                        checked={featured}
                        onChange={(e) => setFeatured(e.target.checked)}
                        className="w-4 h-4 accent-deck-accent"
                      />
                      <span className="text-sm">
                        Featured
                        <span className="block text-[11px] text-deck-muted">
                          The newest featured deck is the one the home page leads with.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                <CoverPicker cover={cover} busy={coverBusy} onPick={setCover} />

                <div>
                  <div className="text-xs uppercase tracking-widest text-deck-muted mb-2">
                    Cover theme
                    {cover && (
                      <span className="ml-2 normal-case tracking-normal text-white/40">
                        — fallback if the image can’t load
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {PALETTES.map((p, i) => (
                      <button
                        key={p.name}
                        onClick={() => setPaletteIndex(i)}
                        title={p.name}
                        className={`relative aspect-square rounded-md ring-2 transition-all hover:scale-110 ${
                          paletteIndex === i ? 'ring-white scale-110' : 'ring-transparent'
                        }`}
                        style={{ backgroundImage: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)` }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-widest text-deck-muted mb-2">Pattern</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PATTERNS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPattern(p)}
                        className={`text-xs uppercase tracking-wider py-1.5 rounded border transition-all ${
                          pattern === p
                            ? 'bg-white text-black border-white font-bold'
                            : 'border-deck-border text-white/70 hover:border-white/40'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 animate-wiggle">
                    {error}
                  </div>
                )}
              </div>

              {/* Sticky from md up, where it is a real second column. `self-start`
                  is what makes it work at all: a grid item stretches to the row
                  height by default, and an element as tall as its scroll
                  container never has anywhere to stick to.

                  Below md the grid collapses to one column and this sits under
                  the form, where sticking it would pin the preview over the
                  fields somebody is still filling in. */}
              <div className="space-y-3 md:sticky md:top-0 md:self-start">
                <div className="text-xs uppercase tracking-widest text-deck-muted">Preview</div>
                <div className="aspect-deck rounded-lg overflow-hidden ring-1 ring-deck-border shadow-2xl">
                  <Cover deck={previewDeck} sizeClass="text-xs" />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || working || uploading}
                  className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                    canSubmit && !working && !uploading
                      ? 'bg-deck-accent hover:bg-deck-accentDim text-white shadow-lg shadow-deck-accent/30 hover:shadow-deck-accent/50 hover:-translate-y-px'
                      : 'bg-white/10 text-white/40 cursor-not-allowed'
                  }`}
                >
                  {uploading ? 'Uploading…' : working ? 'Reading PDF…' : 'Add to library'}
                </button>
                <div className="text-[11px] text-deck-muted leading-snug">
                  {tab === 'upload' && 'PDFs are uploaded to the WIT server. Up to 25MB.'}
                  {tab === 'url' && 'Best with Google Slides & Canva publish-to-web links.'}
                  {tab === 'video' && 'Upload a file (up to 25MB), or link YouTube, Vimeo, or Loom.'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UploadPanel({ dragOver, setDragOver, working, pdfFile, onFile, onClearFile }) {
  if (pdfFile) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 animate-scale-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-12 rounded bg-white/95 text-deck-bg flex flex-col items-center justify-center flex-shrink-0 font-black text-xs leading-none shadow-md">
            <span>PDF</span>
            <span className="text-[9px] font-semibold opacity-70 mt-0.5">{pdfFile.pages}p</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{pdfFile.name}</div>
            <div className="text-xs text-deck-muted mt-0.5">
              {pdfFile.pages} {pdfFile.pages === 1 ? 'page' : 'pages'} · {formatBytes(pdfFile.size)}
            </div>
            <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Ready to add
            </div>
          </div>
          <button
            onClick={onClearFile}
            className="text-xs text-deck-muted hover:text-white px-2 py-1 rounded transition-colors"
          >
            Replace
          </button>
        </div>
      </div>
    )
  }
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        onFile(e.dataTransfer.files?.[0])
      }}
      className={`relative flex flex-col items-center justify-center text-center px-6 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
        dragOver
          ? 'border-deck-accent bg-deck-accent/15 scale-[1.02]'
          : 'border-deck-border hover:border-white/40 bg-white/[0.03]'
      } ${working ? 'pointer-events-none opacity-70' : ''}`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => onFile(e.target.files?.[0])}
        disabled={working}
      />
      <div className={`w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-all ${dragOver ? 'scale-125 bg-deck-accent/30' : ''}`}>
        {working ? (
          <span className="block w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        ) : (
          <UploadIcon size={22} />
        )}
      </div>
      <div className="mt-3 font-semibold">
        {working ? 'Reading PDF…' : dragOver ? 'Drop it' : 'Drop a PDF, or click to browse'}
      </div>
      <div className="text-xs text-deck-muted mt-1">
        We render pages locally. Nothing leaves your browser.
      </div>
    </label>
  )
}

function UrlPanel({ url, setUrl, platform }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/presentation/d/…"
          className="w-full px-3 py-3 pr-32 rounded-lg bg-deck-card border border-deck-border placeholder:text-white/40 focus:outline-none focus:border-white/40 text-sm transition-colors"
        />
        {platform && (
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold animate-scale-in"
            style={{ background: `${platform.color}30`, color: platform.color, border: `1px solid ${platform.color}60` }}
          >
            <span className="w-5 h-5 rounded flex items-center justify-center text-white font-black" style={{ background: platform.color }}>
              {platform.icon}
            </span>
            <span className="hidden sm:inline">{platform.name}</span>
          </div>
        )}
      </div>
      {platform && !platform.embed && (
        <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 flex items-start gap-2">
          <span className="font-black">!</span>
          <span>
            {platform.name} blocks iframe embedding on most pages. The deck will still open externally on click.
          </span>
        </div>
      )}
    </div>
  )
}

function VideoPanel({
  videoUrl,
  setVideoUrl,
  info,
  videoFile,
  onClearFile,
  onFile,
  working,
  dragOver,
  setDragOver,
}) {
  return (
    <div className="space-y-3">
      {/* File upload (or selected file display) */}
      {videoFile ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 animate-scale-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-12 rounded bg-white/95 text-deck-bg flex items-center justify-center flex-shrink-0 font-black text-xs shadow-md">
              MP4
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{videoFile.name}</div>
              <div className="text-xs text-deck-muted mt-0.5">
                {formatVideoBytes(videoFile.size)}
              </div>
              <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Uploaded — plays inline
              </div>
            </div>
            <button
              onClick={onClearFile}
              className="text-xs text-deck-muted hover:text-white px-2 py-1 rounded transition-colors"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFile(e.dataTransfer.files?.[0])
          }}
          className={`relative flex items-center justify-center gap-2 text-center px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm ${
            dragOver
              ? 'border-deck-accent bg-deck-accent/15'
              : 'border-deck-border hover:border-white/40 bg-white/[0.03]'
          } ${working ? 'pointer-events-none opacity-70' : ''}`}
        >
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={working}
          />
          {working ? (
            <span className="block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : (
            <VideoIcon width={18} height={18} className="text-white/70" />
          )}
          <span className="font-semibold">
            {working ? 'Reading…' : 'Drop a video file, or click to upload'}
          </span>
          <span className="text-xs text-deck-muted">.mp4 · .webm · up to 25MB</span>
        </label>
      )}

      {!videoFile && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-deck-muted">
          <span className="flex-1 h-px bg-deck-border" />
          or paste a link
          <span className="flex-1 h-px bg-deck-border" />
        </div>
      )}

      {!videoFile && (
        <div className="relative">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="YouTube · Vimeo · Loom · or a direct .mp4 URL"
            className="w-full px-3 py-3 pr-32 rounded-lg bg-deck-card border border-deck-border placeholder:text-white/40 focus:outline-none focus:border-white/40 text-sm transition-colors"
          />
          {info && (
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold animate-scale-in"
              style={{ background: `${info.color}30`, color: info.color, border: `1px solid ${info.color}60` }}
            >
              <span className="w-5 h-5 rounded flex items-center justify-center text-white font-black" style={{ background: info.color }}>
                {info.icon}
              </span>
              <span className="hidden sm:inline">{info.platform}</span>
            </div>
          )}
        </div>
      )}

      {info?.thumbnail && !videoFile && (
        <div className="rounded-lg overflow-hidden ring-1 ring-deck-border">
          <img src={info.thumbnail} alt="Video thumbnail" className="w-full aspect-video object-cover" />
        </div>
      )}

      {!videoFile && videoUrl && !info && (
        <div className="text-xs text-red-300/90 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          Not a recognized video URL. Try YouTube, Vimeo, Loom, or a direct .mp4/.webm link.
        </div>
      )}

      {!videoFile && info && (
        <div className="text-xs text-emerald-400/90 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {info.platform} {info.kind === 'iframe' ? 'embed' : 'native player'} ready
        </div>
      )}
    </div>
  )
}

function SuccessOverlay({ deck }) {
  return (
    <div className="p-10 flex flex-col items-center text-center animate-scale-in">
      <div className="relative w-20 h-20 mb-4">
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-glow-pulse" />
        <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center animate-check-pop">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none">
            <path d="M5 12.5l4 4 10-10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <h3 className="text-2xl font-black tracking-tight">Added to your library</h3>
      <p className="text-sm text-deck-muted mt-1">"{deck.title}" is ready to open.</p>
      <div className="mt-6 w-64 aspect-deck rounded-lg overflow-hidden ring-1 ring-deck-border shadow-2xl">
        <Cover deck={deck} sizeClass="text-xs" />
      </div>
    </div>
  )
}
