package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// DemoUsecase holds the rules for the demo credentials.
type DemoUsecase struct {
	repo domain.DemoRepository
}

// NewDemoUsecase wires a DemoUsecase with its repository dependency.
func NewDemoUsecase(repo domain.DemoRepository) *DemoUsecase {
	return &DemoUsecase{repo: repo}
}

// DemoInput carries the editable fields. Pointers on update only, so this is
// the create shape; UpdateDemoInput below is the partial one.
type DemoInput struct {
	Name      string
	Product   string
	URL       string
	Username  string
	Password  string
	Notes     string
	SortOrder int
	Active    *bool
	CreatedBy *uuid.UUID
}

// UpdateDemoInput is partial: an omitted field keeps its value.
type UpdateDemoInput struct {
	Name      *string
	Product   *string
	URL       *string
	Username  *string
	Password  *string
	Notes     *string
	SortOrder *int
	Active    *bool
}

const maxDemoField = 500

func (uc *DemoUsecase) List(ctx context.Context, f domain.DemoFilter) ([]*domain.Demo, error) {
	return uc.repo.List(ctx, f)
}

func (uc *DemoUsecase) GetByID(ctx context.Context, id uuid.UUID) (*domain.Demo, error) {
	return uc.repo.GetByID(ctx, id)
}

func (uc *DemoUsecase) Create(ctx context.Context, in DemoInput) (*domain.Demo, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", domain.ErrInvalidInput)
	}
	if err := checkDemoLengths(in.Name, in.Product, in.URL, in.Username, in.Password); err != nil {
		return nil, err
	}

	// A new demo goes to the end of the list unless placed explicitly, for the
	// same reason a taxonomy term does: landing silently at position zero
	// reorders a page nobody meant to touch.
	order := in.SortOrder
	if order == 0 {
		existing, err := uc.repo.List(ctx, domain.DemoFilter{})
		if err != nil {
			return nil, err
		}
		for _, d := range existing {
			if d.SortOrder >= order {
				order = d.SortOrder + 10
			}
		}
	}

	now := time.Now().UTC()
	d := &domain.Demo{
		ID:       uuid.New(),
		Name:     name,
		Product:  strings.TrimSpace(in.Product),
		URL:      strings.TrimSpace(in.URL),
		Username: in.Username,
		// Not trimmed. A password can legitimately start or end with a space,
		// and silently changing one is a credential that no longer works with
		// no sign of why.
		Password:  in.Password,
		Notes:     strings.TrimSpace(in.Notes),
		SortOrder: order,
		Active:    in.Active == nil || *in.Active,
		CreatedBy: in.CreatedBy,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := uc.repo.Create(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (uc *DemoUsecase) Update(ctx context.Context, id uuid.UUID, in UpdateDemoInput) (*domain.Demo, error) {
	d, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: name cannot be empty", domain.ErrInvalidInput)
		}
		d.Name = name
	}
	if in.Product != nil {
		d.Product = strings.TrimSpace(*in.Product)
	}
	if in.URL != nil {
		d.URL = strings.TrimSpace(*in.URL)
	}
	if in.Username != nil {
		d.Username = *in.Username
	}
	if in.Password != nil {
		d.Password = *in.Password
	}
	if in.Notes != nil {
		d.Notes = strings.TrimSpace(*in.Notes)
	}
	if in.SortOrder != nil {
		d.SortOrder = *in.SortOrder
	}
	if in.Active != nil {
		d.Active = *in.Active
	}
	if err := checkDemoLengths(d.Name, d.Product, d.URL, d.Username, d.Password); err != nil {
		return nil, err
	}

	d.UpdatedAt = time.Now().UTC()
	if err := uc.repo.Update(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (uc *DemoUsecase) Delete(ctx context.Context, id uuid.UUID) error {
	return uc.repo.Delete(ctx, id)
}

// checkDemoLengths keeps a paste accident out of the database. Notes are left
// out on purpose — that field is meant to hold instructions.
func checkDemoLengths(fields ...string) error {
	for _, f := range fields {
		if len(f) > maxDemoField {
			return fmt.Errorf("%w: fields must be at most %d characters", domain.ErrInvalidInput, maxDemoField)
		}
	}
	return nil
}
