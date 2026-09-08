import { useEffect, useRef } from 'react'

import { useClosable } from '../lib/useClosable.js'

// An in-app confirmation, replacing window.confirm.
//
// The browser's own dialog carries a "don't show me these again" checkbox, and
// once it is ticked every later confirm() on the page returns false without
// displaying anything. The button then does nothing, with no error and no
// explanation — which is how deleting a user stopped working in production.
// This cannot be switched off by the person it is protecting.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  destructive = true,
  onConfirm,
  onClose,
}) {
  const { closing, requestClose } = useClosable(onClose)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // Focus lands on Cancel's neighbour rather than the destructive button, so
    // a stray Enter does not delete anything.
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, requestClose])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 animate-fade-in ${
        closing ? 'is-closing' : ''
      }`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal-panel w-full max-w-md rounded-xl bg-deck-surface border border-deck-border shadow-2xl p-6 animate-scale-in">
        <h2 className="text-lg font-bold">{title}</h2>
        {message && <p className="text-sm text-deck-muted mt-2 leading-snug">{message}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={requestClose}
            className="px-4 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => {
              onConfirm()
              requestClose()
            }}
            className={`px-4 h-9 rounded-lg font-bold text-sm ${
              destructive ? 'bg-red-500/80 hover:bg-red-500' : 'bg-deck-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
