// One place that decides whether a stored value may become a link.
//
// The API normalises what it stores (see normalizeLink in the backend), but
// rows written before that check exists are still in the database, and a page
// that turns whatever it was given into an href is one bad row away from
// running someone else's script on this origin — `javascript:` and `data:`
// URLs execute when followed.
//
// So the rule is applied again where the link is actually rendered:
//
//   /uploads/x.pdf   → kept, it is our own file
//   https://host/…   → kept
//   host.example/…   → https:// added, because a bare host in an href is a
//                      *relative* link and silently goes nowhere
//   anything else    → '' , and the caller shows plain text instead
export function safeHref(raw) {
  const v = String(raw ?? '').trim()
  if (!v) return ''

  // Site-relative: our own uploads. "//host" is not one of those — it leaves
  // the site — so it goes through the URL check below.
  if (v.startsWith('/') && !v.startsWith('//')) return v

  // "//host/x" is protocol-relative: it already has the slashes, just not the
  // scheme. Prepending "https://" to it would produce "https:////host".
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)
    ? v
    : v.startsWith('//')
      ? `https:${v}`
      : `https://${v}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    if (!u.host) return ''
    return withScheme
  } catch {
    return ''
  }
}

// What to *show* for a link, as opposed to where it goes.
//
// A deck source is often a share URL somebody pasted, and those carry their
// tracking with them:
//
//   https://www.canva.com/design/DAF6Xbw/KqT…/view?utm_content=DAF6Xbw
//   &utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink
//
// Printed in full that is four lines of noise in a panel that is trying to say
// one thing: this deck lives on Canva. The host says it, so the host is what
// is shown — the href underneath is still the whole URL, unchanged, because
// the label is a summary of the destination and not a substitute for it.
//
// `www.` goes: it is never the part anyone is reading for.
export function linkLabel(raw) {
  const href = safeHref(raw)
  if (!href) return ''

  // Our own files have no host to name. The last path segment is the closest
  // thing to a name they have.
  if (href.startsWith('/')) {
    const name = href.split('?')[0].split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : href
  }

  try {
    return new URL(href).host.replace(/^www\./i, '')
  } catch {
    return href
  }
}
