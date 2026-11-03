import { useCallback, useEffect, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'
import { useClosable } from '../lib/useClosable.js'
import { formatDateTime, timeAgo } from '../lib/when.js'
import { CloseIcon } from '../lib/icons.jsx'

const PAGE = 20

// Every sign-in one account has made, newest first.
//
// Read from the activity log rather than a table of its own: each successful
// sign-in is already an entry there, with its time and address. Only sign-ins
// recorded since accounts were attached to them are listed — before that the
// log wrote them down without saying whose they were.
export default function LoginHistory({ user, onClose }) {
  const { closing, requestClose } = useClosable(onClose)
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (nextOffset, append) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listAudit({ entity: 'auth', actorId: user.id, limit: PAGE, offset: nextOffset })
      const rows = res.data || []
      setEntries((prev) => (append ? [...prev, ...rows] : rows))
      setTotal(res.total ?? rows.length)
      setOffset(nextOffset)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    load(0, false)
  }, [load])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 animate-fade-in ${
        closing ? 'is-closing' : ''
      }`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Sign-in history for ${user.name}`}
    >
      <div className="modal-panel w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-deck-surface border border-deck-border shadow-2xl animate-scale-in">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-deck-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{user.name}</h2>
            <p className="text-xs text-deck-muted truncate">{user.email}</p>
          </div>
          <button
            onClick={requestClose}
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/15"
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pt-4">
          <Summary label="Last sign-in" value={user.lastLoginAt} />
          <Summary label="Last active" value={user.lastSeenAt} />
        </div>

        <div className="px-5 pt-5 pb-2 text-[10px] uppercase tracking-widest font-bold text-deck-muted">
          Sign-ins {total > 0 && <span className="ml-1">· {total}</span>}
        </div>

        <div className="overflow-y-auto px-5 pb-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {humanizeError(error, { action: 'load the sign-in history' }).message}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="text-sm text-deck-muted py-6 text-center">No sign-ins recorded yet.</p>
          )}
          <ul className="divide-y divide-deck-border/60">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="tabular-nums">{formatDateTime(e.at)}</span>
                <span className="font-mono text-[11px] text-deck-muted truncate">{e.ip}</span>
              </li>
            ))}
          </ul>
          {entries.length < total && (
            <button
              onClick={() => load(offset + PAGE, true)}
              disabled={loading}
              className="mt-3 w-full py-2 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Loading…' : `Show older (${total - entries.length} left)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value }) {
  return (
    <div className="rounded-lg bg-deck-card border border-deck-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-deck-muted">{label}</div>
      <div className="text-sm font-semibold mt-0.5 tabular-nums">
        {value ? formatDateTime(value) : 'Never'}
      </div>
      {value && <div className="text-[11px] text-deck-muted">{timeAgo(value)}</div>}
    </div>
  )
}
