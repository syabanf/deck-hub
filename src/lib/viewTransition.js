import { flushSync } from 'react-dom'

// Cross-fade between views using the View Transitions API.
//
// The browser snapshots the old DOM, we apply the state change synchronously
// (hence flushSync — React would otherwise batch it until after the snapshot),
// and the browser animates old → new. Anywhere the API is missing, or the user
// asked for reduced motion, this degrades to a plain state update.

const supported = () =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function' &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// A transition already running. Starting a second one skips the first, which
// the browser reports by rejecting its promises and, on screen, by cutting the
// half-finished animation to its end state. Clicking two nav items quickly is
// enough to hit it, so the second navigation is applied without an animation
// rather than by interrupting one.
let inFlight = false

// Every navigation lands at the top of the new page. This has to happen inside
// the transition callback, not in an effect afterwards.
//
// It used to live in a useEffect on the active section. Passive effects run
// after paint, so the sequence was: snapshot the old page at scroll 1400,
// render the new page, snapshot *that* at scroll 1400 too, animate both, and
// only then jump the real page to the top. The cross-fade played over content
// nobody was looking at any more, and the page snapped when it finished.
const applyAndReset = (update) => {
  flushSync(update)
  window.scrollTo({ top: 0, behavior: 'instant' })
}

export function withViewTransition(update) {
  if (!supported() || inFlight || document.visibilityState === 'hidden') {
    // A hidden document cannot animate — the API aborts the transition and
    // rejects. Nothing is on screen to animate anyway.
    update()
    window.scrollTo({ top: 0, behavior: 'instant' })
    return
  }

  inFlight = true
  const transition = document.startViewTransition(() => applyAndReset(update))

  // Both promises reject when a transition is skipped, and an uncaught
  // rejection here surfaced as an InvalidStateError in the console on every
  // interrupted navigation. Skipping is a normal outcome, not a fault.
  transition.ready?.catch(() => {})
  transition.finished
    .catch(() => {})
    .finally(() => {
      inFlight = false
    })
}
