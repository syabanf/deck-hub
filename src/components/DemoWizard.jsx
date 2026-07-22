import { useEffect, useState } from 'react'
import { useClosable } from '../lib/useClosable.js'
import { useSwipe } from '../lib/useSwipe.js'
import {
  CloseIcon,
  PlayIcon,
  BookmarkIcon,
  SearchIcon,
  PlusIcon,
  UserIcon,
  ChevronRight,
  ChevronLeft,
  CheckIcon,
} from '../lib/icons.jsx'

// Role chips reused by the last step.
const DEMO_ACCOUNTS = [
  { role: 'Admin', creds: 'admin@wit.id · admin1234', can: 'Decks + users', color: '#fb7185' },
  { role: 'Editor', creds: 'editor@wit.id · editor1234', can: 'Add & remove decks', color: '#60a5fa' },
  { role: 'Viewer', creds: 'viewer@wit.id · viewer1234', can: 'Browse only', color: '#8a8a99' },
]

const STEPS = [
  {
    icon: (s) => <PlayIcon size={s} />,
    kicker: 'Welcome',
    title: 'Open decks, beautifully.',
    body: 'WIT is a Netflix-style catalog of legendary presentations — company profiles, iconic pitch decks, engineering classics, and famous keynotes. Here’s a 30-second tour.',
  },
  {
    icon: (s) => <PlayIcon size={s} />,
    kicker: 'Browse & play',
    title: 'Hover, then open.',
    body: 'Scroll the rows and hover any card for a quick preview and actions. Open a deck to play it full-screen — slide decks, PDFs, Google Slides, and videos all play inline.',
    bullets: [
      '← / → step through slides',
      'N / P jump between decks',
      'F fullscreen · Esc to close',
    ],
  },
  {
    icon: (s) => <BookmarkIcon size={s} />,
    kicker: 'My Library',
    title: 'Bookmark what matters.',
    body: 'Tap the bookmark on any card to save it. Your favorites collect under “My Library” and, when you’re signed in, sync to your account across devices.',
  },
  {
    icon: (s) => <SearchIcon size={s} />,
    kicker: 'Find fast',
    title: 'Search and filter.',
    body: 'Press ⌘K (or /) to search the whole catalog instantly. On any category or results page, filter by industry, year, and source type, or re-sort — all without a reload.',
  },
  {
    icon: (s) => <PlusIcon size={s} />,
    kicker: 'Contribute',
    title: 'Add your own decks.',
    body: 'Editors and admins can add decks — upload a PDF, paste a Google Slides / Canva link, or embed a video. Admins also manage the catalog and the team from Settings.',
  },
  {
    icon: (s) => <UserIcon size={s} />,
    kicker: 'Try it',
    title: 'Sign in as any role.',
    body: 'This is a live demo against a real Go + PostgreSQL backend. Sign out and pick a demo account to feel how permissions change what you can do.',
    accounts: true,
  },
]

export default function DemoWizard({ onClose, onStartDemo }) {
  const { closing, requestClose } = useClosable(onClose)
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1
  const s = STEPS[step]

  const next = () => (step >= last ? requestClose() : setStep((n) => n + 1))
  const back = () => setStep((n) => Math.max(0, n - 1))

  // Swipe between steps on touch.
  const panelRef = useSwipe({ onLeft: next, onRight: back, ignore: 'button' })

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4 ${
        closing ? 'is-closing' : ''
      }`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      <div
        ref={panelRef}
        className="modal-panel relative w-full max-w-lg bg-deck-surface rounded-2xl overflow-hidden ring-1 ring-deck-border shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent header band */}
        <div className="relative h-28 bg-gradient-to-br from-deck-accent/90 to-deck-accentDim overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
          <span className="absolute left-6 top-6 text-white font-black text-2xl tracking-tighter">
            WIT
          </span>
          <div className="absolute -right-4 -bottom-6 text-white/25">
            {s.icon(150)}
          </div>
          <button
            onClick={requestClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center transition-colors"
            aria-label="Close tour"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Body — keyed so each step re-plays its entrance */}
        <div key={step} className="content-in px-6 pt-5 pb-6 min-h-[248px] flex flex-col">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-deck-accent/15 text-deck-accent">
              {s.icon(18)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.25em] font-bold text-deck-accent">
              {s.kicker}
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight">{s.title}</h2>
          <p className="text-sm text-white/75 leading-relaxed mt-2">{s.body}</p>

          {s.bullets && (
            <ul className="mt-3 space-y-1.5">
              {s.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckIcon size={15} className="text-emerald-400 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {s.accounts && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <div
                  key={a.role}
                  className="rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-center"
                  title={a.creds}
                >
                  <div className="flex items-center justify-center gap-1.5 text-sm font-bold">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                    {a.role}
                  </div>
                  <div className="text-[10px] text-white/50 leading-tight mt-0.5">{a.can}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: progress + controls */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-deck-border">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-deck-accent' : 'w-1.5 bg-white/25 hover:bg-white/45'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step === 0 ? (
              <button
                onClick={requestClose}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-white/60 hover:text-white transition-colors"
              >
                Skip
              </button>
            ) : (
              <button
                onClick={back}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {step === last && onStartDemo && (
              <button
                onClick={onStartDemo}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold transition-colors"
                title="Watch the app drive itself"
              >
                <PlayIcon size={13} />
                Watch demo
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold shadow-lg shadow-deck-accent/30 hover:-translate-y-px active:translate-y-0 transition-all"
            >
              {step === last ? 'Start exploring' : 'Next'}
              {step < last && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
