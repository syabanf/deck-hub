import {
  HomeIcon,
  GridIcon,
  SearchIcon,
  BookmarkIcon,
  UserIcon,
} from '../lib/icons.jsx'

// Bottom tab bar for phones and tablets. Desktop keeps the top nav (lg:hidden).
// This is what makes the installed PWA feel like an app rather than a page —
// primary destinations are always one thumb-tap away.
const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'industries', label: 'Industries', Icon: GridIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'mine', label: 'Library', Icon: BookmarkIcon },
  { id: 'settings', label: 'Settings', Icon: UserIcon },
]

export default function MobileNav({ activeCategory, onCategoryChange, onSearchClick, searching }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-deck-bg/95 backdrop-blur border-t border-deck-border pb-safe"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ id, label, Icon }) => {
          const isSearch = id === 'search'
          const active = isSearch ? searching : activeCategory === id && !searching
          return (
            <li key={id}>
              <button
                onClick={() => (isSearch ? onSearchClick() : onCategoryChange(id))}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                  active ? 'text-white' : 'text-white/50 active:text-white/80'
                }`}
              >
                <span className="relative">
                  <Icon size={20} />
                  {active && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-deck-accent" />
                  )}
                </span>
                <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
