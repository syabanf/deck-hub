import { useMemo, useState } from 'react'
import { ROLES, USER_STATUSES } from '../lib/storage.js'
import { PlusIcon, TrashIcon, UserIcon, CloseIcon } from '../lib/icons.jsx'
import ManagePage from './ManagePage.jsx'

const ROLE_META = {
  admin: { label: 'Admin', color: '#fb7185' },
  editor: { label: 'Editor', color: '#60a5fa' },
  viewer: { label: 'Viewer', color: '#8a8a99' },
}
const STATUS_META = {
  active: { label: 'Active', color: '#34d399' },
  invited: { label: 'Invited', color: '#fbbf24' },
  suspended: { label: 'Suspended', color: '#f87171' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsPage({
  manageProps,
  users,
  currentEmail,
  canManageUsers = false,
  onAddUser,
  onUpdateUser,
  onRemoveUser,
}) {
  const [tab, setTab] = useState('users')

  return (
    <div className="px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
          Configuration
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">Settings</h1>
        <p className="text-deck-muted mt-1">
          Manage your team and the deck catalog master data.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-deck-border">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          Users
          <span className="ml-2 text-[11px] font-bold text-deck-muted">{users.length}</span>
        </TabButton>
        <TabButton active={tab === 'data'} onClick={() => setTab('data')}>
          Master Data
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === 'users' ? (
          <UsersManager
            users={users}
            currentEmail={currentEmail}
            canManage={canManageUsers}
            onAdd={onAddUser}
            onUpdate={onUpdateUser}
            onRemove={onRemoveUser}
          />
        ) : (
          <ManagePage embedded {...manageProps} />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? 'text-white' : 'text-white/55 hover:text-white/85'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-deck-accent" />
      )}
    </button>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-deck-card border border-deck-border px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-deck-muted">{label}</div>
      <div className="text-2xl font-black mt-0.5" style={{ color: accent || 'white' }}>
        {value}
      </div>
    </div>
  )
}

function Badge({ meta }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: `${meta.color}25`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

const blankUser = { name: '', email: '', password: '', role: 'viewer', status: 'invited' }

function UsersManager({ users, currentEmail, canManage, onAdd, onUpdate, onRemove }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(blankUser)
  const [error, setError] = useState('')

  const stats = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      active: users.filter((u) => u.status === 'active').length,
      pending: users.filter((u) => u.status !== 'active').length,
    }
  }, [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter, statusFilter])

  const submitDraft = () => {
    if (!draft.name.trim()) return setError('Name is required.')
    if (!EMAIL_RE.test(draft.email.trim())) return setError('Enter a valid email.')
    if (draft.password.length < 8) return setError('Password must be at least 8 characters.')
    if (users.some((u) => u.email.toLowerCase() === draft.email.trim().toLowerCase())) {
      return setError('A user with that email already exists.')
    }
    onAdd({
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      password: draft.password,
      role: draft.role,
      status: draft.status,
    })
    setDraft(blankUser)
    setError('')
    setAdding(false)
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total users" value={stats.total} />
        <StatCard label="Admins" value={stats.admins} accent="#fb7185" />
        <StatCard label="Active" value={stats.active} accent="#34d399" />
        <StatCard label="Invited / suspended" value={stats.pending} accent="#fbbf24" />
      </div>

      {/* Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
        >
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_META[r].label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
        >
          <option value="all">All statuses</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
        {canManage && (
          <button
            onClick={() => { setAdding((a) => !a); setError('') }}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold shadow-lg shadow-deck-accent/30"
          >
            {adding ? <CloseIcon size={14} /> : <PlusIcon size={14} />}
            {adding ? 'Cancel' : 'Add user'}
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && canManage && (
        <div className="rounded-xl border border-deck-border bg-deck-card/60 p-4 mb-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-3 items-center">
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Full name"
              className="px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
            />
            <input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="email@wit.id"
              className="px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
            />
            <input
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              placeholder="Temp password"
              autoComplete="new-password"
              className="px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
            />
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              className="px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm focus:outline-none focus:border-white/40"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </select>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              className="px-3 py-2 rounded-lg bg-deck-bg border border-deck-border text-sm focus:outline-none focus:border-white/40"
            >
              {USER_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <button
              onClick={submitDraft}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90"
            >
              Save
            </button>
          </div>
          {error && <div className="text-sm text-rose-400 mt-2">{error}</div>}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-deck-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-deck-muted">
            <tr>
              <th className="text-left px-3 py-2 font-bold">User</th>
              <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Email</th>
              <th className="text-left px-3 py-2 font-bold">Role</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
              <th className="text-left px-3 py-2 font-bold hidden lg:table-cell">Joined</th>
              <th className="text-right px-3 py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-deck-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-deck-muted">
                  No users match these filters.
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const isSelf = currentEmail && u.email.toLowerCase() === currentEmail.toLowerCase()
              return (
                <tr key={u.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-deck-accent/90 text-white text-xs font-black shrink-0">
                        {u.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {u.name}
                          {isSelf && (
                            <span className="text-[9px] uppercase tracking-wider font-bold text-deck-muted border border-deck-border rounded px-1 py-0.5">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-deck-muted truncate md:hidden">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-deck-muted text-xs hidden md:table-cell">
                    {u.email}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={!canManage}
                      onChange={(e) => onUpdate(u.id, { role: e.target.value })}
                      className="bg-transparent border border-deck-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-white/40 disabled:opacity-70 disabled:cursor-not-allowed"
                      style={{ color: ROLE_META[u.role]?.color }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-deck-card text-white">
                          {ROLE_META[r].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.status}
                      disabled={!canManage}
                      onChange={(e) => onUpdate(u.id, { status: e.target.value })}
                      className="bg-transparent border border-deck-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-white/40 disabled:opacity-70 disabled:cursor-not-allowed"
                      style={{ color: STATUS_META[u.status]?.color }}
                    >
                      {USER_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-deck-card text-white">
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-deck-muted hidden lg:table-cell tabular-nums">
                    {u.createdAt || '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      disabled={isSelf || !canManage}
                      onClick={() => {
                        if (confirm(`Remove ${u.name} (${u.email})?`)) onRemove(u.id)
                      }}
                      className="w-7 h-7 rounded inline-flex items-center justify-center bg-white/5 hover:bg-red-500/30 text-white/70 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-white/70"
                      title={isSelf ? "You can't remove yourself" : !canManage ? 'Admin only' : 'Remove user'}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-deck-muted flex items-center gap-2">
        <UserIcon size={13} />
        {canManage
          ? 'Changes save to the Go/PostgreSQL backend instantly.'
          : 'This directory is read-only — sign in as an admin to manage users.'}
      </div>
    </div>
  )
}
