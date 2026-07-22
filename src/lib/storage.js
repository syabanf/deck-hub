const HISTORY_KEY = 'deckflix.history.v1'
const AUTH_KEY = 'deckflix.auth.v2'
const WIZARD_KEY = 'wit.tour.seen.v1'

const safeParse = (raw, fallback) => {
  try {
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// ─────────── Viewing history (client-side) ───────────
// Per-slide resume position powers "Continue watching". The backend tracks a
// global viewCount per deck, but not per-user progress — that stays local.
export const loadHistory = () =>
  safeParse(localStorage.getItem(HISTORY_KEY), {})

export const saveHistory = (history) =>
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))

export const recordView = (deckId, currentSlide, totalSlides) => {
  const history = loadHistory()
  const prev = history[deckId] || {}
  history[deckId] = {
    deckId,
    currentSlide,
    totalSlides,
    viewedAt: Date.now(),
  }
  saveHistory(history)
}

// ─────────── Auth (real JWT from the Go backend) ───────────
// Stores the signed-in user plus their JWT token (guests have no token).
// The api client reads loadAuth()?.token to authorize requests.
export const loadAuth = () => safeParse(localStorage.getItem(AUTH_KEY), null)

export const saveAuth = (auth) =>
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))

export const clearAuth = () => localStorage.removeItem(AUTH_KEY)

// ─────────── Onboarding wizard ───────────
// Whether the product tour has been dismissed/completed on this device.
export const hasSeenTour = () => localStorage.getItem(WIZARD_KEY) === '1'
export const markTourSeen = () => localStorage.setItem(WIZARD_KEY, '1')

// ─────────── Role / status vocab (shared with Settings UI) ───────────
export const ROLES = ['admin', 'editor', 'viewer']
export const USER_STATUSES = ['active', 'invited', 'suspended']
