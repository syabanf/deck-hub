package domain

import (
	"context"

	"github.com/google/uuid"
)

// FavoriteRepository persists the per-user set of favorited decks ("My
// Library"). Implementations live in the outer repository layer.
type FavoriteRepository interface {
	// ListDeckIDs returns the deck ids the user has favorited, newest first.
	ListDeckIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
	// Add favorites a deck for the user. Idempotent. Returns ErrNotFound if the
	// deck does not exist.
	Add(ctx context.Context, userID, deckID uuid.UUID) error
	// Remove unfavorites a deck for the user. Idempotent.
	Remove(ctx context.Context, userID, deckID uuid.UUID) error
}
