import { useEffect, useMemo, useState, useCallback } from 'react'
import { CATEGORIES, INDUSTRIES } from './data/decks.js'
import {
  api,
  normalizeDecks,
  normalizeDeck,
  normalizeUsers,
  normalizeUser,
  toCreateRequest,
  toUpdateRequest,
  setAuthFailureHandler,
} from './lib/api.js'
import { errorToast, humanizeError, isSessionExpired } from './lib/errors.js'
import { useOnline } from './lib/useOnline.js'
import { loadHistory, loadAuth, saveAuth, clearAuth, hasSeenTour, markTourSeen } from './lib/storage.js'
import { loadLocalFavorites, saveLocalFavorites } from './lib/favorites.js'
import { FavoritesProvider } from './lib/favoritesContext.jsx'
import { withViewTransition } from './lib/viewTransition.js'
import { useSwipe } from './lib/useSwipe.js'
import Navbar from './components/Navbar.jsx'
import MobileNav from './components/MobileNav.jsx'
import Hero from './components/Hero.jsx'
import Row from './components/Row.jsx'
import TopTenRow from './components/TopTenRow.jsx'
import CategoryView from './components/CategoryView.jsx'
import DetailsModal from './components/DetailsModal.jsx'
import DeckPlayer from './components/DeckPlayer.jsx'
import AddDeckModal from './components/AddDeckModal.jsx'
import EditDeckModal from './components/EditDeckModal.jsx'
import Cover from './components/Cover.jsx'
import DeckFilters, { useDeckFilters } from './components/DeckFilters.jsx'
import Toast from './components/Toast.jsx'
import SearchModal from './components/SearchModal.jsx'
import IndustriesPage from './components/IndustriesPage.jsx'
import OfflineBanner from './components/OfflineBanner.jsx'
import LoginPage from './components/LoginPage.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import DemoWizard from './components/DemoWizard.jsx'
import AutoDemo from './components/AutoDemo.jsx'

// Left/right order for swiping between browse sections on touch devices.
// Settings is intentionally excluded — it's reached by tap, not by swiping.
const SWIPE_SECTIONS = [
  'home',
  'company-profile',
  'industries',
  'iconic',
  'design',
  'engineering',
  'strategy',
  'keynotes',
  'mine',
]

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
  // The deck currently open in the editor, plus its in-flight save state.
  const [editingDeck, setEditingDeck] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeIndustry, setActiveIndustry] = useState(null)
  const [tourOpen, setTourOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  // Survives the sign-out that unmounts the whole signed-in tree (toast included),
  // so the login screen can explain why the person is suddenly back here.
  const [signedOutReason, setSignedOutReason] = useState(null)
  // Ordered newest-first; the source of truth for "My Library".
  const [favoriteIds, setFavoriteIds] = useState(() => loadLocalFavorites())

  const canEdit = !!user && !user.guest && (user.role === 'admin' || user.role === 'editor')
  const isAdmin = !!user && !user.guest && user.role === 'admin'
  // Signed-in users persist favorites to the backend; guests use localStorage.
  const favBackend = !!user && !!user.token
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const online = useOnline()

  // The JWT lasts 24h, so a tab left open overnight wakes up holding a dead
  // token: the UI still looks signed in while every action fails. Catch the
  // first 401 centrally, sign out, and say why — instead of letting the person
  // retry into an error again and again.
  useEffect(() => {
    setAuthFailureHandler(() => {
      clearAuth()
      setUser(null)
      // A toast is no good here: setUser(null) swaps the whole tree for the
      // login screen, taking the toast with it. Hand the reason to LoginPage.
      setSignedOutReason(humanizeError({ code: 'unauthorized', status: 401 }))
    })
    return () => setAuthFailureHandler(null)
  }, [])

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

  // Show the product tour once, the first time someone lands inside the app.
  useEffect(() => {
    if (user && status === 'ready' && !hasSeenTour()) setTourOpen(true)
  }, [user, status])

  const closeTour = useCallback(() => {
    setTourOpen(false)
    markTourSeen()
  }, [])

  // Swipe left/right to step between browse sections. The `ignore` selector
  // means a swipe that starts on a row carousel scrolls the row instead.
  const navigateSection = (dir) => {
    if (query.trim() || activeIndustry) return // not while searching/filtering
    const i = SWIPE_SECTIONS.indexOf(activeCategory)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= SWIPE_SECTIONS.length) return
    withViewTransition(() => {
      setActiveCategory(SWIPE_SECTIONS[j])
      setQuery('')
    })
  }
  const contentRef = useSwipe({
    onLeft: () => navigateSection(1),
    onRight: () => navigateSection(-1),
    ignore: '.scroll-snap-x, input, textarea, select, [data-no-swipe]',
  })

  // Pull the signed-in user's favorites from the backend; guests keep whatever
  // is in localStorage.
  useEffect(() => {
    if (!favBackend) return
    let cancelled = false
    api
      .listFavorites()
      .then((res) => {
        if (!cancelled) setFavoriteIds(res?.deckIds || [])
      })
      .catch(() => {}) // non-fatal; favorites just stay empty
    return () => {
      cancelled = true
    }
  }, [favBackend, user])

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

  // "My Library" is now the user's favorites, kept in favorite order.
  const myLibrary = useMemo(() => {
    const byId = new Map(decks.map((d) => [d.id, d]))
    return favoriteIds.map((id) => byId.get(id)).filter(Boolean)
  }, [decks, favoriteIds])

  // ─────────── Sign-in gate ───────────
  if (!user) {
    return (
      <LoginPage
        notice={signedOutReason}
        onLogin={(profile) => {
          saveAuth(profile)
          setSignedOutReason(null)
          setUser(profile)
        }}
      />
    )
  }

  if (status === 'loading') return <LoadingScreen />
  if (status === 'error')
    return (
      <ErrorScreen
        error={error}
        onRetry={loadData}
        onSignOut={() => {
          clearAuth()
          setUser(null)
        }}
      />
    )

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

  // Toggle a deck in "My Library". Optimistic, with a revert on API failure;
  // guests persist to localStorage instead of the backend.
  const toggleFavorite = (deck) => {
    const id = deck.id
    const wasFav = favSet.has(id)
    const prev = favoriteIds
    const next = wasFav ? favoriteIds.filter((x) => x !== id) : [id, ...favoriteIds]
    setFavoriteIds(next)

    if (favBackend) {
      const call = wasFav ? api.removeFavorite(id) : api.addFavorite(id)
      call.catch((e) => {
        setFavoriteIds(prev) // revert
        setToast(errorToast(e, { action: 'update My Library' }))
      })
    } else {
      saveLocalFavorites(next)
    }
  }

  const handleAdd = async (deck) => {
    setAddOpen(false)
    try {
      const created = await api.createDeck(toCreateRequest(deck))
      const nd = normalizeDeck(created)
      setDecks((prev) => [nd, ...prev])
      // Your own uploads go straight into My Library so they're easy to find.
      if (!favSet.has(nd.id)) toggleFavorite(nd)
      setToast({
        title: 'Added to the catalog',
        message: `"${nd.title}" is live and saved to My Library.`,
        actionLabel: 'Open',
        onAction: () => handlePlay(nd),
      })
    } catch (e) {
      setToast(errorToast(e, { action: 'save this deck' }))
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
      setToast(errorToast(e, { action: 'remove this deck' }))
    }
  }

  // Apply a partial edit. `patch` only carries fields the admin actually
  // changed, so untouched columns keep whatever the server has — see
  // toUpdateRequest.
  const handleSaveDeck = async (id, patch) => {
    setEditSaving(true)
    setEditError(null)
    try {
      const updated = await api.updateDeck(id, toUpdateRequest(patch))
      const nd = normalizeDeck(updated)
      setDecks((prev) => prev.map((d) => (d.id === nd.id ? nd : d)))
      // Keep an open details panel in sync rather than showing stale fields.
      setDetailsDeck((cur) => (cur && cur.id === nd.id ? nd : cur))
      setEditingDeck(null)
      setToast({ title: 'Deck updated', message: `"${nd.title}" is saved.` })
    } catch (e) {
      // Stay open with the error inline — closing would discard their edits.
      setEditError(humanizeError(e, { action: 'save those changes' }).message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleAddUser = async (draft) => {
    try {
      const created = await api.createUser(draft)
      setUsers((prev) => [normalizeUser(created), ...prev])
      setToast({ title: 'User added', message: `${created.name} can now access WIT.` })
    } catch (e) {
      setToast(errorToast(e, { action: 'add that person' }))
    }
  }
  const handleUpdateUser = async (id, patch) => {
    try {
      const updated = await api.updateUser(id, patch)
      setUsers((prev) => prev.map((u) => (u.id === id ? normalizeUser(updated) : u)))
    } catch (e) {
      setToast(errorToast(e, { action: 'update that person' }))
    }
  }
  const handleRemoveUser = async (id) => {
    try {
      await api.deleteUser(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (e) {
      setToast(errorToast(e, { action: 'remove that person' }))
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
          onEdit: canEdit ? (deck) => { setEditError(null); setEditingDeck(deck) } : undefined,
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
    <FavoritesProvider value={{ favSet, toggle: toggleFavorite }}>
    <div className="min-h-screen text-white pb-mobile-nav lg:pb-20">
      <Navbar
        user={user}
        canEdit={canEdit}
        onLogout={handleLogout}
        onAddClick={() => setAddOpen(true)}
        onSearchClick={() => setSearchModalOpen(true)}
        onOpenTour={() => setTourOpen(true)}
        onStartDemo={() => setDemoOpen(true)}
        activeCategory={activeCategory}
        onCategoryChange={(id) => goTo(() => {
          setActiveCategory(id)
          if (query) setQuery('')
        })}
      />

      {/* Named region for the View Transitions cross-fade — the navbar sits
          outside it so it stays anchored while the content swaps. Also the
          swipe surface for moving between sections on touch. */}
      <div className="view-content" ref={contentRef}>
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
          isFavorite={favSet.has(detailsDeck.id)}
          onToggleFavorite={() => toggleFavorite(detailsDeck)}
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
          // Siblings from the same category, so "next deck" stays contextual
          // rather than jumping across the whole catalog.
          playlist={decks.filter((d) => d.category === playing.deck.category)}
          onSelectDeck={(d) => handlePlay(d)}
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

      {tourOpen && (
        <DemoWizard
          onClose={closeTour}
          onStartDemo={() => {
            closeTour()
            setDemoOpen(true)
          }}
        />
      )}

      {/* Self-driving "how to use" tour — clicks through the app itself. */}
      {demoOpen && <AutoDemo onExit={() => setDemoOpen(false)} />}

      {editingDeck && (
        <EditDeckModal
          deck={editingDeck}
          saving={editSaving}
          error={editError}
          onSave={handleSaveDeck}
          onClose={() => setEditingDeck(null)}
        />
      )}
      <OfflineBanner online={online} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
    </FavoritesProvider>
  )
}

function LoadingScreen() {
  // A spinner that never changes reads as "frozen" after a few seconds. Saying
  // it's slow — and that we're still trying — is the difference between waiting
  // and giving up.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-white px-6 text-center">
      <span className="text-deck-accent font-black text-4xl tracking-tighter animate-glow-pulse">
        WIT
      </span>
      <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span className="text-deck-muted text-sm">Loading the catalog…</span>
      {slow && (
        <span className="text-white/40 text-xs max-w-xs leading-relaxed animate-fade-in">
          This is taking longer than usual — still trying. A slow connection can do this.
        </span>
      )}
    </div>
  )
}

function ErrorScreen({ error, onRetry, onSignOut }) {
  const { title, message } = humanizeError(error, { action: 'load your catalog' })
  const expired = isSessionExpired(error)
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span className="text-deck-accent font-black text-3xl tracking-tighter">WIT</span>
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      <p className="text-deck-muted max-w-md text-sm leading-relaxed">{message}</p>

      <div className="flex items-center gap-2 mt-2">
        {expired ? (
          <button
            onClick={onSignOut}
            className="px-5 py-2.5 rounded-lg bg-deck-accent hover:bg-deck-accentDim font-bold text-sm transition-colors"
          >
            Sign in again
          </button>
        ) : (
          <button
            onClick={retry}
            disabled={retrying}
            className="px-5 py-2.5 rounded-lg bg-deck-accent hover:bg-deck-accentDim font-bold text-sm disabled:opacity-60 transition-colors"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        )}
      </div>

      {/* Only developers can act on this, so only they see it. */}
      {import.meta.env.DEV && error?.code === 'network' && (
        <p className="text-xs text-white/35 mt-3">
          Dev hint: start the Go API with <code className="text-white/60">make run</code> in{' '}
          <code className="text-white/60">backend/</code>.
        </p>
      )}
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
          subtitle="Decks you've saved"
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
