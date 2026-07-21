import { useMemo, useState } from 'react'
import { INDUSTRIES } from '../data/decks.js'

// Source types after normalization (api.js maps gslides/embed → url).
const SOURCE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Video' },
  { id: 'url', label: 'Linked' },
  { id: 'pdf', label: 'PDF' },
]

const SORT_OPTIONS = [
  { id: 'views', label: 'Most viewed' },
  { id: 'newest', label: 'Recently added' },
  { id: 'year-desc', label: 'Year (newest)' },
  { id: 'year-asc', label: 'Year (oldest)' },
  { id: 'title', label: 'Title A–Z' },
]

const DEFAULTS = { industry: 'all', year: 'all', source: 'all', sort: 'views' }

// useDeckFilters owns the filter state and derives the filtered/sorted list.
// The companion <DeckFilters> component renders the controls.
export function useDeckFilters(decks = []) {
  const [industry, setIndustry] = useState(DEFAULTS.industry)
  const [year, setYear] = useState(DEFAULTS.year)
  const [source, setSource] = useState(DEFAULTS.source)
  const [sort, setSort] = useState(DEFAULTS.sort)

  // Only offer options that actually exist in this deck set.
  const availableIndustries = useMemo(() => {
    const present = new Set(decks.map((d) => d.industry).filter(Boolean))
    return INDUSTRIES.filter((i) => present.has(i.id))
  }, [decks])

  const availableYears = useMemo(
    () => [...new Set(decks.map((d) => d.year).filter(Boolean))].sort((a, b) => b - a),
    [decks],
  )

  const availableSources = useMemo(() => {
    const present = new Set(decks.map((d) => d.source?.type).filter(Boolean))
    return SOURCE_OPTIONS.filter((s) => s.id === 'all' || present.has(s.id))
  }, [decks])

  const filtered = useMemo(() => {
    const out = decks.filter((d) => {
      if (industry !== 'all' && d.industry !== industry) return false
      if (year !== 'all' && String(d.year) !== String(year)) return false
      if (source !== 'all' && (d.source?.type || '') !== source) return false
      return true
    })

    const byTitle = (a, b) => a.title.localeCompare(b.title)
    switch (sort) {
      case 'newest':
        return out.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      case 'year-desc':
        return out.sort((a, b) => (b.year || 0) - (a.year || 0) || byTitle(a, b))
      case 'year-asc':
        return out.sort((a, b) => (a.year || 0) - (b.year || 0) || byTitle(a, b))
      case 'title':
        return out.sort(byTitle)
      case 'views':
      default:
        return out.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    }
  }, [decks, industry, year, source, sort])

  const isFiltered = industry !== DEFAULTS.industry || year !== DEFAULTS.year || source !== DEFAULTS.source
  const reset = () => {
    setIndustry(DEFAULTS.industry)
    setYear(DEFAULTS.year)
    setSource(DEFAULTS.source)
    setSort(DEFAULTS.sort)
  }

  return {
    filtered,
    controls: {
      industry, setIndustry,
      year, setYear,
      source, setSource,
      sort, setSort,
      availableIndustries, availableYears, availableSources,
      isFiltered, reset,
      total: decks.length,
      shown: filtered.length,
    },
  }
}

const selectClass =
  'px-3 py-2 rounded-lg bg-deck-card border border-deck-border text-sm text-white/90 focus:outline-none focus:border-white/40 transition-colors'

// hide: array of control ids to omit, e.g. ['industry'] when the surrounding
// page already owns the industry filter.
export default function DeckFilters({
  industry, setIndustry,
  year, setYear,
  source, setSource,
  sort, setSort,
  availableIndustries, availableYears, availableSources,
  isFiltered, reset,
  total, shown,
  hide = [],
}) {
  const show = (id) => !hide.includes(id)

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {show('industry') && availableIndustries.length > 0 && (
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={selectClass}
            aria-label="Filter by industry"
          >
            <option value="all">All industries</option>
            {availableIndustries.map((i) => (
              <option key={i.id} value={i.id}>{i.title}</option>
            ))}
          </select>
        )}

        {show('year') && availableYears.length > 1 && (
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={selectClass}
            aria-label="Filter by year"
          >
            <option value="all">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        {show('sort') && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={selectClass}
            aria-label="Sort decks"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>Sort: {s.label}</option>
            ))}
          </select>
        )}

        {/* Source-type chips */}
        {show('source') && availableSources.length > 2 && (
          <div className="flex items-center gap-1.5 ml-1">
            {availableSources.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  source === s.id
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-deck-muted">
          <span className="tabular-nums">
            {shown === total ? `${total} decks` : `${shown} of ${total} decks`}
          </span>
          {isFiltered && (
            <button
              onClick={reset}
              className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Clear filters ×
            </button>
          )}
        </div>
      </div>

      {shown === 0 && total > 0 && (
        <div className="text-sm text-deck-muted">
          No decks match these filters.{' '}
          <button onClick={reset} className="text-white underline hover:text-deck-accent">
            Clear them
          </button>
          .
        </div>
      )}
    </div>
  )
}
