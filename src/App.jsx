import { useEffect, useMemo, useState } from 'react'
import { MOCK_DECKS, CATEGORIES, INDUSTRIES, FEATURED_DECK } from './data/decks.js'
import {
  loadUserDecks,
  saveUserDecks,
  loadHistory,
  getEffectiveViews,
  loadAuth,
  saveAuth,
  clearAuth,
  loadUsers,
  saveUsers,
} from './lib/storage.js'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Row from './components/Row.jsx'
import TopTenRow from './components/TopTenRow.jsx'
import CategoryView from './components/CategoryView.jsx'
import DetailsModal from './components/DetailsModal.jsx'
import DeckPlayer from './components/DeckPlayer.jsx'
import AddDeckModal from './components/AddDeckModal.jsx'
import Cover from './components/Cover.jsx'
import Toast from './components/Toast.jsx'
import SearchModal from './components/SearchModal.jsx'
import IndustriesPage from './components/IndustriesPage.jsx'
import LoginPage from './components/LoginPage.jsx'
import SettingsPage from './components/SettingsPage.jsx'

const matchesQuery = (deck, q) => {
  if (!q) return true
  const s = q.toLowerCase()
  return (
    deck.title.toLowerCase().includes(s) ||
    (deck.subtitle || '').toLowerCase().includes(s) ||
    (deck.author || '').toLowerCase().includes(s) ||
    (deck.description || '').toLowerCase().includes(s) ||
    (deck.tags || []).some((t) => t.toLowerCase().includes(s))
  )
}

export default function App() {
  const [user, setUser] = useState(() => loadAuth())
  const [userDecks, setUserDecks] = useState(() => loadUserDecks())
  const [history, setHistory] = useState(() => loadHistory())
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('home')
  const [detailsDeck, setDetailsDeck] = useState(null)
  const [playing, setPlaying] = useState(null) // { deck, startIndex }
  const [addOpen, setAddOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeIndustry, setActiveIndustry] = useState(null)
  const [users, setUsers] = useState(() => loadUsers())

  useEffect(() => {
    saveUserDecks(userDecks)
  }, [userDecks])

  useEffect(() => {
    saveUsers(users)
  }, [users])

  useEffect(() => {
    if (!playing) setHistory(loadHistory())
  }, [playing])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeCategory])

  const allDecks = useMemo(() => [...userDecks, ...MOCK_DECKS], [userDecks])

  const continueWatching = useMemo(() => {
    const entries = Object.values(history)
      .filter((h) => h.currentSlide > 0 && h.currentSlide < h.totalSlides - 1)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, 10)
    return entries
      .map((h) => allDecks.find((d) => d.id === h.deckId))
      .filter(Boolean)
  }, [history, allDecks])

  const byCategory = useMemo(() => {
    const map = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]))
    for (const d of MOCK_DECKS) {
      if (map[d.category]) map[d.category].push(d)
    }
    return map
  }, [])

  const mostViewed = useMemo(() => {
    return [...MOCK_DECKS]
      .map((d) => ({ deck: d, views: getEffectiveViews(d.id) }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)
      .map((x) => x.deck)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  const byIndustry = useMemo(() => {
    const map = Object.fromEntries(INDUSTRIES.map((c) => [c.id, []]))
    for (const d of MOCK_DECKS) {
      if (d.industry && map[d.industry]) map[d.industry].push(d)
    }
    return map
  }, [])

  // Gate the whole app behind a (mock) sign-in screen.
  if (!user) {
    return (
      <LoginPage
        onLogin={(profile) => {
          saveAuth(profile)
          setUser(profile)
        }}
      />
    )
  }

  const handleLogout = () => {
    clearAuth()
    setUser(null)
    setActiveCategory('home')
    setQuery('')
    setActiveIndustry(null)
  }

  const filtered = (decks) =>
    decks.filter((d) => {
      if (!matchesQuery(d, query)) return false
      if (activeIndustry && d.industry !== activeIndustry) return false
      return true
    })

  const handlePlay = (deck, startIndex = 0) => {
    setDetailsDeck(null)
    setPlaying({ deck, startIndex })
  }
  const handleDetails = (deck) => setDetailsDeck(deck)
  const handleAdd = (deck) => {
    setUserDecks((prev) => [deck, ...prev])
    setAddOpen(false)
    setToast({
      title: 'Added to your library',
      message: `"${deck.title}" is ready to open.`,
      actionLabel: 'Open',
      onAction: () => handlePlay(deck),
    })
  }
  const handleRemove = (deck) => {
    if (!deck.id.startsWith('user-')) return
    setUserDecks((prev) => prev.filter((d) => d.id !== deck.id))
  }

  const handleAddUser = (u) => {
    setUsers((prev) => [u, ...prev])
    setToast({ title: 'User added', message: `${u.name} can now access WIT.` })
  }
  const handleUpdateUser = (id, patch) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  const handleRemoveUser = (id) =>
    setUsers((prev) => prev.filter((u) => u.id !== id))

  const isSearching = !!query.trim() || !!activeIndustry
  const isHome = activeCategory === 'home' && !isSearching
  const isSettings = activeCategory === 'settings'
  const isIndustries = activeCategory === 'industries' && !isSearching
  const showCategory = !isHome && !isSearching && !isSettings && !isIndustries

  // Decide what to render in the main area
  let body
  if (isSearching) {
    const industryLabel = activeIndustry
      ? INDUSTRIES.find((i) => i.id === activeIndustry)?.title
      : null
    body = (
      <SearchResults
        decks={filtered(allDecks)}
        onPlay={handlePlay}
        onDetails={handleDetails}
        query={query}
        industryLabel={industryLabel}
        onClearIndustry={() => setActiveIndustry(null)}
        onClearQuery={() => setQuery('')}
      />
    )
  } else if (isIndustries) {
    body = (
      <IndustriesPage
        onPickIndustry={(id) => {
          setActiveIndustry(id)
        }}
      />
    )
  } else if (isSettings) {
    body = (
      <SettingsPage
        users={users}
        currentEmail={user?.email}
        onAddUser={handleAddUser}
        onUpdateUser={handleUpdateUser}
        onRemoveUser={handleRemoveUser}
        manageProps={{
          userDecks,
          onAddClick: () => setAddOpen(true),
          onPlay: handlePlay,
          onDetails: handleDetails,
          onRemove: handleRemove,
          onExport: () => {
            const blob = new Blob([JSON.stringify(userDecks, null, 2)], {
              type: 'application/json',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `wit-library-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            setToast({ title: 'Library exported', message: `${userDecks.length} decks downloaded.` })
          },
          onImport: (decks) => {
            const valid = decks.filter((d) => d && d.title && d.source)
            setUserDecks((prev) => {
              const existingIds = new Set(prev.map((d) => d.id))
              const fresh = valid.map((d) => ({
                ...d,
                id: existingIds.has(d.id) ? `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : d.id,
              }))
              return [...fresh, ...prev]
            })
            setToast({ title: 'Library imported', message: `${valid.length} decks added.` })
          },
        }}
      />
    )
  } else if (showCategory) {
    const decks =
      activeCategory === 'mine' ? userDecks : byCategory[activeCategory] || []
    body = (
      <CategoryView
        categoryId={activeCategory}
        decks={decks}
        onPlay={handlePlay}
        onDetails={handleDetails}
        onRemove={handleRemove}
        onAddClick={() => setAddOpen(true)}
        onCategoryClick={setActiveCategory}
      />
    )
  } else {
    body = (
      <HomeRows
        continueWatching={continueWatching}
        userDecks={userDecks}
        byCategory={byCategory}
        mostViewed={mostViewed}
        onPlay={handlePlay}
        onDetails={handleDetails}
        onRemove={handleRemove}
        onAddClick={() => setAddOpen(true)}
        onCategoryNav={setActiveCategory}
      />
    )
  }

  return (
    <div className="min-h-screen text-white pb-20">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onAddClick={() => setAddOpen(true)}
        onSearchClick={() => setSearchModalOpen(true)}
        activeCategory={activeCategory}
        onCategoryChange={(id) => {
          setActiveCategory(id)
          if (query) setQuery('')
        }}
      />

      {isHome && (
        <Hero
          deck={FEATURED_DECK}
          onPlay={handlePlay}
          onDetails={handleDetails}
          onCategoryNav={setActiveCategory}
        />
      )}

      <div className={isHome ? 'relative z-10 pt-8' : ''}>{body}</div>

      {detailsDeck && (
        <DetailsModal
          deck={detailsDeck}
          onClose={() => setDetailsDeck(null)}
          onPlay={handlePlay}
          onRemove={
            detailsDeck.id.startsWith('user-') ? handleRemove : undefined
          }
          onSearch={(q) => {
            setActiveCategory('home')
            setQuery(q)
          }}
          onCategoryNav={(id) => {
            setQuery('')
            setActiveCategory(id)
          }}
        />
      )}

      {playing && (
        <DeckPlayer
          deck={playing.deck}
          startIndex={playing.startIndex}
          onClose={() => setPlaying(null)}
        />
      )}

      {addOpen && (
        <AddDeckModal onClose={() => setAddOpen(false)} onAdd={handleAdd} />
      )}

      {searchModalOpen && (
        <SearchModal
          onClose={() => setSearchModalOpen(false)}
          query={query}
          onQueryChange={setQuery}
          industries={INDUSTRIES}
          activeIndustry={activeIndustry}
          onIndustryClick={setActiveIndustry}
          allDecks={allDecks}
          totalDecks={MOCK_DECKS.length}
          onPickDeck={(deck) => {
            setSearchModalOpen(false)
            setDetailsDeck(deck)
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

function HomeRows({
  continueWatching,
  userDecks,
  byCategory,
  mostViewed,
  onPlay,
  onDetails,
  onRemove,
  onAddClick,
  onCategoryNav,
}) {
  return (
    <>
      <Row
        title="Company Profiles"
        subtitle="Apple, Tesla, Stripe, OpenAI — full corporate decks."
        decks={byCategory['company-profile']}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('company-profile')}
        onCategoryClick={onCategoryNav}
      />

      {mostViewed && mostViewed.length > 0 && (
        <Row
          title="Most Viewed This Week"
          subtitle="What everyone’s been reading."
          decks={mostViewed}
          onPlay={onPlay}
          onDetails={onDetails}
          onCategoryClick={onCategoryNav}
        />
      )}

      {continueWatching.length > 0 && (
        <Row
          title="Continue watching"
          subtitle="Pick up where you left off"
          decks={continueWatching}
          onPlay={onPlay}
          onDetails={onDetails}
        />
      )}

      <TopTenRow
        title="Top Pitch Decks This Week"
        subtitle="The originals that defined startup fundraising."
        decks={byCategory.iconic}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('iconic')}
        onCategoryClick={onCategoryNav}
      />

      {userDecks.length > 0 && (
        <Row
          title="My Library"
          subtitle="Decks you've uploaded or linked"
          decks={userDecks}
          onPlay={onPlay}
          onDetails={onDetails}
          onRemove={onRemove}
          onTitleClick={() => onCategoryNav('mine')}
        />
      )}

      <Row
        title="Design & Brand"
        subtitle="Methodology, systems, visual thinking."
        decks={byCategory.design}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('design')}
        onCategoryClick={onCategoryNav}
      />
      <Row
        title="Engineering & AI"
        subtitle="From the Transformer paper to the 12-factor app."
        decks={byCategory.engineering}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('engineering')}
        onCategoryClick={onCategoryNav}
      />
      <Row
        title="Startup Strategy"
        subtitle="How to build, scale, and defend."
        decks={byCategory.strategy}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('strategy')}
        onCategoryClick={onCategoryNav}
      />
      <Row
        title="Talks & Keynotes"
        subtitle="Inspiration and frameworks from the masters."
        decks={byCategory.keynotes}
        onPlay={onPlay}
        onDetails={onDetails}
        onTitleClick={() => onCategoryNav('keynotes')}
        onCategoryClick={onCategoryNav}
      />

      <Footer onAddClick={onAddClick} />
    </>
  )
}

function SearchResults({
  decks,
  onPlay,
  onDetails,
  query,
  industryLabel,
  onClearIndustry,
  onClearQuery,
}) {
  return (
    <div className="px-8 md:px-12 pt-28">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-deck-muted">
          {industryLabel && !query ? 'Industry filter' : 'Results for'}
        </div>
        <h2 className="text-3xl font-black mt-1">
          {query ? `"${query}"` : industryLabel}
        </h2>
        <div className="text-sm text-deck-muted mt-1 flex items-center gap-2 flex-wrap">
          <span>{decks.length} matches</span>
          {industryLabel && (
            <>
              <span>·</span>
              <button
                onClick={onClearIndustry}
                className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs"
              >
                Industry: {industryLabel} ×
              </button>
            </>
          )}
          {query && industryLabel && (
            <button
              onClick={onClearQuery}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs"
            >
              Query: "{query}" ×
            </button>
          )}
        </div>
      </div>
      {decks.length === 0 ? (
        <div className="py-20 text-center text-deck-muted">
          No decks match that. Try another query, or add your own deck.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="cursor-pointer"
              onClick={() => onDetails(deck)}
            >
              <div className="aspect-deck rounded-md overflow-hidden ring-1 ring-deck-border card-tilt">
                <Cover deck={deck} sizeClass="text-sm" minimal />
              </div>
              <div className="mt-2 px-0.5">
                <div className="text-sm font-bold leading-snug line-clamp-2">{deck.title}</div>
                <div className="text-xs text-deck-muted mt-0.5 truncate">{deck.author} · {deck.year}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Footer({ onAddClick }) {
  return (
    <div className="px-8 md:px-12 mt-10 text-sm text-deck-muted space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-deck-accent font-black text-lg tracking-tighter">WIT</span>
        <span>— Open decks, beautifully presented.</span>
      </div>
      <p className="max-w-2xl leading-relaxed">
        Browse a curated catalog of legendary public presentation decks, or build your own
        library by uploading PDFs and linking to hosted presentations.{' '}
        <button onClick={onAddClick} className="text-white underline hover:text-deck-accent">
          Add your first deck →
        </button>
      </p>
    </div>
  )
}
