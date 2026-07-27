package usecase

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// Continue-watching is a shelf, not an archive. Capping the list keeps the
// response small and matches what the UI shows.
const MaxProgressRows = 50

type ProgressUsecase struct {
	repo domain.ProgressRepository
}

func NewProgressUsecase(repo domain.ProgressRepository) *ProgressUsecase {
	return &ProgressUsecase{repo: repo}
}

func (uc *ProgressUsecase) List(ctx context.Context, userID uuid.UUID) ([]*domain.ViewingProgress, error) {
	rows, err := uc.repo.List(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list progress: %w", err)
	}
	if len(rows) > MaxProgressRows {
		rows = rows[:MaxProgressRows]
	}
	return rows, nil
}

func (uc *ProgressUsecase) Save(ctx context.Context, userID, deckID uuid.UUID, currentSlide, totalSlides int) error {
	// Clamp rather than reject. A bad position is not worth failing a
	// fire-and-forget progress ping that the player does not wait on.
	if currentSlide < 0 {
		currentSlide = 0
	}
	if totalSlides < 0 {
		totalSlides = 0
	}
	if totalSlides > 0 && currentSlide >= totalSlides {
		currentSlide = totalSlides - 1
	}

	err := uc.repo.Save(ctx, userID, &domain.ViewingProgress{
		DeckID:       deckID,
		CurrentSlide: currentSlide,
		TotalSlides:  totalSlides,
	})
	if err != nil {
		return fmt.Errorf("save progress: %w", err)
	}
	return nil
}

func (uc *ProgressUsecase) Delete(ctx context.Context, userID, deckID uuid.UUID) error {
	if err := uc.repo.Delete(ctx, userID, deckID); err != nil {
		return fmt.Errorf("delete progress: %w", err)
	}
	return nil
}
