package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/wit/wit-backend/internal/domain"
)

// DemoUsecase holds the rules for the demo credentials.
type DemoUsecase struct {
	repo     domain.DemoRepository
	settings domain.SettingsRepository
}

// NewDemoUsecase wires a DemoUsecase with its dependencies. The settings
// repository is where the PIN hash lives.
func NewDemoUsecase(repo domain.DemoRepository, settings domain.SettingsRepository) *DemoUsecase {
	return &DemoUsecase{repo: repo, settings: settings}
}

// ErrDemoPin is returned when the PIN is missing or wrong. Its own error so
// the handler can answer with a code the frontend acts on — showing the PIN
// screen — rather than the one it shows for an expired session.
var ErrDemoPin = errors.New("demo pin required")

// CheckPin verifies the shared PIN in front of the Demo Center.
//
// Checked on the server, not in the page. A gate the browser enforces is a
// gate anyone can walk around by calling the API directly, and what is behind
// this one is working credentials.
func (uc *DemoUsecase) CheckPin(ctx context.Context, pin string) error {
	hash, err := uc.settings.Get(ctx, domain.SettingDemoPinHash)
	if err != nil {
		return err
	}
	if hash == "" {
		// Unset means unconfigured, not open. Serving credentials because
		// nobody has set a PIN yet would be the worst possible default.
		return fmt.Errorf("%w: no PIN is configured", ErrDemoPin)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(pin)) != nil {
		return fmt.Errorf("%w: incorrect PIN", ErrDemoPin)
	}
	return nil
}

// SetPin replaces the shared PIN. Stored hashed, so it can be changed and
// never read back.
func (uc *DemoUsecase) SetPin(ctx context.Context, pin string) error {
	pin = strings.TrimSpace(pin)
	if len(pin) < 4 {
		return fmt.Errorf("%w: the PIN must be at least 4 characters", domain.ErrInvalidInput)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash pin: %w", err)
	}
	return uc.settings.Set(ctx, domain.SettingDemoPinHash, string(hash))
}

// DemoInput carries the editable fields. Pointers on update only, so this is
// the create shape; UpdateDemoInput below is the partial one.
type DemoInput struct {
	Name        string
	Category    string
	URL         string
	Environment string
	Status      string
	Username    string
	Password    string
	Notes       string
	SortOrder   int
	Active      *bool
	CreatedBy   *uuid.UUID
}

// UpdateDemoInput is partial: an omitted field keeps its value.
type UpdateDemoInput struct {
	Name        *string
	Category    *string
	URL         *string
	Environment *string
	Status      *string
	Username    *string
	Password    *string
	Notes       *string
	SortOrder   *int
	Active      *bool
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
	if err := checkDemoLengths(in.Name, in.Category, in.URL, in.Username, in.Password); err != nil {
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
		ID:          uuid.New(),
		Name:        name,
		Category:    strings.TrimSpace(in.Category),
		Environment: strings.TrimSpace(in.Environment),
		Status:      strings.TrimSpace(in.Status),
		URL:         strings.TrimSpace(in.URL),
		Username:    in.Username,
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
	if in.Category != nil {
		d.Category = strings.TrimSpace(*in.Category)
	}
	if in.Environment != nil {
		d.Environment = strings.TrimSpace(*in.Environment)
	}
	if in.Status != nil {
		d.Status = strings.TrimSpace(*in.Status)
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
	if err := checkDemoLengths(d.Name, d.Category, d.URL, d.Username, d.Password); err != nil {
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
