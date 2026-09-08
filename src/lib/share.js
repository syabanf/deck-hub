// Sharing a deck with someone outside the catalog.
//
// The app had no per-deck URL — everything was state in memory — so there was
// nothing to copy. `?deck=<id>` is that URL, and it is a query parameter
// rather than a path so it needs no server routing: nginx already falls back
// to index.html, and the app reads the parameter on load.

export const DECK_PARAM = 'deck'

export const deckUrl = (deck) => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(DECK_PARAM, deck.id)
  return url.toString()
}

// The id in the address bar, if the page was opened from a shared link.
export const sharedDeckId = () => {
  try {
    return new URLSearchParams(window.location.search).get(DECK_PARAM)
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
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Clipboard API needs a secure context; a deployment reached over plain HTTP
  // has none, and this is the fallback that still works there.
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}
