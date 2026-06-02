const USER_DECKS_KEY = 'deckflix.userDecks.v1'
const HISTORY_KEY = 'deckflix.history.v1'
const AUTH_KEY = 'deckflix.auth.v1'
const USERS_KEY = 'deckflix.users.v1'

const safeParse = (raw, fallback) => {
  try {
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export const loadUserDecks = () =>
  safeParse(localStorage.getItem(USER_DECKS_KEY), [])

export const saveUserDecks = (decks) =>
  localStorage.setItem(USER_DECKS_KEY, JSON.stringify(decks))

export const loadHistory = () =>
  safeParse(localStorage.getItem(HISTORY_KEY), {})

export const saveHistory = (history) =>
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))

export const recordView = (deckId, currentSlide, totalSlides) => {
  const history = loadHistory()
  const prev = history[deckId] || {}
  // Count a "view" the first time someone lands on slide 0 in this session OR after a long gap.
  const lastViewed = prev.viewedAt || 0
  const freshSession = Date.now() - lastViewed > 2 * 60 * 60 * 1000 // 2 hours
  const shouldCount = currentSlide === 0 && freshSession
  history[deckId] = {
    deckId,
    currentSlide,
    totalSlides,
    viewedAt: Date.now(),
    viewCount: (prev.viewCount || 0) + (shouldCount ? 1 : 0),
  }
  saveHistory(history)
}

// Synthetic baseline views so a fresh visitor still sees a populated Most Viewed row.
// Keyed by deck id; we always merge in MAX(synthetic, real).
const SYNTH_VIEWS = {
  'mock-1': 412, 'mock-2': 280, 'mock-3': 195, 'mock-4': 350, 'mock-5': 230,
  'mock-6': 175, 'mock-7': 140, 'mock-8': 95, 'mock-9': 88, 'mock-10': 76,
  'mock-11': 312, 'mock-12': 245,
  'mock-13': 180, 'mock-14': 160,
}

export const getEffectiveViews = (deckId) => {
  const history = loadHistory()
  const real = history[deckId]?.viewCount || 0
  const synth = SYNTH_VIEWS[deckId] || 0
  return Math.max(real, synth)
}

// ─────────── Auth (client-side mock) ───────────
// No backend: this just persists a signed-in profile in localStorage so the
// app can gate access and personalize the navbar. Any credentials are accepted.
export const loadAuth = () => safeParse(localStorage.getItem(AUTH_KEY), null)

export const saveAuth = (user) =>
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))

export const clearAuth = () => localStorage.removeItem(AUTH_KEY)

// ─────────── Users (client-side master data) ───────────
// Seeded team directory. In production this comes from the Go/Postgres backend
// (GET /users); here it's persisted locally so the Settings page is functional.
export const ROLES = ['admin', 'editor', 'viewer']
export const USER_STATUSES = ['active', 'invited', 'suspended']

const DEFAULT_USERS = [
  { id: 'usr-1', name: 'Ada Lovelace', email: 'ada@wit.id', role: 'admin', status: 'active', createdAt: '2025-11-02' },
  { id: 'usr-2', name: 'Alan Turing', email: 'alan@wit.id', role: 'editor', status: 'active', createdAt: '2025-12-14' },
  { id: 'usr-3', name: 'Grace Hopper', email: 'grace@wit.id', role: 'editor', status: 'active', createdAt: '2026-01-08' },
  { id: 'usr-4', name: 'Linus Torvalds', email: 'linus@wit.id', role: 'viewer', status: 'invited', createdAt: '2026-02-20' },
  { id: 'usr-5', name: 'Margaret Hamilton', email: 'margaret@wit.id', role: 'admin', status: 'active', createdAt: '2026-03-01' },
  { id: 'usr-6', name: 'Katherine Johnson', email: 'katherine@wit.id', role: 'viewer', status: 'suspended', createdAt: '2026-03-30' },
]

export const loadUsers = () => {
  const stored = safeParse(localStorage.getItem(USERS_KEY), null)
  return Array.isArray(stored) ? stored : DEFAULT_USERS
}

export const saveUsers = (users) =>
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
