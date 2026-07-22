import { useState, useEffect, useRef } from 'react'
import {
  SearchIcon,
  PlusIcon,
  UserIcon,
  LogoutIcon,
  BookmarkIcon,
  InfoIcon,
  PlayIcon,
} from '../lib/icons.jsx'

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'company-profile', label: 'Companies' },
  { id: 'industries', label: 'Industries' },
  { id: 'iconic', label: 'Pitch Decks' },
  { id: 'design', label: 'Design' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'keynotes', label: 'Keynotes' },
  { id: 'mine', label: 'My Library' },
  { id: 'settings', label: 'Settings' },
]

// Content categories for the sub-lg chip strip. Home/Industries/Library/
// Settings are reachable from the bottom tab bar, so they're omitted here.
const CHIP_ITEMS = NAV_ITEMS.filter((i) =>
  ['company-profile', 'iconic', 'design', 'engineering', 'strategy', 'keynotes'].includes(i.id),
)

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
  const [scrolled, setScrolled] = useState(false)

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
        <ul className="hidden lg:flex items-center justify-center gap-5 xl:gap-6 text-sm whitespace-nowrap">
          {NAV_ITEMS.map((item) => {
            const active = activeCategory === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onCategoryChange(item.id)}
                  className={`relative transition-colors ${
                    active
                      ? 'text-white font-semibold'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-deck-accent" />
                  )}
                </button>
              </li>
            )
          })}
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
          {CHIP_ITEMS.map((item) => {
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
