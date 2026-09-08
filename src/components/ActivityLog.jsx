import { useCallback, useEffect, useState } from 'react'

import { api } from '../lib/api.js'
import { humanizeError } from '../lib/errors.js'

const PAGE = 50

const ACTION_COLOR = {
  create: '#34d399',
  update: '#60a5fa',
  delete: '#f87171',
}

// Who changed what, and when.
//
// Paged rather than filtered down to a single screen: this is the one table
// that only grows, and the answer to "what happened last Tuesday" is further
// down it than any default page could reach.
export default function ActivityLog() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (nextOffset, append) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listAudit({ entity, action, limit: PAGE, offset: nextOffset })
      const rows = res.data || []
      setEntries((prev) => (append ? [...prev, ...rows] : rows))
      setTotal(res.total ?? rows.length)
      setOffset(nextOffset)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [entity, action])

  // A filter change starts a new listing rather than appending to the old one.
  useEffect(() => {
    load(0, false)
  }, [load])

  const select = 'h-9 px-3 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className={select}>
          <option value="">Everything</option>
          <option value="deck">Decks</option>
          <option value="user">Users</option>
          <option value="taxonomy">Master data</option>
          <option value="settings">Settings</option>
          <option value="upload">Uploads</option>
          <option value="profile">Profiles</option>
          <option value="auth">Sign-ins</option>
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={select}>
          <option value="">Any change</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </select>
        <span className="text-xs text-deck-muted ml-auto">
          {total} {total === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {humanizeError(error, { action: 'load the activity log' }).message}
        </div>
      )}

      <div className="rounded-xl border border-deck-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-deck-muted">
              <tr>
                <th className="text-left px-3 py-2 font-bold whitespace-nowrap">When</th>
                <th className="text-left px-3 py-2 font-bold">Who</th>
                <th className="text-left px-3 py-2 font-bold">Did</th>
                <th className="text-left px-3 py-2 font-bold hidden md:table-cell">What</th>
                <th className="text-left px-3 py-2 font-bold hidden lg:table-cell">Request</th>
                <th className="text-left px-3 py-2 font-bold hidden xl:table-cell">From</th>
              </tr>
            </thead>
            <tbody>
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-deck-muted">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-deck-border/60">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-deck-muted text-xs">
                    {String(e.at).slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2">
                    {/* An entry with no account is one of the writes that are
                        unauthenticated by design — a sign-in, a registration,
                        the public view counter. */}
                    <span className={e.actorEmail ? '' : 'text-white/40 italic'}>
                      {e.actorEmail || 'not signed in'}
                    </span>
                    {e.actorRole && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-deck-muted">
                        {e.actorRole}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        background: `${ACTION_COLOR[e.action] || '#8a8a99'}25`,
                        color: ACTION_COLOR[e.action] || '#8a8a99',
                      }}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className="capitalize">{e.entity}</span>
                    {e.entityId && (
                      <span className="ml-2 font-mono text-[11px] text-deck-muted">
                        {e.entityId.length > 12 ? `${e.entityId.slice(0, 8)}…` : e.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-deck-muted hidden lg:table-cell">
                    {e.route}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-deck-muted hidden xl:table-cell">
                    {e.ip}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {entries.length < total && (
        <button
          onClick={() => load(offset + PAGE, true)}
          disabled={loading}
          className="mt-4 w-full py-2.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Loading…' : `Show older (${total - entries.length} left)`}
        </button>
      )}

      <p className="text-xs text-deck-muted mt-3">
        Every change is recorded — creates, updates and deletes. Reads are not: they
        would bury the changes, and what changed is the question worth asking. Refused
        requests are left out too, since an attempt that changed nothing is not a change.
      </p>
    </div>
  )
}
