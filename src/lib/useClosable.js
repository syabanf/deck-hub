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
    timer.current = setTimeout(() => {
      // Both of these have to be undone before onClose, or this hook can only
      // ever close one thing.
      //
      // An overlay that unmounts when it closes gets a fresh hook next time and
      // never noticed. One that stays mounted and is driven by an `open` prop —
      // ConfirmDialog is — reuses this state: it reopened with `closing` still
      // true, so it played its exit animation the moment it appeared and ended
      // up invisible, and with `timer.current` still set the guard above turned
      // requestClose into a no-op, so Cancel and Escape did nothing either. It
      // looked like the second delete in a row simply did not work, and a page
      // reload "fixed" it by discarding the hook.
      timer.current = null
      setClosing(false)
      onClose()
    }, ms)
  }, [onClose, ms])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { closing, requestClose }
}
