import { flushSync } from 'react-dom'

// Fade the content region when the browse section changes.
//
// This replaced the View Transitions API, which was a poor fit for the job.
// That API animates a snapshot of a named element, and the snapshot is taken
// the instant the DOM changes — so anything the new page had not finished
// preparing was baked into the animation. It also morphs the snapshot box
// between the old and new sizes, and these pages differ by hundreds of pixels.
// Both produced artefacts that had nothing to do with the fade anyone wanted.
//
// A plain animation on the live element has none of that: it animates what is
// actually on screen, cannot be aborted by the browser, behaves identically
// everywhere including where the API is missing, and does not care that the
// two pages are different heights.

const DURATION = 260
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)' // --ease-out-quint

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Tagged so a repeat navigation cancels its own fade and nothing else — the
// element may be carrying unrelated animations.
const FADE_ID = 'wit-page-fade'

export function withPageFade(update, el) {
  // Synchronously, so the scroll reset and the animation both apply to the
  // page that is arriving rather than the one leaving.
  flushSync(update)
  window.scrollTo({ top: 0, behavior: 'instant' })

  // A hidden document has a paused animation timeline, so a fade started there
  // freezes at opacity 0 and holds the content invisible until the tab is
  // looked at again. Nothing is on screen to animate anyway.
  if (!el?.animate || reducedMotion() || document.visibilityState === 'hidden') return

  for (const a of el.getAnimations?.() ?? []) {
    if (a.id === FADE_ID) a.cancel()
  }

  const animation = el.animate(
    [
      { opacity: 0, transform: 'translate3d(0, 10px, 0)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: DURATION, easing: EASING },
  )
  animation.id = FADE_ID
}
