import { useCallback, useRef } from 'react'

// Touch-swipe detector. Returns a *callback ref* to put on the element.
//
// A callback ref (rather than a ref object + effect) attaches listeners exactly
// when the node mounts and detaches when it unmounts — which matters here
// because the swiped region can appear after first render (e.g. once data has
// loaded). It uses native passive listeners so scrolling is never blocked:
// vertical page scroll and the horizontal row carousels keep working. The
// `ignore` selector bails when a gesture *starts* inside something that owns
// horizontal scroll (or a form control), so a swipe there scrolls it instead.
//
// A gesture only counts when it's decisively one-axis (>= threshold along the
// primary axis, <= restraint across it) and quick enough to be a flick.
export function useSwipe(handlers = {}) {
  const opts = useRef(handlers)
  opts.current = handlers
  const cleanup = useRef(null)

  return useCallback((node) => {
    // Detach from any previous node first.
    if (cleanup.current) {
      cleanup.current()
      cleanup.current = null
    }
    if (!node) return

    let start = null

    const onStart = (e) => {
      const o = opts.current
      if (e.touches.length !== 1) {
        start = null
        return
      }
      if (o.ignore && e.target?.closest?.(o.ignore)) {
        start = null
        return
      }
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, time: Date.now() }
    }

    const onEnd = (e) => {
      const o = opts.current
      const s = start
      start = null
      if (!s) return
      const t = e.changedTouches[0]
      if (!t) return
      if (Date.now() - s.time > (o.allowedTime ?? 600)) return

      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const threshold = o.threshold ?? 55
      const restraint = o.restraint ?? 45

      if (ax >= threshold && ay <= restraint) {
        if (dx < 0) o.onLeft?.()
        else o.onRight?.()
      } else if (ay >= threshold && ax <= restraint) {
        if (dy < 0) o.onUp?.()
        else o.onDown?.()
      }
    }

    const onCancel = () => {
      start = null
    }

    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchend', onEnd, { passive: true })
    node.addEventListener('touchcancel', onCancel, { passive: true })
    cleanup.current = () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onCancel)
    }
  }, [])
}
