import { useMemo, useState } from 'react'
import { MOCK_DECKS, CATEGORIES, INDUSTRIES } from '../data/decks.js'
import { getEffectiveViews } from '../lib/storage.js'
import { TrashIcon, PlusIcon } from '../lib/icons.jsx'

const SOURCE_LABELS = {
  mock: { label: 'Catalog', color: '#8a8a99' },
  pdf: { label: 'PDF', color: '#60a5fa' },
  url: { label: 'Linked', color: '#34d399' },
  video: { label: 'Video', color: '#fb7185' },
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

export default function ManagePage({
  userDecks,
  onAddClick,
  onPlay,
  onDetails,
  onRemove,
  onExport,
  onImport,
  embedded = false,
}) {
  const allDecks = useMemo(() => [...userDecks, ...MOCK_DECKS], [userDecks])

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterIndustry, setFilterIndustry] = useState('all')
  const [filterSource, setFilterSource] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allDecks.filter((d) => {
      if (filterCategory !== 'all' && d.category !== filterCategory) return false
      if (filterIndustry !== 'all' && d.industry !== filterIndustry) return false
      const src = d.source?.type || 'mock'
      if (filterSource !== 'all' && src !== filterSource) return false
      if (!q) return true
      return (
        d.title.toLowerCase().includes(q) ||
        (d.author || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [allDecks, search, filterCategory, filterIndustry, filterSource])

  const stats = useMemo(() => {
    const total = allDecks.length
    const userCount = userDecks.length
    const catalogCount = MOCK_DECKS.length
    const byCategory = CATEGORIES.reduce((acc, c) => {
      acc[c.id] = MOCK_DECKS.filter((d) => d.category === c.id).length
      return acc
    }, {})
    const totalViews = MOCK_DECKS.reduce((sum, d) => sum + getEffectiveViews(d.id), 0)
    return { total, userCount, catalogCount, byCategory, totalViews }
  }, [userDecks, allDecks])

  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('JSON must be an array')
        onImport(parsed)
      } catch (err) {
        alert('Failed to import: ' + err.message)
      }
    }
    input.click()
  }

  return (
    <div className={embedded ? '' : 'px-6 md:px-12 pt-28 pb-16 min-h-screen'}>
      {/* Header */}
      <div className="mb-6">
        {!embedded && (
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-deck-muted mb-2">
            Configuration
          </div>
        )}
        <div className={`flex flex-wrap items-end gap-4 ${embedded ? 'justify-end' : 'justify-between'}`}>
          {!embedded && (
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight">Manage master data</h1>
              <p className="text-deck-muted mt-1">
                Catalog overview, user library, exports, and stats.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportClick}
              className="px-3 py-2 rounded-lg bg-white/5 border border-deck-border hover:bg-white/10 text-sm font-semibold"
            >
              Import JSON
            </button>
            <button
              onClick={onExport}
              disabled={userDecks.length === 0}
              className="px-3 py-2 rounded-lg bg-white/5 border border-deck-border hover:bg-white/10 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Library
            </button>
            <button
              onClick={onAddClick}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold shadow-lg shadow-deck-accent/30"
            >
              <PlusIcon size={14} />
              New deck
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total decks" value={stats.total} />
        <StatCard label="Catalog decks" value={stats.catalogCount} accent="#a78bfa" />
        <StatCard label="My library" value={stats.userCount} accent="#34d399" />
        <StatCard label="Total views" value={stats.totalViews.toLocaleString()} accent="#fbbf24" />
      </div>

      {/* Category breakdown */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-deck-muted mb-2">By category</div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <div
              key={c.id}
              className="px-3 py-1.5 rounded-full bg-white/5 border border-deck-border text-xs flex items-center gap-2"
            >
              <span className="text-white/80">{c.title}</span>
              <span className="font-bold text-white">{stats.byCategory[c.id]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, author, tag…"
          className="md:col-span-2 px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm placeholder:text-white/40 focus:outline-none focus:border-white/40"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
        >
          <option value="all">All categories</option>
          <option value="mine">My Library</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={filterIndustry}
          onChange={(e) => setFilterIndustry(e.target.value)}
          className="px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm focus:outline-none focus:border-white/40"
        >
          <option value="all">All industries</option>
          {INDUSTRIES.map((i) => (
            <option key={i.id} value={i.id}>{i.title}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', 'mock', 'pdf', 'url', 'video'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterSource(s)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${
              filterSource === s
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/15'
            }`}
          >
            {s === 'all' ? 'All sources' : SOURCE_LABELS[s].label}
          </button>
        ))}
        <span className="ml-auto text-xs text-deck-muted">{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-deck-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-deck-muted">
            <tr>
              <th className="text-left px-3 py-2 font-bold">Deck</th>
              <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Author</th>
              <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Category</th>
              <th className="text-left px-3 py-2 font-bold hidden lg:table-cell">Industry</th>
              <th className="text-left px-3 py-2 font-bold">Source</th>
              <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Year</th>
              <th className="text-left px-3 py-2 font-bold hidden lg:table-cell">Views</th>
              <th className="text-right px-3 py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-deck-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-deck-muted">
                  No decks match these filters.
                </td>
              </tr>
            )}
            {filtered.map((deck) => {
              const src = deck.source?.type || 'mock'
              const isUser = deck.id.startsWith('user-')
              const srcMeta = SOURCE_LABELS[src]
              return (
                <tr key={deck.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onDetails(deck)}
                      className="text-left hover:text-white"
                    >
                      <div className="font-semibold truncate max-w-[260px]">
                        {deck.title}
                      </div>
                      {deck.subtitle && (
                        <div className="text-xs text-deck-muted truncate max-w-[260px]">
                          {deck.subtitle}
                        </div>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-deck-muted text-xs hidden md:table-cell">
                    {deck.author}
                  </td>
                  <td className="px-3 py-2 text-xs hidden md:table-cell">
                    {CATEGORIES.find((c) => c.id === deck.category)?.title || deck.category}
                  </td>
                  <td className="px-3 py-2 text-xs hidden lg:table-cell">
                    {INDUSTRIES.find((i) => i.id === deck.industry)?.title || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: `${srcMeta.color}25`, color: srcMeta.color }}
                    >
                      {srcMeta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs hidden md:table-cell">{deck.year}</td>
                  <td className="px-3 py-2 text-xs text-deck-muted tabular-nums hidden lg:table-cell">
                    {!isUser ? getEffectiveViews(deck.id).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onPlay(deck)}
                        className="px-2 py-1 rounded text-[11px] font-semibold bg-white/5 hover:bg-white/15"
                      >
                        Open
                      </button>
                      {isUser && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${deck.title}" from your library?`)) {
                              onRemove(deck)
                            }
                          }}
                          className="w-7 h-7 rounded flex items-center justify-center bg-white/5 hover:bg-red-500/30 text-white/70 hover:text-red-300"
                          title="Delete"
                        >
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
