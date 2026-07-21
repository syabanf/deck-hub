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

export function withViewTransition(update) {
  if (!supported()) {
    update()
    return
  }
  document.startViewTransition(() => {
    flushSync(update)
  })
}
