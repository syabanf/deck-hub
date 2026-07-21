import { useCallback, useEffect, useRef, useState } from 'react'

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Keeps an overlay mounted just long enough to play its exit animation.
//
// Modals previously vanished the instant their state flipped, which is the part
// that actually reads as janky. Callers swap `onClose` for `requestClose` and
// spread `closing` into the backdrop's className.
export function useClosable(onClose, ms = 200) {
  const [closing, setClosing] = useState(false)
  const timer = useRef(null)

  const requestClose = useCallback(() => {
    if (timer.current) return // already closing
    if (reducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    timer.current = setTimeout(onClose, ms)
  }, [onClose, ms])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { closing, requestClose }
}
