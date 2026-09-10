package http

import (
	"context"
	"net/http"
	"strings"

	"github.com/wit/wit-backend/internal/domain"
)

// APIKeyHeader is where an external caller presents its key.
//
// A header rather than a query parameter, for the same reason the Demo Center
// PIN is one: query strings are written into access logs, proxy logs and
// browser history, and a credential that ends up in a log is a credential that
// outlives its usefulness.
const APIKeyHeader = "X-API-Key"

type apiKeyVerifier interface {
	Verify(ctx context.Context, presented string) (*domain.APIKey, error)
}

type apiKeyCtx struct{}

// APIKeyFromContext returns the key a request was authenticated with, if any.
func APIKeyFromContext(ctx context.Context) (*domain.APIKey, bool) {
	k, ok := ctx.Value(apiKeyCtx{}).(*domain.APIKey)
	return k, ok
}

// RequireAPIKey gates a route on a valid, unrevoked API key.
//
// Nothing about this is a session: there is no role, no account, and no path
// from here to anything else. A route behind this middleware is readable by
// whoever holds the key, so only endpoints that could be handed to a partner
// wholesale belong here.
//
// The Authorization header is accepted as well as X-API-Key, because half the
// HTTP clients in the world reach for `Authorization: Bearer` first and being
// strict about it buys nothing.
func RequireAPIKey(v apiKeyVerifier, limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			presented := strings.TrimSpace(r.Header.Get(APIKeyHeader))
			if presented == "" {
				if h := r.Header.Get("Authorization"); h != "" {
					if parts := strings.SplitN(h, " ", 2); len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
						presented = strings.TrimSpace(parts[1])
					}
				}
			}

			// Guessing is capped by address, since a caller with no valid key
			// has no other identity to charge it to. Checked before the lookup
			// so an exhausted client costs a comparison, not a query.
			if limiter != nil && !limiter.Permitted("api-key:"+clientIP(r)) {
				w.Header().Set("Retry-After", "60")
				writeErrorMsg(w, http.StatusTooManyRequests, "rate_limited",
					"too many attempts — wait a minute and try again")
				return
			}

			key, err := v.Verify(r.Context(), presented)
			if err != nil {
				if limiter != nil {
					limiter.Penalise("api-key:" + clientIP(r))
				}
				// Missing, unknown and revoked answer alike. Which one it was
				// is exactly what somebody working through guesses wants told.
				writeErrorMsg(w, http.StatusUnauthorized, "invalid_api_key",
					"a valid "+APIKeyHeader+" header is required")
				return
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), apiKeyCtx{}, key)))
		})
	}
}
