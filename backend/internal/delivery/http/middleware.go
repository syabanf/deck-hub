package http

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/wit/wit-backend/internal/domain"
)

// ctxKey is an unexported type to avoid context key collisions.
type ctxKey string

const (
	ctxKeyUserID ctxKey = "userID"
	ctxKeyRole   ctxKey = "role"
)

// Claims is the JWT payload for authenticated users.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// AccountLookup answers, for the account a token names, whether it may still
// act and what it may do. See TokenManager.SetAccountLookup.
type AccountLookup func(ctx context.Context, id string) (role string, ok bool)

// TokenManager signs and parses JWTs. It lives in the delivery layer because
// JWTs are a transport-level concern.
type TokenManager struct {
	secret []byte
	ttl    time.Duration

	// account, when set, is consulted on every authenticated request.
	account AccountLookup
}

// NewTokenManager builds a TokenManager.
func NewTokenManager(secret string, ttl time.Duration) *TokenManager {
	return &TokenManager{secret: []byte(secret), ttl: ttl}
}

// SetAccountLookup makes every authenticated request check the account behind
// the token, instead of trusting what the token says about it.
//
// A JWT is a snapshot of the moment it was signed, and nothing about deleting
// an account, suspending it, or demoting an admin to viewer reaches a token
// already in someone's browser. With a 24-hour lifetime that is a full day in
// which "remove this user" removes nothing — which is precisely the situation
// an admin reaches for that button in.
//
// So the claim is treated as a hint and the database as the answer: gone or
// suspended is refused, and the role that governs the request is the current
// one. One indexed lookup per authenticated call.
//
// Optional. Left unset — as the docs and stress harnesses do — the token's own
// claims stand, which is the previous behaviour.
func (tm *TokenManager) SetAccountLookup(fn AccountLookup) { tm.account = fn }

// Generate issues a signed JWT for the given user.
func (tm *TokenManager) Generate(u *domain.User) (string, error) {
	now := time.Now()
	claims := Claims{
		Role: string(u.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tm.ttl)),
			Issuer:    "wit-backend",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(tm.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// parse validates a token string and returns its claims.
func (tm *TokenManager) parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return tm.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", domain.ErrUnauthorized, err)
	}
	return claims, nil
}

// JWTAuth returns middleware that validates a Bearer token and injects the user
// id and role into the request context.
func (tm *TokenManager) JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			writeError(w, fmt.Errorf("%w: missing Authorization header", domain.ErrUnauthorized))
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			writeError(w, fmt.Errorf("%w: Authorization header must be 'Bearer <token>'", domain.ErrUnauthorized))
			return
		}

		claims, err := tm.parse(strings.TrimSpace(parts[1]))
		if err != nil {
			writeError(w, err)
			return
		}

		role := claims.Role
		if tm.account != nil {
			current, ok := tm.account(r.Context(), claims.Subject)
			if !ok {
				writeError(w, fmt.Errorf("%w: this account is no longer active", domain.ErrUnauthorized))
				return
			}
			role = current
		}

		ctx := context.WithValue(r.Context(), ctxKeyUserID, claims.Subject)
		ctx = context.WithValue(ctx, ctxKeyRole, role)
		// The audit middleware sits outside this one and never sees the
		// context built here, so the account is handed back to it explicitly.
		noteActor(r.Context(), claims.Subject, role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole returns middleware that allows the request only if the
// authenticated user's role is in the allowed set. Must be chained after JWTAuth.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := RoleFromContext(r.Context())
			if _, ok := allowed[role]; !ok {
				writeError(w, fmt.Errorf("%w: insufficient permissions", domain.ErrForbidden))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// UserIDFromContext extracts the authenticated user id placed by JWTAuth.
func UserIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxKeyUserID).(string)
	return id, ok
}

// RoleFromContext extracts the authenticated role placed by JWTAuth.
func RoleFromContext(ctx context.Context) (string, bool) {
	role, ok := ctx.Value(ctxKeyRole).(string)
	return role, ok
}
