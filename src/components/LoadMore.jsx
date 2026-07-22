// Paging affordance for the browse listings.
//
// Shows how much of the result set is on screen, because with a server-paged
// list "50 decks" on its own is ambiguous — is that all of them, or the first
// page? Renders nothing once everything is loaded.
export default function LoadMore({ loaded, total, loading, onLoadMore }) {
  if (!onLoadMore || !total || loaded >= total) return null

  return (
    <div className="flex flex-col items-center gap-2 py-10">
      <span className="text-xs text-deck-muted tabular-nums">
        Showing {loaded.toLocaleString()} of {total.toLocaleString()}
      </span>
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold disabled:opacity-50 disabled:cursor-wait transition-colors"
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}
