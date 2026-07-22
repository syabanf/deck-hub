package usecase

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// FavoriteUsecase holds the application rules for per-user favorites. It's thin
// — the interesting behaviour (idempotency, FK-to-not-found mapping) lives in
// the repository — but it keeps delivery decoupled from persistence.
type FavoriteUsecase struct {
	repo domain.FavoriteRepository
}

// NewFavoriteUsecase wires a FavoriteUsecase with its repository dependency.
func NewFavoriteUsecase(repo domain.FavoriteRepository) *FavoriteUsecase {
	return &FavoriteUsecase{repo: repo}
}

// ListDeckIDs returns the user's favorited deck ids, newest first.
func (uc *FavoriteUsecase) ListDeckIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	ids, err := uc.repo.ListDeckIDs(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list favorites: %w", err)
	}
	return ids, nil
}

// Add favorites a deck for the user (idempotent).
func (uc *FavoriteUsecase) Add(ctx context.Context, userID, deckID uuid.UUID) error {
	if err := uc.repo.Add(ctx, userID, deckID); err != nil {
		return fmt.Errorf("add favorite: %w", err)
	}
	return nil
}

// Remove unfavorites a deck for the user (idempotent).
func (uc *FavoriteUsecase) Remove(ctx context.Context, userID, deckID uuid.UUID) error {
	if err := uc.repo.Remove(ctx, userID, deckID); err != nil {
		return fmt.Errorf("remove favorite: %w", err)
	}
	return nil
}
