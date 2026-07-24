// All local state is namespaced `wit.` — the product's one name. Two keys
// predate that and used a `deckflix.` prefix from an earlier iteration.
const HISTORY_KEY = 'wit.history.v1'
const AUTH_KEY = 'wit.auth.v2'
const WIZARD_KEY = 'wit.tour.seen.v1'

// Renaming a storage key silently signs everyone out and drops their
// continue-watching list, because the old value is still there under the old
// name and nothing reads it. This copies each one across on first load and
// removes the original, so the rename is invisible to anyone already signed in.
const LEGACY_KEYS = [
  ['deckflix.history.v1', HISTORY_KEY],
  ['deckflix.auth.v2', AUTH_KEY],
]

try {
  for (const [oldKey, newKey] of LEGACY_KEYS) {
    const legacy = localStorage.getItem(oldKey)
    if (legacy === null) continue
    // Never clobber a newer value that already exists under the new name.
    if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, legacy)
    localStorage.removeItem(oldKey)
  }
} catch {
  // Private-browsing modes can throw on localStorage access. A failed
  // migration just means signing in again — not worth breaking startup over.
}

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
