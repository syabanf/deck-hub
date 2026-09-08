package usecase

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/wit/wit-backend/internal/domain"
)

// normalizeLink checks and tidies a value that will end up in an href or an
// iframe src.
//
// Two problems, one place to solve them.
//
// The first is safety. Anything stored here is later rendered as a link the
// browser will follow — `javascript:` and `data:` URLs among them, which run
// as script on this application's own origin. Writing one requires an editor's
// account, so this is not a hole open to the public, but "an editor cannot
// plant script in a page an admin will open" is a property worth actually
// having rather than assuming.
//
// The second is that a bare host is not a link. "dashboard.example.com",
// typed without a scheme, is a *relative* URL: the browser resolves it against
// the current page and lands somewhere inside this app. One of the demo rows
// was exactly that, and its Open button went nowhere. Rather than refuse a
// perfectly clear intention, the missing scheme is filled in.
//
// Site-relative paths pass untouched: uploaded decks and covers are stored as
// "/uploads/<uuid>.pdf" and are the common case here. A protocol-relative
// "//host" is not one of those — it leaves the site — so it is treated as a
// URL and needs its scheme spelled out.
func normalizeLink(field, raw string) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", nil
	}

	// Site-relative: our own uploads.
	if strings.HasPrefix(v, "/") && !strings.HasPrefix(v, "//") {
		return v, nil
	}

	u, err := url.Parse(v)
	if err != nil {
		return "", fmt.Errorf("%w: %s is not a valid URL", domain.ErrInvalidInput, field)
	}

	// No scheme and something host-shaped before the first slash: the person
	// meant a website and left the https off.
	if u.Scheme == "" {
		host := v
		if i := strings.IndexAny(v, "/?#"); i >= 0 {
			host = v[:i]
		}
		if host == "" || !strings.Contains(host, ".") || strings.ContainsAny(host, " \t") {
			return "", fmt.Errorf("%w: %s must be a http:// or https:// URL", domain.ErrInvalidInput, field)
		}
		v = "https://" + v
		if u, err = url.Parse(v); err != nil {
			return "", fmt.Errorf("%w: %s is not a valid URL", domain.ErrInvalidInput, field)
		}
	}

	switch strings.ToLower(u.Scheme) {
	case "http", "https":
	default:
		return "", fmt.Errorf("%w: %s must be a http:// or https:// URL, not %s:",
			domain.ErrInvalidInput, field, u.Scheme)
	}
	if u.Host == "" {
		return "", fmt.Errorf("%w: %s is missing a host", domain.ErrInvalidInput, field)
	}
	return v, nil
}
