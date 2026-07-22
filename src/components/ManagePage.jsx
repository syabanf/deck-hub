import { useMemo, useState } from 'react'
import { CATEGORIES, INDUSTRIES } from '../data/decks.js'
import { TrashIcon, PlusIcon, StarIcon, PencilIcon } from '../lib/icons.jsx'
import LoadMore from './LoadMore.jsx'

const SOURCE_LABELS = {
  pdf: { label: 'PDF', color: '#60a5fa' },
  url: { label: 'Linked', color: '#34d399' },
  video: { label: 'Video', color: '#fb7185' },
}
const sourceMeta = (type) => SOURCE_LABELS[type] || { label: type || 'Linked', color: '#8a8a99' }

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

// Backend-primary catalog admin table. Operates on the live catalog fetched
// from the API; edits flow back through onEdit → PUT /decks and
// onRemove → DELETE /decks.
// The table is server-paged: `decks` is one page of results the API already
// filtered, and `filters` are controlled by the parent so the query and the
// fetch can't drift apart. Filtering locally would only ever search the rows
// that happened to be loaded.
export default function ManagePage({
  decks = [],
  total = 0,
  loading = false,
  catalogStats,
  filters,
  onFiltersChange,
  onLoadMore,
  canEdit = false,
  onAddClick,
  onPlay,
  onDetails,
  onEdit,
  onRemove,
  embedded = false,
}) {
  const { search = '', category: filterCategory = 'all', industry: filterIndustry = 'all', source: filterSource = 'all' } = filters || {}
  const setFilter = (patch) => onFiltersChange?.({ ...filters, ...patch })
  const setSearch = (v) => setFilter({ search: v })
  const setFilterCategory = (v) => setFilter({ category: v })
  const setFilterIndustry = (v) => setFilter({ industry: v })
  const setFilterSource = (v) => setFilter({ source: v })

  // Already filtered server-side.
  const filtered = decks

  // Catalog-wide totals come from /decks/stats — counting the loaded page would
  // report the page size, not the catalog.
  const stats = useMemo(() => ({
    total: catalogStats?.total ?? 0,
    mine: catalogStats?.byCategory?.mine ?? 0,
    featured: catalogStats?.featured ?? 0,
    totalViews: catalogStats?.totalViews ?? 0,
    byCategory: catalogStats?.byCategory ?? {},
  }), [catalogStats])

  return (
    <div className={embedded ? '' : 'px-6 md:px-12 pt-32 lg:pt-28 pb-16 min-h-screen'}>
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
              <h1 className="text-4xl md:text-5xl font-black tracking-tight">Manage catalog</h1>
              <p className="text-deck-muted mt-1">
                The live deck catalog served by the WIT API.
              </p>
            </div>
          )}
          {canEdit && (
            <button
              onClick={onAddClick}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-deck-accent hover:bg-deck-accentDim text-sm font-bold shadow-lg shadow-deck-accent/30"
            >
              <PlusIcon size={14} />
              New deck
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total decks" value={stats.total} />
        <StatCard label="Featured" value={stats.featured} accent="#a78bfa" />
        <StatCard label="My library" value={stats.mine} accent="#34d399" />
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
        {['all', 'url', 'video', 'pdf'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterSource(s)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${
              filterSource === s
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/15'
            }`}
          >
            {s === 'all' ? 'All sources' : sourceMeta(s).label}
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
              const meta = sourceMeta(deck.source?.type || 'url')
              return (
                <tr key={deck.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2">
                    <button onClick={() => onDetails(deck)} className="text-left hover:text-white">
                      <div className="font-semibold truncate max-w-[260px] flex items-center gap-2">
                        {deck.title}
                        {deck.featured && (
                          <StarIcon size={12} className="text-deck-accent shrink-0" />
                        )}
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
                      style={{ background: `${meta.color}25`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs hidden md:table-cell">{deck.year}</td>
                  <td className="px-3 py-2 text-xs text-deck-muted tabular-nums hidden lg:table-cell">
                    {(deck.viewCount || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onPlay(deck)}
                        className="px-2 py-1 rounded text-[11px] font-semibold bg-white/5 hover:bg-white/15"
                      >
                        Open
                      </button>
                      {onEdit && (
                        <button
                          onClick={() => onEdit(deck)}
                          className="w-7 h-7 rounded flex items-center justify-center bg-white/5 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                          title="Edit deck"
                          aria-label={`Edit ${deck.title}`}
                        >
                          <PencilIcon size={13} />
                        </button>
                      )}
                      {onRemove && (
                        <button
                          onClick={() => onRemove(deck)}
                          className="w-7 h-7 rounded flex items-center justify-center bg-white/5 hover:bg-red-500/30 text-white/70 hover:text-red-300"
                          title="Delete deck"
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
      <LoadMore loaded={decks.length} total={total} loading={loading} onLoadMore={onLoadMore} />
    </div>
  )
}
