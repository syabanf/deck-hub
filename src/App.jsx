import { useEffect, useMemo, useState, useCallback } from 'react'
import { CATEGORIES, INDUSTRIES } from './data/decks.js'
import {
  api,
  normalizeDecks,
  normalizeDeck,
  normalizeUsers,
  normalizeUser,
  toCreateRequest,
} from './lib/api.js'
import { loadHistory, loadAuth, saveAuth, clearAuth } from './lib/storage.js'
import { withViewTransition } from './lib/viewTransition.js'
import Navbar from './components/Navbar.jsx'
import MobileNav from './components/MobileNav.jsx'
import Hero from './components/Hero.jsx'
import Row from './components/Row.jsx'
import TopTenRow from './components/TopTenRow.jsx'
import CategoryView from './components/CategoryView.jsx'
import DetailsModal from './components/DetailsModal.jsx'
import DeckPlayer from './components/DeckPlayer.jsx'
import AddDeckModal from './components/AddDeckModal.jsx'
import Cover from './components/Cover.jsx'
import DeckFilters, { useDeckFilters } from './components/DeckFilters.jsx'
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
  const [decks, setDecks] = useState([])
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(() => loadHistory())
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('home')
  const [detailsDeck, setDetailsDeck] = useState(null)
  const [playing, setPlaying] = useState(null) // { deck, startIndex }
  const [addOpen, setAddOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeIndustry, setActiveIndustry] = useState(null)

  const canEdit = !!user && !user.guest && (user.role === 'admin' || user.role === 'editor')
  const isAdmin = !!user && !user.guest && user.role === 'admin'

  // Load the catalog + team directory from the backend once signed in.
  const loadData = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [deckList, userList] = await Promise.all([api.listDecks(), api.listUsers()])
      setDecks(normalizeDecks(deckList))
      setUsers(normalizeUsers(userList))
      setStatus('ready')
    } catch (e) {
      setError(e)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  useEffect(() => {
    if (!playing) setHistory(loadHistory())
  }, [playing])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeCategory])

  const featuredDeck = useMemo(() => decks.find((d) => d.featured) || decks[0], [decks])

  const continueWatching = useMemo(() => {
    const entries = Object.values(history)
      .filter((h) => h.currentSlide > 0 && h.currentSlide < (h.totalSlides || 1) - 1)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, 10)
    return entries.map((h) => decks.find((d) => d.id === h.deckId)).filter(Boolean)
  }, [history, decks])

  const byCategory = useMemo(() => {
    const map = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]))
    for (const d of decks) {
      if (map[d.category]) map[d.category].push(d)
    }
    return map
  }, [decks])

  const mostViewed = useMemo(
    () => [...decks].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 10),
    [decks],
  )

  const myLibrary = useMemo(() => decks.filter((d) => d.category === 'mine'), [decks])

  // ─────────── Sign-in gate ───────────
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

  if (status === 'loading') return <LoadingScreen />
  if (status === 'error') return <ErrorScreen error={error} onRetry={loadData} />

  const handleLogout = () => {
    clearAuth()
    setUser(null)
    setActiveCategory('home')
    setQuery('')
    setActiveIndustry(null)
  }

  const filtered = (list) =>
    list.filter((d) => {
      if (!matchesQuery(d, query)) return false
      if (activeIndustry && d.industry !== activeIndustry) return false
      return true
    })

  const handlePlay = (deck, startIndex = 0) => {
    setDetailsDeck(null)
    setPlaying({ deck, startIndex })
    // Bump the backend view counter (fire-and-forget) and reflect it locally.
    api
      .incrementViews(deck.id)
      .then((updated) => {
        if (updated) {
          setDecks((prev) =>
            prev.map((d) => (d.id === updated.id ? { ...d, viewCount: updated.viewCount } : d)),
          )
        }
      })
      .catch(() => {})
  }

  const handleDetails = (deck) => setDetailsDeck(deck)

  const handleAdd = async (deck) => {
    setAddOpen(false)
    try {
      const created = await api.createDeck(toCreateRequest(deck))
      const nd = normalizeDeck(created)
      setDecks((prev) => [nd, ...prev])
      setToast({
        title: 'Added to the catalog',
        message: `"${nd.title}" is live for everyone.`,
        actionLabel: 'Open',
        onAction: () => handlePlay(nd),
      })
    } catch (e) {
      setToast({ title: "Couldn't save deck", message: e.message })
    }
  }

  const handleRemove = async (deck) => {
    if (!canEdit) return
    if (!confirm(`Remove "${deck.title}" from the catalog? This can't be undone.`)) return
    try {
      await api.deleteDeck(deck.id)
      setDecks((prev) => prev.filter((d) => d.id !== deck.id))
      setToast({ title: 'Deck removed', message: `"${deck.title}" is gone.` })
    } catch (e) {
      setToast({ title: "Couldn't remove deck", message: e.message })
    }
  }

  const handleAddUser = async (draft) => {
    try {
      const created = await api.createUser(draft)
      setUsers((prev) => [normalizeUser(created), ...prev])
      setToast({ title: 'User added', message: `${created.name} can now access WIT.` })
    } catch (e) {
      setToast({ title: "Couldn't add user", message: e.message })
    }
  }
  const handleUpdateUser = async (id, patch) => {
    try {
      const updated = await api.updateUser(id, patch)
      setUsers((prev) => prev.map((u) => (u.id === id ? normalizeUser(updated) : u)))
    } catch (e) {
      setToast({ title: "Couldn't update user", message: e.message })
    }
  }
  const handleRemoveUser = async (id) => {
    try {
      await api.deleteUser(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (e) {
      setToast({ title: "Couldn't remove user", message: e.message })
    }
  }

  // Every navigation goes through the View Transitions cross-fade.
  const goTo = (update) => withViewTransition(update)

  const isSearching = !!query.trim() || !!activeIndustry
  const isHome = activeCategory === 'home' && !isSearching
  const isSettings = activeCategory === 'settings'
  const isIndustries = activeCategory === 'industries' && !isSearching
  const showCategory = !isHome && !isSearching && !isSettings && !isIndustries

  let body
  if (isSearching) {
    const industryLabel = activeIndustry
      ? INDUSTRIES.find((i) => i.id === activeIndustry)?.title
      : null
    body = (
      <SearchResults
        decks={filtered(decks)}
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
      <IndustriesPage decks={decks} onPickIndustry={(id) => goTo(() => setActiveIndustry(id))} />
    )
  } else if (isSettings) {
    body = (
      <SettingsPage
        users={users}
        currentEmail={user?.email}
        canManageUsers={isAdmin}
        onAddUser={handleAddUser}
        onUpdateUser={handleUpdateUser}
        onRemoveUser={handleRemoveUser}
        manageProps={{
          decks,
          canEdit,
          onAddClick: () => setAddOpen(true),
          onPlay: handlePlay,
          onDetails: handleDetails,
          onRemove: canEdit ? handleRemove : undefined,
        }}
      />
    )
  } else if (showCategory) {
    const catDecks = activeCategory === 'mine' ? myLibrary : byCategory[activeCategory] || []
    body = (
      <CategoryView
        categoryId={activeCategory}
        decks={catDecks}
        onPlay={handlePlay}
        onDetails={handleDetails}
        onRemove={canEdit ? handleRemove : undefined}
        onAddClick={() => setAddOpen(true)}
        onCategoryClick={(id) => goTo(() => setActiveCategory(id))}
        canEdit={canEdit}
      />
    )
  } else {
    body = (
      <HomeRows
        continueWatching={continueWatching}
        myLibrary={myLibrary}
        byCategory={byCategory}
        mostViewed={mostViewed}
        onPlay={handlePlay}
        onDetails={handleDetails}
        onRemove={canEdit ? handleRemove : undefined}
        onAddClick={() => setAddOpen(true)}
        onCategoryNav={(id) => goTo(() => setActiveCategory(id))}
        canEdit={canEdit}
      />
    )
  }

  return (
    <div className="min-h-screen text-white pb-mobile-nav lg:pb-20">
      <Navbar
        user={user}
        canEdit={canEdit}
        onLogout={handleLogout}
        onAddClick={() => setAddOpen(true)}
        onSearchClick={() => setSearchModalOpen(true)}
        activeCategory={activeCategory}
        onCategoryChange={(id) => goTo(() => {
          setActiveCategory(id)
          if (query) setQuery('')
        })}
      />

      {/* Named region for the View Transitions cross-fade — the navbar sits
          outside it so it stays anchored while the content swaps. */}
      <div className="view-content">
        {isHome && featuredDeck && (
          <Hero
            deck={featuredDeck}
            onPlay={handlePlay}
            onDetails={handleDetails}
            onCategoryNav={(id) => goTo(() => setActiveCategory(id))}
          />
        )}

        <div className={isHome ? 'relative z-10 pt-8' : ''}>{body}</div>
      </div>

      {detailsDeck && (
        <DetailsModal
          deck={detailsDeck}
          onClose={() => setDetailsDeck(null)}
          onPlay={handlePlay}
          onRemove={canEdit ? handleRemove : undefined}
          onSearch={(q) => {
            setActiveCategory('home')
            setQuery(q)
          }}
          onCategoryNav={(id) => goTo(() => {
            setQuery('')
            setActiveCategory(id)
          })}
        />
      )}

      {playing && (
        <DeckPlayer
          deck={playing.deck}
          startIndex={playing.startIndex}
          onClose={() => setPlaying(null)}
        />
      )}

      {addOpen && <AddDeckModal onClose={() => setAddOpen(false)} onAdd={handleAdd} />}

      {searchModalOpen && (
        <SearchModal
          onClose={() => setSearchModalOpen(false)}
          query={query}
          onQueryChange={setQuery}
          industries={INDUSTRIES}
          activeIndustry={activeIndustry}
          onIndustryClick={setActiveIndustry}
          allDecks={decks}
          totalDecks={decks.length}
          onPickDeck={(deck) => {
            setSearchModalOpen(false)
            setDetailsDeck(deck)
          }}
        />
      )}

      <MobileNav
        activeCategory={activeCategory}
        searching={isSearching}
        onSearchClick={() => setSearchModalOpen(true)}
        onCategoryChange={(id) => goTo(() => {
          setActiveCategory(id)
          setQuery('')
          setActiveIndustry(null)
        })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white">
      <span className="text-deck-accent font-black text-4xl tracking-tighter animate-glow-pulse">
        WIT
      </span>
      <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span className="text-deck-muted text-sm">Loading the catalog…</span>
    </div>
  )
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span className="text-deck-accent font-black text-3xl tracking-tighter">WIT</span>
      <h1 className="text-2xl font-black">Can't reach the WIT server</h1>
      <p className="text-deck-muted max-w-md text-sm">
        {error?.message || 'The backend is unavailable.'} Start the Go API
        (<code className="text-white/80">make run</code> in <code className="text-white/80">backend/</code>),
        then retry.
      </p>
      <button
        onClick={onRetry}
        className="mt-2 px-5 py-2.5 rounded-lg bg-deck-accent hover:bg-deck-accentDim font-bold text-sm"
      >
        Retry
      </button>
    </div>
  )
}

function HomeRows({
  continueWatching,
  myLibrary,
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
        subtitle="Apple, Tesla, Stripe, Notion — full corporate decks."
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

      {myLibrary.length > 0 && (
        <Row
          title="My Library"
          subtitle="Decks added to the catalog"
          decks={myLibrary}
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
  // Industry is owned by the page (chip above), so it's hidden here.
  const { filtered, controls } = useDeckFilters(decks)

  return (
    <div className="px-8 md:px-12 pt-32 lg:pt-28">
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
        <>
        <DeckFilters {...controls} hide={['industry']} />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filtered.map((deck) => (
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
        </>
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
        Browse a curated catalog of legendary public presentation decks, or contribute your own
        by uploading PDFs and linking to hosted presentations.{' '}
        <button onClick={onAddClick} className="text-white underline hover:text-deck-accent">
          Add a deck →
        </button>
      </p>
    </div>
  )
}
