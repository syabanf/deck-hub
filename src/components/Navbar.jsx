import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  SearchIcon,
  PlusIcon,
  UserIcon,
  LogoutIcon,
  BookmarkIcon,
  InfoIcon,
  PlayIcon,
} from '../lib/icons.jsx'
import { settingNumber, useSettings } from '../lib/settings.jsx'
import { useTaxonomy } from '../lib/taxonomy.jsx'

// Sections of the app, as opposed to categories of deck. These are fixed:
// there is no Master Data entry that could add or remove "Settings".
const LEADING_ITEMS = [{ id: 'home', label: 'Home' }]
const TRAILING_ITEMS = [
  { id: 'industries', label: 'Industries' },
  // Demo Center carries working credentials, so it is not offered to a guest —
  // and the API refuses them anyway, which is what actually enforces it.
  // Marked out from the categories either side of it: it is not a shelf of
  // decks, it hands out credentials, and somebody who does not know it exists
  // will not go looking for it.
  { id: 'demos', label: 'Demo Center', requiresAccount: true, accent: true },
  { id: 'mine', label: 'My Library' },
  // Settings is reached from the account menu, which is where the rest of
  // "things about you and this install" already lives.
]

// The categories themselves come from Master Data. They used to be listed here
// with their own short labels — "Companies" for Company Profiles, "Pitch Decks"
// for Iconic Pitch Decks — which meant a category added in Master Data got no
// link, and one renamed there kept its old name up here.
// How many nav items fit, and where the rest go.
//
// The list is as long as Master Data makes it, and the titles are whatever
// someone typed there — so it will overflow, and it did: seven categories with
// full names ran off the right of the screen and took Settings with them.
//
// Measured rather than capped at a guessed number, because the answer depends
// on both the window width and how long the titles happen to be. Items are
// laid out once at full width, their widths recorded, and everything past what
// fits moves into a "More" menu.
const useOverflow = (items, containerRef) => {
  const [visibleCount, setVisibleCount] = useState(items.length)
  const signature = items.map((i) => i.label).join('\u0000')

  // Natural widths, kept from the render where every category was shown. An
  // item hidden with `hidden` has no box to measure, so without this the count
  // could only ever shrink and never recover when the window widened again.
  const widthsRef = useRef([])

  // Labels changed: the cached widths describe a different list.
  useLayoutEffect(() => {
    widthsRef.current = []
    setVisibleCount(items.length)
  }, [signature, items.length])

  // useLayoutEffect, and no requestAnimationFrame: neither rAF nor a
  // ResizeObserver delivers anything while the document is not being rendered,
  // so opening the app in a background tab left the bar unmeasured. A layout
  // effect runs after the DOM update either way, and getBoundingClientRect
  // forces the layout it needs.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const compute = () => {
      const children = [...el.children]
      const overflowable = children.filter((c) => c.dataset.navItem === 'true')
      if (!overflowable.length) return
      if (visibleCount === items.length) {
        widthsRef.current = overflowable.map((c) => c.getBoundingClientRect().width)
      }
      const widths = widthsRef.current
      if (!widths.length) return

      const gap = parseFloat(getComputedStyle(el).columnGap) || 0
      // Home, Industries, My Library and Settings are sections of the app, not
      // categories. They stay put and their width comes off the budget first —
      // pushing Settings into a menu to make room for a category is the wrong
      // trade, and it is what the first version of this did.
      const fixed = children.filter((c) => c.dataset.navFixed === 'true')
      const fixedWidth = fixed.reduce((sum, c) => sum + c.getBoundingClientRect().width + gap, 0)

      const budget = el.getBoundingClientRect().width - fixedWidth - MORE_WIDTH
      let used = 0
      let n = 0
      for (const w of widths) {
        used += w + (n ? gap : 0)
        if (used > budget) break
        n += 1
      }
      setVisibleCount(n === widths.length ? widths.length : Math.max(0, n))
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [signature, visibleCount, items.length, containerRef])

  return visibleCount
}

// One nav entry. `fixed` marks the app's own sections, which never move into
// the overflow menu and whose width is subtracted from the budget first.
function NavLink({ item, active, onSelect, fixed = false, hidden = false }) {
  // An accented entry is a different kind of thing from the categories around
  // it — a tool rather than a shelf of decks — so it gets a border and a key
  // instead of sitting in the row looking like one more category.
  if (item.accent) {
    return (
      <li
        data-nav-fixed={fixed ? 'true' : undefined}
        data-nav-item={fixed ? undefined : 'true'}
        className={hidden ? 'hidden' : 'shrink-0'}
      >
        <button
          onClick={() => onSelect(item.id)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
            active
              ? 'border-deck-accent/70 bg-deck-accent/15 text-white font-semibold'
              : 'border-white/20 text-white/75 hover:text-white hover:border-white/45'
          }`}
          title="Credentials for the product demos"
        >
          <KeyIcon />
          {item.label}
        </button>
      </li>
    )
  }

  return (
    <li
      data-nav-item={fixed ? undefined : 'true'}
      data-nav-fixed={fixed ? 'true' : undefined}
      className={hidden ? 'hidden' : 'shrink-0'}
    >
      <button
        onClick={() => onSelect(item.id)}
        className={`relative transition-colors block max-w-[13rem] truncate ${
          active ? 'text-white font-semibold' : 'text-white/70 hover:text-white'
        }`}
        title={item.label}
      >
        {item.label}
        {active && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-deck-accent" />
        )}
      </button>
    </li>
  )
}

// Drawn inline rather than pulled from icons.jsx: it is the only place that
// needs it, and it is six lines.
function KeyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2" />
      <path d="m17 6 3 3" />
    </svg>
  )
}

// Enough for "More ▾" plus the gap either side.
const MORE_WIDTH = 86

const useNavItems = () => {
  const { categories } = useTaxonomy()
  const chips = useMemo(
    () => categories.map((c) => ({ id: c.id, label: c.title })),
    [categories],
  )
  return { leading: LEADING_ITEMS, categories: chips, trailing: TRAILING_ITEMS, chips }
}

export default function Navbar({
  user,
  canEdit = false,
  onLogout,
  onAddClick,
  onSearchClick,
  onOpenTour,
  onStartDemo,
  activeCategory,
  onCategoryChange,
}) {
  const { leading, categories: navCategories, trailing: allTrailing, chips: chipItems } = useNavItems()
  const trailing = allTrailing.filter((i) => !i.requiresAccount || (user && !user.guest))
  // Rendered on its own below lg, where the desktop nav is hidden entirely.
  const demoItem = trailing.find((i) => i.accent)
  const navListRef = useRef(null)
  const moreRef = useRef(null)
  // Two limits, and the smaller wins. The measurement stops the bar running
  // off the screen; the setting is the editorial choice about how many belong
  // there at all, which no amount of screen width should override.
  const { settings } = useSettings()
  const measured = useOverflow(navCategories, navListRef)
  const visibleCount = Math.min(measured, settingNumber(settings, 'nav_max_categories', 5))
  const overflowItems = navCategories.slice(visibleCount)
  const [moreOpen, setMoreOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Close the overflow menu on an outside click, the same as the account menu.
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e) => {
      if (!moreRef.current?.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Cmd/Ctrl+K opens search modal globally
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onSearchClick()
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        onSearchClick()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSearchClick])

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-30 transition-colors duration-300 ${
        scrolled || activeCategory !== 'home'
          ? 'bg-deck-bg/95 backdrop-blur shadow-md'
          : 'bg-gradient-to-b from-deck-bg/90 via-deck-bg/40 to-transparent'
      }`}
    >
      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 md:px-10 h-16">
        {/* Left: brand */}
        <button
          onClick={() => onCategoryChange('home')}
          className="flex items-center gap-2 select-none"
        >
          <span className="text-deck-accent font-black text-2xl tracking-tighter">WIT</span>
        </button>

        {/* Center: nav items (only desktop) */}
        <ul
          ref={navListRef}
          className="hidden lg:flex items-center justify-center gap-5 xl:gap-6 text-sm whitespace-nowrap min-w-0"
        >
          {leading.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              fixed
              active={activeCategory === item.id}
              onSelect={onCategoryChange}
            />
          ))}

          {navCategories.map((item, i) => (
            <NavLink
              key={item.id}
              item={item}
              active={activeCategory === item.id}
              onSelect={onCategoryChange}
              // Hidden rather than unmounted: the widths have to stay
              // measurable, or the list could never grow back.
              hidden={i >= visibleCount}
            />
          ))}

          {overflowItems.length > 0 && (
            <li className="relative shrink-0" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={`transition-colors ${
                  overflowItems.some((i) => i.id === activeCategory)
                    ? 'text-white font-semibold'
                    : 'text-white/70 hover:text-white'
                }`}
                aria-expanded={moreOpen}
              >
                More ▾
              </button>
              {moreOpen && (
                <ul className="absolute right-0 top-full mt-3 min-w-[13rem] max-h-[70vh] overflow-y-auto rounded-xl bg-deck-card border border-deck-border shadow-2xl py-1.5 z-50">
                  {overflowItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setMoreOpen(false)
                          onCategoryChange(item.id)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm truncate transition-colors ${
                          activeCategory === item.id
                            ? 'text-white font-semibold bg-white/5'
                            : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                        title={item.label}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}

          {trailing.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              fixed
              active={activeCategory === item.id}
              onSelect={onCategoryChange}
            />
          ))}
        </ul>

        {/* Spacer — below lg, categories live in the chip strip underneath. */}
        <div className="lg:hidden" />

        {/* Right: actions */}
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onSearchClick}
            className="group flex items-center gap-2 h-9 px-3 rounded-full bg-deck-card/70 hover:bg-deck-card border border-deck-border hover:border-white/30 transition-colors"
            aria-label="Open search"
            title="Search (⌘K or /)"
          >
            <SearchIcon size={16} className="text-white/80" />
            <span className="hidden md:inline text-xs text-white/60 group-hover:text-white/90 transition-colors">
              Search
            </span>
            <span className="hidden md:flex items-center gap-0.5 text-[10px] font-bold text-white/40">
              <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/70">⌘</kbd>
              <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/70">K</kbd>
            </span>
          </button>

          {canEdit && (
            <button
              onClick={onAddClick}
              className="group flex items-center gap-1.5 h-9 w-9 sm:w-auto justify-center sm:px-3 rounded-full bg-deck-accent hover:bg-deck-accentDim text-sm font-bold transition-[transform,background-color,box-shadow] duration-200 ease-out whitespace-nowrap shadow-lg shadow-deck-accent/30 hover:shadow-deck-accent/60 hover:-translate-y-px"
              aria-label="Add deck"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/15 group-hover:rotate-90 transition-transform duration-300">
                <PlusIcon size={14} />
              </span>
              <span className="hidden sm:inline">Add deck</span>
            </button>
          )}

          <AccountMenu
            user={user}
            onLogout={onLogout}
            onNavigate={onCategoryChange}
            onOpenTour={onOpenTour}
            onStartDemo={onStartDemo}
          />
        </div>
      </div>

      {/* Below lg the top nav can't fit, so categories become a swipeable chip
          strip. Without this, phones had no way to browse categories at all. */}
      <div className="lg:hidden border-t border-deck-border/60">
        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {/* Demo Center leads the strip on small screens. It is not in the
              bottom tab bar and the desktop nav does not exist here, so
              without this there was no way to reach it from a phone at all. */}
          {demoItem && (
            <button
              onClick={() => onCategoryChange(demoItem.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeCategory === demoItem.id
                  ? 'border-deck-accent/70 bg-deck-accent/20 text-white'
                  : 'border-white/25 text-white/80 active:bg-white/15'
              }`}
            >
              <KeyIcon />
              {demoItem.label}
            </button>
          )}
          {chipItems.map((item) => {
            const active = activeCategory === item.id
            return (
              <button
                key={item.id}
                onClick={() => onCategoryChange(item.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-black'
                    : 'bg-white/8 text-white/75 active:bg-white/20'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

function AccountMenu({ user, onLogout, onNavigate, onOpenTour, onStartDemo }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const isGuest = !!user.guest
  const initial = (user.name || user.email || 'U').trim().charAt(0).toUpperCase()

  const go = (id) => {
    onNavigate(id)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-full bg-deck-card/70 hover:bg-deck-card border border-deck-border hover:border-white/30 transition-colors"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span
          className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
            isGuest ? 'bg-white/15 text-white/80' : 'bg-deck-accent text-white'
          }`}
        >
          {isGuest ? <UserIcon size={15} /> : initial}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          className={`text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl bg-deck-bg/95 backdrop-blur-xl border border-deck-border shadow-2xl shadow-black/60 overflow-hidden animate-scale-in origin-top-right z-50">
          {/* Identity */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-deck-border">
            <span
              className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-black shrink-0 ${
                isGuest ? 'bg-white/15 text-white/80' : 'bg-deck-accent text-white'
              }`}
            >
              {isGuest ? <UserIcon size={18} /> : initial}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{user.name || 'You'}</div>
              <div className="text-xs text-deck-muted truncate">
                {isGuest ? 'Guest session' : user.email}
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <MenuItem icon={<BookmarkIcon size={16} />} label="My Library" onClick={() => go('mine')} />
            <MenuItem icon={<UserIcon size={16} />} label="Settings" onClick={() => go('settings')} />
            <MenuItem
              icon={<InfoIcon size={16} />}
              label="Product tour"
              onClick={() => {
                setOpen(false)
                onOpenTour?.()
              }}
            />
            <MenuItem
              icon={<PlayIcon size={14} />}
              label="How to use — auto demo"
              onClick={() => {
                setOpen(false)
                onStartDemo?.()
              }}
            />
          </div>

          <div className="border-t border-deck-border py-1">
            <MenuItem
              icon={<LogoutIcon size={16} />}
              label="Sign out"
              danger
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
        danger
          ? 'text-rose-300 hover:bg-rose-500/10'
          : 'text-white/80 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className={danger ? 'text-rose-400' : 'text-white/50'}>{icon}</span>
      {label}
    </button>
  )
}
