// API client for the WIT Go/Postgres backend.
//
// Backend-primary: the catalog, users, and view counts all come from here.
// This module owns the fetch wrapper, the typed endpoints, and the mapping
// between the backend deck shape ({source:{type,value}, viewCount, …}) and the
// richer shape the React UI renders (gradient, pattern, embeddable source, …).

import { loadAuth } from './storage.js'
import { detectVideo } from './video.js'

const BASE = import.meta.env?.VITE_API_URL || 'http://localhost:8080'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

// A request that never returns is worse than one that fails: the UI sits on a
// spinner forever. Cap every call so a hung server still produces an error the
// user can act on.
const TIMEOUT_MS = 15_000
const UPLOAD_TIMEOUT_MS = 120_000 // 25 MB over a slow uplink needs real headroom

// Lets the app react to an expired session once, centrally, instead of every
// caller having to recognise a 401.
let onAuthFailure = null
export const setAuthFailureHandler = (fn) => {
  onAuthFailure = fn
}

// fetch that turns "hung" into a real, catchable error.
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    // An abort here is always ours — nothing else cancels these requests.
    if (err?.name === 'AbortError') {
      throw new ApiError('timeout', 'The server took too long to respond.')
    }
    throw new ApiError(
      'network',
      `Can't reach the WIT server at ${BASE}. Make sure the API is running.`,
    )
  } finally {
    clearTimeout(timer)
  }
}

// Worth retrying: the request never landed, or the server had a bad moment.
// A 4xx is a considered "no" — retrying just fails again more slowly.
const transient = (err) =>
  err?.code === 'network' || err?.code === 'timeout' || (err?.status >= 500 && err?.status < 600)

async function request(path, { method = 'GET', body, auth = false, retries } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = loadAuth()?.token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  // Only GETs retry by default. Replaying a POST could create the same deck
  // twice — a silent duplicate is worse than a visible error.
  const attempts = (retries ?? (method === 'GET' ? 2 : 0)) + 1

  let lastErr
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // Brief backoff: 300ms, then 900ms. Long enough for a restarting API to
      // come back, short enough that nobody thinks the app has frozen.
      await new Promise((r) => setTimeout(r, 300 * 3 ** (attempt - 1)))
    }

    try {
      const res = await fetchWithTimeout(
        `${BASE}${path}`,
        {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        TIMEOUT_MS,
      )

      if (res.status === 204) return null

      const text = await res.text()
      let data = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
      }

      if (!res.ok) {
        const code = data?.error?.code || 'error'
        const message = data?.error?.message || `Request failed (${res.status}).`
        const err = new ApiError(code, message, res.status)

        // An authenticated call rejected as 401 means the JWT lapsed. Tell the
        // app once so it can sign out cleanly; a failed login is the caller's
        // business, not a session expiry.
        if (res.status === 401 && auth) onAuthFailure?.(err)

        if (transient(err) && attempt < attempts - 1) {
          lastErr = err
          continue
        }
        throw err
      }
      return data
    } catch (err) {
      if (transient(err) && attempt < attempts - 1) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// Uploaded files come back as a server-relative path ("/uploads/<name>"); the
// browser needs it absolute against the API origin.
export const absoluteUrl = (p) => {
  if (!p) return p
  if (/^(https?:|data:|blob:)/i.test(p)) return p
  return `${BASE}${p.startsWith('/') ? '' : '/'}${p}`
}

// uploadFile POSTs a File to /uploads (multipart). Content-Type is left unset
// so the browser supplies the multipart boundary.
export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)

  const headers = {}
  const token = loadAuth()?.token
  if (token) headers.Authorization = `Bearer ${token}`

  // No retry: re-sending a large file after a failure wastes the user's data
  // and the server rejects duplicates anyway.
  const res = await fetchWithTimeout(
    `${BASE}/uploads`,
    { method: 'POST', headers, body: form },
    UPLOAD_TIMEOUT_MS,
  )

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const err = new ApiError(
      data?.error?.code || 'error',
      data?.error?.message || `Upload failed (${res.status}).`,
      res.status,
    )
    if (res.status === 401) onAuthFailure?.(err)
    throw err
  }
  // `path` is what gets persisted on the deck (origin-independent); `url` is
  // the absolute form for immediate use in the browser.
  return { ...data, path: data.url, url: absoluteUrl(data.url) }
}

// ─────────────── Endpoints ───────────────

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),

  listDecks: () => request('/decks'),
  createDeck: (deck) => request('/decks', { method: 'POST', body: deck, auth: true }),
  updateDeck: (id, patch) => request(`/decks/${id}`, { method: 'PUT', body: patch, auth: true }),
  deleteDeck: (id) => request(`/decks/${id}`, { method: 'DELETE', auth: true }),
  incrementViews: (id) => request(`/decks/${id}/views`, { method: 'POST' }),

  listUsers: () => request('/users'),
  createUser: (user) => request('/users', { method: 'POST', body: user, auth: true }),
  updateUser: (id, patch) => request(`/users/${id}`, { method: 'PUT', body: patch, auth: true }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE', auth: true }),

  // Favorites ("My Library") — always scoped to the signed-in user.
  listFavorites: () => request('/favorites', { auth: true }),
  addFavorite: (deckId) => request(`/favorites/${deckId}`, { method: 'PUT', auth: true }),
  removeFavorite: (deckId) => request(`/favorites/${deckId}`, { method: 'DELETE', auth: true }),
}

// ─────────────── Deck shape mapping ───────────────

// Deterministic cover styling so backend decks (which store no gradient/pattern)
// still render as designed, and the same deck always looks the same.
const GRADIENTS = [
  { from: '#ff5f6d', to: '#ffc371', text: '#1a0d00' },
  { from: '#2b5876', to: '#4e4376', text: '#ffffff' },
  { from: '#0f9b8e', to: '#0b4d3f', text: '#ffffff' },
  { from: '#ff0844', to: '#ffb199', text: '#1a0008' },
  { from: '#7f00ff', to: '#e100ff', text: '#ffffff' },
  { from: '#f7971e', to: '#ffd200', text: '#1a0d00' },
  { from: '#00c6fb', to: '#005bea', text: '#ffffff' },
  { from: '#11998e', to: '#38ef7d', text: '#001a0d' },
  { from: '#232526', to: '#414345', text: '#ffffff' },
  { from: '#cb2d3e', to: '#ef473a', text: '#ffffff' },
  { from: '#0f2027', to: '#2c5364', text: '#ffffff' },
  { from: '#fa709a', to: '#fee140', text: '#1a0008' },
  { from: '#134e5e', to: '#71b280', text: '#ffffff' },
  { from: '#1f1c2c', to: '#928dab', text: '#ffffff' },
]
const PATTERNS = ['orbs', 'grid', 'wave', 'rays']

const hashString = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Map the backend {type,value} source to something the DeckPlayer/Cover can
// render. Backend types: gslides, embed, pdf, url, video.
const normalizeSource = (src) => {
  const type = (src?.type || '').toLowerCase()
  const raw = src?.value || ''

  if (type === 'video') {
    // Uploaded videos are a relative /uploads path; make it absolute first so
    // detectVideo can recognise it as a direct file.
    const url = absoluteUrl(raw)
    const info = detectVideo(url)
    if (info) return { type: 'video', value: info.embedUrl, kind: info.kind, platform: info.platform }
    return { type: 'video', value: url, kind: 'iframe' }
  }
  if (type === 'pdf') {
    // Uploaded/remote PDFs are fetched by pdf.js from their URL; legacy decks
    // may still carry inline base64.
    if (/^(https?:|\/)/i.test(raw)) return { type: 'pdf', value: absoluteUrl(raw), remote: true }
    return { type: 'pdf', value: raw }
  }
  // gslides / embed / url (and anything else) → iframe; UrlStage's toEmbedUrl
  // handles the Google-Slides conversion.
  return { type: 'url', value: absoluteUrl(raw) }
}

export const normalizeDeck = (d) => {
  const key = d.id || d.title || ''
  const h = hashString(key)
  return {
    ...d,
    tags: Array.isArray(d.tags) ? d.tags : [],
    gradient: GRADIENTS[h % GRADIENTS.length],
    pattern: PATTERNS[(h >> 4) % PATTERNS.length],
    source: normalizeSource(d.source),
  }
}

export const normalizeDecks = (list) => (Array.isArray(list) ? list.map(normalizeDeck) : [])

// Map an AddDeckModal deck (rich, client-side) → the backend createDeck body.
// Presentation-only fields (gradient, pattern, attachments, slidesCount) are
// dropped — the backend doesn't store them; they're re-derived on read.
export const toCreateRequest = (deck) => ({
  title: deck.title || '',
  subtitle: deck.subtitle || '',
  author: deck.author || '',
  year: Number(deck.year) || new Date().getFullYear(),
  category: deck.category || 'mine',
  industry: deck.industry || '',
  tags: Array.isArray(deck.tags) ? deck.tags : [],
  source: { type: deck.source?.type || 'url', value: deck.source?.value || '' },
  description: deck.description || '',
  featured: !!deck.featured,
})

// Backend user createdAt is a full ISO timestamp; the UI shows a date.
export const normalizeUser = (u) => ({
  ...u,
  createdAt: typeof u.createdAt === 'string' ? u.createdAt.slice(0, 10) : u.createdAt,
})

export const normalizeUsers = (list) => (Array.isArray(list) ? list.map(normalizeUser) : [])
