package usecase

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/wit/wit-backend/internal/domain"
)

// maxSlugLen caps a deck's readable name.
//
// Long enough for "laporan-tahunan-yayasan-pendidikan-2026" and short enough
// that the whole link survives being pasted into WhatsApp without the client
// deciding to truncate it with an ellipsis.
const maxSlugLen = 60

// reservedSlugs are names a deck may not take, because the application already
// answers to them.
//
// The share URL is /d/<slug>, so strictly none of these could collide today.
// They are refused anyway: the day someone serves galleries from /d/api/... or
// moves the player to a bare path, a deck holding one of these names becomes a
// routing bug that looks like a missing page, and by then the name is in a
// client's inbox and cannot simply be taken back.
var reservedSlugs = map[string]bool{
	"api": true, "assets": true, "uploads": true, "static": true,
	"d": true, "deck": true, "decks": true, "index": true,
	"login": true, "logout": true, "register": true, "verify": true,
	"settings": true, "admin": true, "profile": true, "search": true,
	"healthz": true, "docs": true, "roles": true, "manifest": true,
	"favicon": true, "robots": true, "sitemap": true, "new": true,
}

// Slugify turns whatever a person typed into something that can be a URL path.
//
//	"Profil WIT 2026!"        → "profil-wit-2026"
//	"  Laporan   Tahunan  "   → "laporan-tahunan"
//	"Q1/Q2 — Review"          → "q1-q2-review"
//	"日本語"                    → ""  (nothing a URL can carry survives)
//
// Applied to what the person typed rather than refusing it: a form that says
// "no spaces allowed" is a form that makes its reader do the computer's job.
// The cleaned value is shown back in the field, so nobody is surprised later
// by a link they did not agree to.
func Slugify(raw string) string {
	var b strings.Builder
	prevHyphen := false
	for _, r := range strings.ToLower(strings.TrimSpace(raw)) {
		switch {
		// ASCII only. A slug that needs percent-encoding to be typed is not a
		// readable link, which was the entire point of having one.
		case r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			prevHyphen = false
		default:
			// Any run of separators — spaces, punctuation, an em dash — becomes
			// exactly one hyphen, and never a leading one.
			if !prevHyphen && b.Len() > 0 {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
		if b.Len() >= maxSlugLen {
			break
		}
	}
	return strings.TrimRight(b.String(), "-")
}

// NormalizeSlug cleans a requested slug and says whether it may be used.
//
// Empty in means empty out with no error: a slug is optional, and a deck
// without one is still reachable by id.
func NormalizeSlug(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", nil
	}
	s := Slugify(raw)
	if s == "" {
		return "", fmt.Errorf("%w: %q has no letters or digits a link can use", domain.ErrInvalidInput, raw)
	}
	if reservedSlugs[s] {
		return "", fmt.Errorf("%w: %q is reserved by the site itself — pick another", domain.ErrInvalidInput, s)
	}
	// A slug of only digits would be indistinguishable from an id in any path
	// that later accepts both, and reads as an accident besides.
	if strings.IndexFunc(s, func(r rune) bool { return !unicode.IsDigit(r) && r != '-' }) < 0 {
		return "", fmt.Errorf("%w: %q needs at least one letter", domain.ErrInvalidInput, s)
	}
	return s, nil
}
