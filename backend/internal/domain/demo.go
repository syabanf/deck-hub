package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Demo is one demo environment: where it is, and what to sign in with.
//
// Password is stored and returned as typed. Nobody authenticates against it —
// it is copied into somebody else's login form — and a hash cannot be copied.
// Everyone who can read a Demo can read its password, which is why reading
// them requires an account.
type Demo struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	Category string    `json:"category"`
	URL      string    `json:"url"`
	Username string    `json:"username"`
	Password string    `json:"password"`
	Notes    string    `json:"notes"`

	// How freely the demo may be shown, and whether it works today. Kept apart
	// from Active: "confidential" and "broken" are different problems, and a
	// single flag would answer neither question.
	Environment string `json:"environment"`
	Status      string `json:"status"`

	SortOrder int  `json:"sortOrder"`
	Active    bool `json:"active"`

	CreatedBy *uuid.UUID `json:"createdBy,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// DemoFilter narrows a listing.
type DemoFilter struct {
	Search string
	// ActiveOnly hides retired demos. The browse list wants this; the manage
	// view must not, or retiring one would hide the way back.
	ActiveOnly bool
}

// DemoRepository abstracts persistence for demos.
type DemoRepository interface {
	List(ctx context.Context, f DemoFilter) ([]*Demo, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Demo, error)
	Create(ctx context.Context, d *Demo) error
	Update(ctx context.Context, d *Demo) error
	Delete(ctx context.Context, id uuid.UUID) error
}
