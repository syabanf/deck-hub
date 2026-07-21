// Eased horizontal scrolling for the row carousels.
//
// The browser's native `behavior: 'smooth'` runs its own curve (near-linear in
// Chromium), can't be tuned, and doesn't interrupt cleanly when a user clicks
// the arrow twice. A short rAF loop with an expo ease-out gives the rows a
// controlled glide that matches the CSS motion tokens, and retargets instead of
// stacking when clicked repeatedly.

const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// One in-flight animation per element.
const running = new WeakMap()

export function cancelScroll(el) {
  if (!el) return
  const id = running.get(el)
  if (id !== undefined) {
    cancelAnimationFrame(id)
    running.delete(el)
  }
}

export function smoothScrollBy(el, delta, duration = 520) {
  if (!el) return
  cancelScroll(el)

  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  const start = el.scrollLeft
  const target = Math.min(max, Math.max(0, start + delta))
  const distance = target - start
  if (Math.abs(distance) < 1) return

  if (prefersReducedMotion()) {
    el.scrollLeft = target
    return
  }

  const t0 = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration)
    el.scrollLeft = start + distance * easeOutExpo(t)
    if (t < 1) {
      running.set(el, requestAnimationFrame(step))
    } else {
      running.delete(el)
    }
  }
  running.set(el, requestAnimationFrame(step))
}

// Hand control straight back to the user the moment they scroll themselves.
export function attachScrollCancel(el) {
  if (!el) return () => {}
  const cancel = () => cancelScroll(el)
  el.addEventListener('wheel', cancel, { passive: true })
  el.addEventListener('touchstart', cancel, { passive: true })
  return () => {
    el.removeEventListener('wheel', cancel)
    el.removeEventListener('touchstart', cancel)
  }
}
