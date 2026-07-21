/* WIT service worker.
 *
 * Hand-rolled rather than generated, so the caching rules are explicit:
 *   - navigations   → network-first, fall back to the cached app shell (offline)
 *   - build assets  → cache-first (Vite content-hashes them, so they're immutable)
 *   - API GETs      → network-first, fall back to the last good response
 *   - remote images → stale-while-revalidate, capped so the cache can't grow forever
 *
 * Bump VERSION to invalidate every cache.
 */

const VERSION = 'v1'
const SHELL_CACHE = `wit-shell-${VERSION}`
const ASSET_CACHE = `wit-assets-${VERSION}`
const API_CACHE = `wit-api-${VERSION}`
const IMAGE_CACHE = `wit-images-${VERSION}`
const IMAGE_CACHE_LIMIT = 120

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one 404 can't fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE, IMAGE_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Let the page tell a waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

async function trimCache(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)))
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) cache.put(request, fresh.clone())
    return fresh
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const fresh = await fetch(request)
  if (fresh && fresh.ok) cache.put(request, fresh.clone())
  return fresh
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache.put(request, res.clone()).then(() => trimCache(cacheName, limit))
      }
      return res
    })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache per-user responses.
  if (request.headers.has('Authorization')) return

  // App shell for navigations — this is what makes the PWA open offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE)
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
      }),
    )
    return
  }

  // Immutable, content-hashed build output.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Same-origin icons/manifest.
  if (url.origin === self.location.origin && /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Backend API — keep the last good catalog so the app still renders offline.
  if (/\/(decks|users|healthz)(\/|\?|$)/.test(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  // Remote deck artwork.
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT))
  }
})
