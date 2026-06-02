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

// TokenManager signs and parses JWTs. It lives in the delivery layer because
// JWTs are a transport-level concern.
type TokenManager struct {
	secret []byte
	ttl    time.Duration
}

// NewTokenManager builds a TokenManager.
func NewTokenManager(secret string, ttl time.Duration) *TokenManager {
	return &TokenManager{secret: []byte(secret), ttl: ttl}
}

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

		ctx := context.WithValue(r.Context(), ctxKeyUserID, claims.Subject)
		ctx = context.WithValue(ctx, ctxKeyRole, claims.Role)
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
