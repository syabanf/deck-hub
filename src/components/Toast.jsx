import { useEffect } from 'react'

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, toast.duration || 3500)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null

  const isError = toast.type === 'error'

  return (
    // The mobile navbar is taller (logo row + category chips), so clear it
    // there and only tuck up under the slim desktop bar at lg.
    <div className="fixed top-32 lg:top-20 left-1/2 -translate-x-1/2 z-[60] px-4 max-w-[calc(100vw-2rem)] pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-full px-5 py-3 shadow-2xl backdrop-blur animate-toast-in ${
          isError
            ? 'bg-red-600/95 text-white'
            : 'bg-emerald-500/95 text-emerald-950'
        }`}
      >
        {!isError && (
          <span className="relative w-5 h-5 flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 animate-check-pop" fill="none">
              <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.25)" />
              <path
                d="M7 12.5l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
        )}
        {isError && (
          <span className="w-5 h-5 flex-shrink-0 rounded-full bg-white/25 flex items-center justify-center text-xs font-black">
            !
          </span>
        )}
        <div className="flex flex-col">
          {toast.title && <div className="text-sm font-bold leading-tight">{toast.title}</div>}
          {toast.message && (
            <div className={`text-xs leading-tight ${isError ? 'text-white/90' : 'text-emerald-900'}`}>
              {toast.message}
            </div>
          )}
        </div>
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={() => {
              toast.onAction()
              onDismiss()
            }}
            className="ml-2 text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/30 hover:bg-white/50 transition-colors"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
