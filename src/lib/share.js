// Sharing a deck with someone outside the catalog.
//
// The app had no per-deck URL — everything was state in memory — so there was
// nothing to copy. `?deck=<id>` is that URL, and it is a query parameter
// rather than a path so it needs no server routing: nginx already falls back
// to index.html, and the app reads the parameter on load.

export const DECK_PARAM = 'deck'

// The path a named deck lives at. Short on purpose: it is going into WhatsApp
// next to a sentence, not into a sitemap.
export const DECK_PATH = '/d/'

// Where a deck's own link points.
//
// A deck with a name gets the readable form — /d/company-profile-2026 — and
// one without falls back to ?deck=<uuid>. Both are real addresses that the app
// resolves; neither is a redirect or a shortener, so what somebody sees in
// their address bar after following it is the same link they were sent.
//
// Every share route goes through here — copy, WhatsApp, email, the QR code —
// so a deck that gains a name gains it everywhere at once.
export const deckUrl = (deck) => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (deck.slug) {
    url.pathname = DECK_PATH + deck.slug
    return url.toString()
  }
  url.pathname = '/'
  url.searchParams.set(DECK_PARAM, deck.id)
  return url.toString()
}

// What the address bar is asking for, if anything: a deck by name, a deck by
// id, or neither.
//
// Returns { slug } or { id }, never both — the two are looked up by different
// endpoints, and collapsing them into one string would mean guessing which at
// the point of use.
export const sharedDeckRef = () => {
  try {
    const path = window.location.pathname
    if (path.startsWith(DECK_PATH)) {
      // Trailing slash tolerated: mail clients add one often enough that
      // refusing it would turn a working link into a 404 for no reason.
      const slug = decodeURIComponent(path.slice(DECK_PATH.length)).replace(/\/+$/, '')
      if (slug) return { slug }
    }
    const id = new URLSearchParams(window.location.search).get(DECK_PARAM)
    return id ? { id } : null
  } catch {
    return null
  }
}

// Keep the address bar pointing at whatever is open, so copying from the
// browser gives the same link the share menu does. replaceState rather than
// pushState: the player is a modal, and Back should leave the app the way it
// always has rather than stepping through decks.
export const syncDeckUrl = (deck) => {
  try {
    const url = new URL(window.location.href)

    // A signed-in person stays on the app's own path. Rewriting the bar to
    // /d/<slug> would be the link they want to copy, but it is also the path
    // that hands a *signed-out* visitor the single-deck page — so a reload
    // would drop them out of the catalog they were browsing. The share menu
    // builds the readable link; this only tracks what is open.
    if (url.pathname.startsWith(DECK_PATH)) url.pathname = '/'

    if (deck) url.searchParams.set(DECK_PARAM, deck.id)
    else url.searchParams.delete(DECK_PARAM)
    window.history.replaceState({}, '', url.pathname + url.search)
  } catch {
    // A history call can throw in a sandboxed frame. Sharing still works from
    // the menu, which builds its own URL.
  }
}

const shareText = (deck) => `${deck.title}${deck.author ? ` — ${deck.author}` : ''}`

export const whatsappUrl = (deck) =>
  `https://wa.me/?text=${encodeURIComponent(`${shareText(deck)}\n${deckUrl(deck)}`)}`

export const mailtoUrl = (deck) =>
  `mailto:?subject=${encodeURIComponent(shareText(deck))}` +
  `&body=${encodeURIComponent(`${deck.description || shareText(deck)}\n\n${deckUrl(deck)}`)}`

// Only decks whose file lives on the WIT server can be downloaded. A Google
// Slides or Canva deck is a link to somebody else's page — there is no file to
// hand over, so the menu offers the original instead of a download that would
// fetch an HTML page named .pdf.
export const downloadable = (deck) => {
  const raw = deck?.source?.raw ?? deck?.source?.value ?? ''
  return typeof raw === 'string' && raw.startsWith('/uploads/')
}

// What the file should be called once it lands in someone's Downloads folder.
//
// Uploads are stored as a UUID plus extension, so without this a client
// receives be3eb919-349e-4dde-8ab4-ccac581c268a.pdf and has no idea what it
// is. The deck title is the right name: the Add-deck form fills it in from the
// uploaded file to begin with, so in the usual case this hands back the very
// name that was uploaded, and when a deck has been renamed since, the new name
// is the one that means something.
export const downloadFilename = (deck) => {
  const raw = deck?.source?.raw ?? deck?.source?.value ?? ''
  const ext = (String(raw).match(/\.[a-z0-9]{1,10}$/i) || [''])[0]
  const base = (deck?.title || 'deck')
    .replace(/[\\/:*?"<>|]/g, '-') // characters Windows and macOS refuse in a filename
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `${base}${ext}`
}

// The server sets Content-Disposition from this. It has to come from the
// server: the `download` attribute is ignored cross-origin, and in development
// the app and the API sit on different ports.
export const downloadUrl = (deck, absolute) => {
  const raw = deck?.source?.raw ?? deck?.source?.value ?? ''
  return `${absolute(raw)}?download=${encodeURIComponent(downloadFilename(deck))}`
}

export const copyToClipboard = async (text) => {
  // The modern API first, but its absence is not the only way it fails: it
  // rejects without a secure context, and Chrome rejects it without a recent
  // user gesture too. Either way there is a fallback that still works, so a
  // rejection is a reason to try it rather than to tell somebody it did not
  // work.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through.
    }
  }

  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(el)
  if (!ok) throw new Error('the browser refused to copy')
}
