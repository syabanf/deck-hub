package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ViewingProgress is one user's resume position in one deck.
//
// Kept apart from Deck.ViewCount on purpose: that is a public popularity
// counter anyone can increment, this is private per-user history.
type ViewingProgress struct {
	DeckID       uuid.UUID `json:"deckId"`
	CurrentSlide int       `json:"currentSlide"`
	TotalSlides  int       `json:"totalSlides"`
	ViewedAt     time.Time `json:"viewedAt"`
}

// ProgressRepository persists per-user resume positions.
type ProgressRepository interface {
	// List returns the user's progress rows, most recently viewed first.
	List(ctx context.Context, userID uuid.UUID) ([]*ViewingProgress, error)
	// Save upserts one row. Returns ErrNotFound if the deck does not exist.
	Save(ctx context.Context, userID uuid.UUID, p *ViewingProgress) error
	// Delete drops one row. Idempotent.
	Delete(ctx context.Context, userID, deckID uuid.UUID) error
}
