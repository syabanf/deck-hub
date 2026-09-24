// The readable part of a share link: paparan.reddie.id/d/company-profile-2026
//
// This is a copy of the server's rule (backend/internal/usecase/slug.go), and
// a copy is a thing that can drift — so it is worth being exact about which
// one decides. The server does. It cleans whatever arrives and stores the
// result, and the deck that comes back carries the name it was actually given.
//
// What this is for is showing that answer *before* the save, in the field the
// person is typing in, so nobody discovers what their link became after they
// had already sent it to a client. If the two ever disagree, the field is
// wrong for a moment and the stored name is still right.
//
// slug.test.mjs holds the same cases as the Go test, which is what would catch
// the drift.

export const MAX_SLUG_LEN = 60

// Names the site itself answers to. Kept in step with reservedSlugs in the Go
// file — the server refuses these regardless, this only says so sooner.
const RESERVED = new Set([
  'api', 'assets', 'uploads', 'static',
  'd', 'deck', 'decks', 'index',
  'login', 'logout', 'register', 'verify',
  'settings', 'admin', 'profile', 'search',
  'healthz', 'docs', 'roles', 'manifest',
  'favicon', 'robots', 'sitemap', 'new',
])

// Turn what somebody typed into something a URL can carry.
//
//   "Profil WIT 2026!"  → "profil-wit-2026"
//   "Q1/Q2 — Review"    → "q1-q2-review"
//   "日本語"              → ""
export function slugify(raw) {
  let out = ''
  let prevHyphen = false
  for (const ch of String(raw ?? '').trim().toLowerCase()) {
    // ASCII letters and digits only. A slug that needs percent-encoding to be
    // typed is not a readable link, which was the whole point.
    if (/[a-z0-9]/.test(ch)) {
      out += ch
      prevHyphen = false
    } else if (!prevHyphen && out.length > 0) {
      // Any run of separators — spaces, punctuation, an em dash — collapses to
      // one hyphen, and never a leading one.
      out += '-'
      prevHyphen = true
    }
    if (out.length >= MAX_SLUG_LEN) break
  }
  return out.replace(/-+$/, '')
}

// Why this slug cannot be used, or '' when it can.
//
// Empty is fine and returns '': a deck without a name is reachable by id, the
// way every deck was before links had names.
export function slugProblem(raw) {
  if (!String(raw ?? '').trim()) return ''
  const s = slugify(raw)
  if (!s) return 'Use at least one letter or number.'
  if (RESERVED.has(s)) return `“${s}” is reserved by the site — pick another.`
  if (!/[a-z]/.test(s)) return 'Needs at least one letter, not only numbers.'
  return ''
}
