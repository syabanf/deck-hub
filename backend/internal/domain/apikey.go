package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// APIKey is a credential issued to something outside this company.
//
// It is not an account. It carries no role, cannot sign in, and reaches
// exactly the endpoints the router puts behind it — today that is the roles
// summary and nothing else. Anything an API key can read is public to whoever
// holds the key, so what sits behind one is chosen with that in mind.
type APIKey struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`

	// Prefix is the readable head of the key. The full value is shown once, at
	// creation, and never stored in a form anyone can read back — so this is
	// how the admin screen tells two keys apart afterwards.
	Prefix string `json:"prefix"`

	// RevokedAt set means the key is dead. The row stays: deleting it would
	// erase who issued the key and when, which is the question somebody asks
	// precisely when a key has gone wrong.
	RevokedAt *time.Time `json:"revokedAt,omitempty"`

	// LastUsedAt answers "is anybody still calling with this?" before it is
	// revoked, and "since when?" afterwards.
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`

	CreatedBy *uuid.UUID `json:"createdBy,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

// Active reports whether the key may still be used.
func (k *APIKey) Active() bool { return k != nil && k.RevokedAt == nil }

// ErrInvalidAPIKey is returned when a presented key is missing, unknown or
// revoked. One error for all three on purpose: telling a caller which of them
// it was tells an attacker which keys exist.
var ErrInvalidAPIKey = errors.New("invalid api key")

// APIKeyRepository abstracts persistence for API keys.
type APIKeyRepository interface {
	Create(ctx context.Context, k *APIKey, hash string) error
	List(ctx context.Context) ([]*APIKey, error)
	// FindByHash returns the key with this hash, revoked or not. The caller
	// decides what a revoked one means, so the log can say "revoked key used"
	// rather than "unknown key".
	FindByHash(ctx context.Context, hash string) (*APIKey, error)
	Revoke(ctx context.Context, id uuid.UUID, at time.Time) error
	TouchLastUsed(ctx context.Context, id uuid.UUID, at time.Time) error
}
