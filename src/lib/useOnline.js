import { useEffect, useState } from 'react'

// Tracks connectivity so the UI can explain a failure before it happens,
// instead of letting every request die with a generic error.
//
// `navigator.onLine` only knows whether an interface is up — it can read true
// on a captive-WiFi portal that drops every request. That's fine here: it's
// used to *explain* failures, never to block a request that might still work.
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
