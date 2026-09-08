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
