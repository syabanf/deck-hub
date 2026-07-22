import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseIcon, PlayIcon, PauseIcon, ChevronLeft, ChevronRight } from '../lib/icons.jsx'

// A self-driving "how to use" tour: it spotlights a real control, explains it,
// then actually clicks it and moves on — so the app navigates itself.
//
// Deliberately side-effect free: every auto-clicked target is navigation or a
// panel toggle. Nothing that creates, deletes, or mutates data is clicked (the
// favourite step is highlighted and explained, not pressed), so running the
// tour never leaves a trace in the catalog or the user's library.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const q = (sel) => document.querySelector(sel)

// Prefer the desktop top nav; fall back to the mobile tab bar when it's hidden.
const findNav = (...labels) => {
  const visible = (el) => el && el.offsetParent !== null
  for (const label of labels) {
    const desktop = [...document.querySelectorAll('nav:not([aria-label="Primary"]) button')].find(
      (b) => b.textContent.trim() === label,
    )
    if (visible(desktop)) return desktop
    const mobile = [...document.querySelectorAll('nav[aria-label="Primary"] button')].find((b) =>
      b.textContent.trim().startsWith(label),
    )
    if (visible(mobile)) return mobile
  }
  return null
}

const firstCard = () => q('.deck-row .hover-card') || q('.hover-card')
const hoverCard = () => firstCard()?.classList.add('is-hovered')
const unhoverCards = () =>
  document.querySelectorAll('.hover-card.is-hovered').forEach((el) => el.classList.remove('is-hovered'))
const pressEscape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

// Clears an active industry filter so later navigation isn't stuck in results.
const clearIndustryChip = () => {
  const chip = [...document.querySelectorAll('button')].find((b) => /^Industry:/.test(b.textContent.trim()))
  chip?.click()
}

const STEPS = [
  {
    id: 'intro',
    title: 'How to use WIT',
    body: 'Sit back — this tour drives the app itself, clicking through each feature. Pause or skip any time.',
    hold: 3000,
  },
  {
    id: 'search',
    title: 'Find any deck',
    body: 'The search button (or ⌘K) opens instant search across titles, authors and tags.',
    find: () => q('[aria-label="Open search"]') || findNav('Search'),
    action: 'click',
    hold: 2600,
  },
  {
    id: 'searchPanel',
    title: 'Search as you type',
    body: 'Results narrow instantly, and you can jump straight to a deck with ↵.',
    find: () => q('input[placeholder*="pitch deck"]'),
    hold: 2800,
    cleanup: pressEscape,
  },
  {
    id: 'card',
    title: 'Deck cards',
    body: 'Hovering a card expands it and reveals quick actions.',
    prep: async () => {
      await sleep(250)
      hoverCard()
    },
    find: () => q('.hover-card.is-hovered'),
    hold: 3000,
  },
  {
    id: 'favourite',
    title: 'Save to My Library',
    body: 'The bookmark button favourites a deck — the tour leaves yours untouched.',
    find: () =>
      q('.hover-card.is-hovered [title="Add to My Library"]') ||
      q('.hover-card.is-hovered [title="In My Library"]'),
    hold: 3000,
    cleanup: unhoverCards,
  },
  {
    id: 'industries',
    title: 'Browse by industry',
    body: 'Every sector has its own collection, with a cover and deck count.',
    find: () => findNav('Industries'),
    action: 'click',
    hold: 2600,
  },
  {
    id: 'industryTile',
    title: 'Pick a sector',
    body: 'Clicking a tile filters the whole catalog to that industry.',
    // Explicit hook — a generic `.grid > button` also matched the navbar brand.
    find: () => q('[data-tour="industry-tile"]'),
    action: 'click',
    hold: 2800,
  },
  {
    id: 'filters',
    title: 'Filter and sort',
    body: 'Narrow by industry, year or source type — and reorder by views, date or title.',
    find: () => q('select[aria-label="Sort decks"]') || q('select[aria-label="Filter by industry"]'),
    hold: 3000,
  },
  {
    id: 'clearFilter',
    title: 'Clear it again',
    body: 'Active filters show as chips you can dismiss in one click.',
    find: () => [...document.querySelectorAll('button')].find((b) => /^Industry:/.test(b.textContent.trim())),
    action: 'click',
    hold: 2600,
  },
  {
    id: 'library',
    title: 'My Library',
    body: 'Everything you bookmark collects here, synced to your account.',
    prep: async () => {
      clearIndustryChip()
      await sleep(250)
    },
    find: () => findNav('My Library', 'Library'),
    action: 'click',
    hold: 2600,
  },
  {
    id: 'account',
    title: 'Your account',
    body: 'Switch demo roles, open Settings, or replay this tour whenever you like.',
    find: () => q('[aria-label="Account menu"]'),
    action: 'click',
    hold: 2800,
  },
  {
    id: 'done',
    title: "That's the tour",
    body: 'You can reopen it any time from the account menu. Enjoy exploring.',
    prep: async () => {
      pressEscape()
      await sleep(200)
      findNav('Home')?.click()
      await sleep(400)
    },
    hold: 3200,
  },
]

export default function AutoDemo({ onExit }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [rect, setRect] = useState(null)
  const busy = useRef(false)
  const cancelled = useRef(false)

  const current = STEPS[step]
  const last = STEPS.length - 1

  const finish = useCallback(() => {
    cancelled.current = true
    unhoverCards()
    onExit?.()
  }, [onExit])

  // Position the spotlight over the step's target and keep tracking it.
  useEffect(() => {
    cancelled.current = false
    let tracker
    let alive = true

    const run = async () => {
      setRect(null)
      await current.prep?.()
      if (!alive) return
      await sleep(160)
      const el = current.find?.()
      if (!alive) return
      if (!el) return // no target → centred card

      el.scrollIntoView({ block: 'center', behavior: 'auto' })
      await sleep(220)
      if (!alive) return

      const measure = () => {
        const r = el.getBoundingClientRect()
        if (r.width || r.height) setRect({ x: r.left, y: r.top, w: r.width, h: r.height })
      }
      measure()
      tracker = setInterval(measure, 250)
    }
    run()

    return () => {
      alive = false
      clearInterval(tracker)
    }
  }, [step, current])

  // Perform this step's action, then move on.
  const advance = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const s = STEPS[step]
      if (s.action === 'click') {
        const el = s.find?.()
        el?.click()
        await sleep(650)
      }
      s.cleanup?.()
      if (cancelled.current) return
      if (step >= last) finish()
      else setStep((n) => n + 1)
    } finally {
      busy.current = false
    }
  }, [step, last, finish])

  const back = useCallback(() => {
    if (step === 0) return
    STEPS[step].cleanup?.()
    setStep((n) => Math.max(0, n - 1))
  }, [step])

  // Auto-advance while playing.
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(advance, current.hold ?? 2600)
    return () => clearTimeout(t)
  }, [playing, advance, current])

  // Escape exits the tour; arrows step it.
  useEffect(() => {
    const onKey = (e) => {
      // Only react to real user input. The tour itself dispatches synthetic
      // Escape presses to dismiss panels — without this it would close itself.
      if (!e.isTrusted) return
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight') advance()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, advance, back])

  const pad = 8
  const hasTarget = !!rect
  // Caption sits under the target when there's room, otherwise above it.
  const below = hasTarget && rect.y + rect.h + 190 < window.innerHeight
  const captionTop = hasTarget ? (below ? rect.y + rect.h + pad + 14 : rect.y - pad - 168) : null
  const captionLeft = hasTarget
    ? Math.min(Math.max(12, rect.x + rect.w / 2 - 170), window.innerWidth - 352)
    : null

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Dimmer — a giant ring around the target punches the spotlight hole. */}
      {hasTarget ? (
        <div
          className="fixed rounded-xl ring-2 ring-deck-accent pointer-events-none transition-all duration-300"
          style={{
            left: rect.x - pad,
            top: rect.y - pad,
            width: rect.w + pad * 2,
            height: rect.h + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.74)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/74 pointer-events-none" />
      )}

      {/* Caption */}
      <div
        className={`fixed w-[340px] max-w-[calc(100vw-24px)] rounded-xl bg-deck-surface ring-1 ring-deck-border shadow-2xl p-4 animate-scale-in ${
          hasTarget ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
        style={hasTarget ? { left: captionLeft, top: captionTop } : undefined}
      >
        <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-deck-accent mb-1">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 className="text-lg font-black tracking-tight">{current.title}</h3>
        <p className="text-sm text-deck-muted mt-1 leading-relaxed">{current.body}</p>

        {/* Progress */}
        <div className="flex items-center gap-1 mt-3">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-deck-accent' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-deck-surface/95 backdrop-blur ring-1 ring-deck-border shadow-2xl px-2 py-1.5">
        <button
          onClick={back}
          disabled={step === 0}
          aria-label="Previous step"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause tour' : 'Play tour'}
          className="w-10 h-10 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition-colors"
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={15} />}
        </button>
        <button
          onClick={advance}
          aria-label="Next step"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronRight size={16} />
        </button>
        <span className="w-px h-6 bg-deck-border mx-1" />
        <button
          onClick={finish}
          aria-label="Exit tour"
          className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <CloseIcon size={14} />
          Exit
        </button>
      </div>
    </div>
  )
}
