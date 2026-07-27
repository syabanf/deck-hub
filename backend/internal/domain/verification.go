package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// EmailVerificationToken proves someone controls the address they registered
// with.
//
// TokenHash is a SHA-256 of the value that was emailed — the plaintext is never
// stored. Anyone able to read this table (a backup, a log, an injection) could
// otherwise verify and take over every pending account.
type EmailVerificationToken struct {
	TokenHash string
	UserID    uuid.UUID
	ExpiresAt time.Time
	CreatedAt time.Time
}

// Expired reports whether the token is past its lifetime. Compared against the
// caller's clock rather than the database's, so verification behaves the same
// in tests as in production.
func (t *EmailVerificationToken) Expired(now time.Time) bool {
	return now.After(t.ExpiresAt)
}

// EmailVerificationRepository persists verification tokens.
type EmailVerificationRepository interface {
	Create(ctx context.Context, t *EmailVerificationToken) error

	// GetByHash returns ErrNotFound for an unknown hash. Callers must still
	// check Expired — an expired token exists, it just no longer works, and the
	// two cases deserve different messages.
	GetByHash(ctx context.Context, hash string) (*EmailVerificationToken, error)

	// DeleteForUser removes every outstanding token for a user. Called after a
	// successful verification so a second, still-unexpired token from a resend
	// cannot be replayed.
	DeleteForUser(ctx context.Context, userID uuid.UUID) error

	// CountRecentForUser powers resend rate limiting.
	CountRecentForUser(ctx context.Context, userID uuid.UUID, since time.Time) (int, error)
}

// Mailer delivers outbound mail. An interface for the same reason FileStorage
// is one: the usecase layer should not know whether this is SMTP, a hosted API,
// or a line in the dev server's log.
type Mailer interface {
	SendVerification(ctx context.Context, to, name, verifyURL string) error
}
