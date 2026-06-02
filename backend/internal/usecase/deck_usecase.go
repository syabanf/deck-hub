package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// DeckUsecase holds application business rules for decks. It depends only on
// the domain DeckRepository interface.
type DeckUsecase struct {
	repo domain.DeckRepository
}

// NewDeckUsecase wires a DeckUsecase with its repository dependency.
func NewDeckUsecase(repo domain.DeckRepository) *DeckUsecase {
	return &DeckUsecase{repo: repo}
}

// CreateDeckInput carries the fields needed to create a deck.
type CreateDeckInput struct {
	Title       string
	Subtitle    string
	Author      string
	Year        int
	Category    string
	Industry    string
	Tags        []string
	Source      domain.DeckSource
	Description string
	Featured    bool
}

func validateDeckCore(title, category string, source domain.DeckSource) error {
	if strings.TrimSpace(title) == "" {
		return fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if strings.TrimSpace(category) == "" {
		return fmt.Errorf("%w: category is required", domain.ErrInvalidInput)
	}
	if strings.TrimSpace(source.Type) == "" || strings.TrimSpace(source.Value) == "" {
		return fmt.Errorf("%w: source type and value are required", domain.ErrInvalidInput)
	}
	return nil
}

// Create validates input and persists a new deck.
func (uc *DeckUsecase) Create(ctx context.Context, in CreateDeckInput) (*domain.Deck, error) {
	if err := validateDeckCore(in.Title, in.Category, in.Source); err != nil {
		return nil, err
	}
	if in.Tags == nil {
		in.Tags = []string{}
	}

	now := time.Now().UTC()
	d := &domain.Deck{
		ID:          uuid.New(),
		Title:       strings.TrimSpace(in.Title),
		Subtitle:    in.Subtitle,
		Author:      in.Author,
		Year:        in.Year,
		Category:    in.Category,
		Industry:    in.Industry,
		Tags:        in.Tags,
		Source:      in.Source,
		Description: in.Description,
		Featured:    in.Featured,
		ViewCount:   0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := uc.repo.Create(ctx, d); err != nil {
		return nil, fmt.Errorf("create deck: %w", err)
	}
	return d, nil
}

// GetByID returns a single deck or domain.ErrNotFound.
func (uc *DeckUsecase) GetByID(ctx context.Context, id uuid.UUID) (*domain.Deck, error) {
	d, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get deck: %w", err)
	}
	return d, nil
}

// List returns decks matching the filter.
func (uc *DeckUsecase) List(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, error) {
	decks, err := uc.repo.List(ctx, f)
	if err != nil {
		return nil, fmt.Errorf("list decks: %w", err)
	}
	return decks, nil
}

// UpdateDeckInput carries optional updates. Nil pointers are left unchanged.
type UpdateDeckInput struct {
	Title       *string
	Subtitle    *string
	Author      *string
	Year        *int
	Category    *string
	Industry    *string
	Tags        *[]string
	Source      *domain.DeckSource
	Description *string
	Featured    *bool
}

// Update applies partial changes to an existing deck after validation.
func (uc *DeckUsecase) Update(ctx context.Context, id uuid.UUID, in UpdateDeckInput) (*domain.Deck, error) {
	d, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get deck: %w", err)
	}

	if in.Title != nil {
		if strings.TrimSpace(*in.Title) == "" {
			return nil, fmt.Errorf("%w: title cannot be empty", domain.ErrInvalidInput)
		}
		d.Title = strings.TrimSpace(*in.Title)
	}
	if in.Subtitle != nil {
		d.Subtitle = *in.Subtitle
	}
	if in.Author != nil {
		d.Author = *in.Author
	}
	if in.Year != nil {
		d.Year = *in.Year
	}
	if in.Category != nil {
		if strings.TrimSpace(*in.Category) == "" {
			return nil, fmt.Errorf("%w: category cannot be empty", domain.ErrInvalidInput)
		}
		d.Category = *in.Category
	}
	if in.Industry != nil {
		d.Industry = *in.Industry
	}
	if in.Tags != nil {
		tags := *in.Tags
		if tags == nil {
			tags = []string{}
		}
		d.Tags = tags
	}
	if in.Source != nil {
		if strings.TrimSpace(in.Source.Type) == "" || strings.TrimSpace(in.Source.Value) == "" {
			return nil, fmt.Errorf("%w: source type and value are required", domain.ErrInvalidInput)
		}
		d.Source = *in.Source
	}
	if in.Description != nil {
		d.Description = *in.Description
	}
	if in.Featured != nil {
		d.Featured = *in.Featured
	}

	d.UpdatedAt = time.Now().UTC()
	if err := uc.repo.Update(ctx, d); err != nil {
		return nil, fmt.Errorf("update deck: %w", err)
	}
	return d, nil
}

// Delete removes a deck by id.
func (uc *DeckUsecase) Delete(ctx context.Context, id uuid.UUID) error {
	if err := uc.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete deck: %w", err)
	}
	return nil
}

// IncrementViews atomically bumps the view counter and returns the updated deck.
func (uc *DeckUsecase) IncrementViews(ctx context.Context, id uuid.UUID) (*domain.Deck, error) {
	d, err := uc.repo.IncrementViews(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("increment views: %w", err)
	}
	return d, nil
}
