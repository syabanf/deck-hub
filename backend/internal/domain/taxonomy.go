package domain

import (
	"context"
	"fmt"
	"time"
)

// TaxonomyKind is the closed set of master lists the catalog browses by. It is
// also the discriminator column, so the values here are the values stored.
type TaxonomyKind string

const (
	KindCategory TaxonomyKind = "category"
	KindIndustry TaxonomyKind = "industry"
)

// ParseTaxonomyKind maps the plural, hyphenated form used in URLs to the
// stored singular. Anything else is a 404-shaped error rather than a filter
// that silently matches nothing.
func ParseTaxonomyKind(s string) (TaxonomyKind, error) {
	switch s {
	case "categories", "category":
		return KindCategory, nil
	case "industries", "industry":
		return KindIndustry, nil
	default:
		return "", fmt.Errorf("%w: unknown taxonomy %q", ErrNotFound, s)
	}
}

// DeckColumn is the decks column this kind is stored in. Callers use it to
// build queries; it never comes from user input, so interpolating it is safe.
func (k TaxonomyKind) DeckColumn() string {
	if k == KindIndustry {
		return "industry"
	}
	return "category"
}

// TaxonomyTerm is one entry in a master list.
type TaxonomyTerm struct {
	Kind TaxonomyKind `json:"kind"`

	// Slug is what decks store. It is the identity of the term and cannot be
	// edited: changing it would leave every deck referring to a value that no
	// longer exists, with nothing to notice the break.
	Slug string `json:"slug"`

	Title     string `json:"title"`
	SortOrder int    `json:"sortOrder"`

	// Active false retires a term: decks already using it keep working, and it
	// stops being offered for new ones. This is the reversible half of delete.
	Active bool `json:"active"`

	// Gradient for the industry cards; empty for the other kinds.
	Accent    string `json:"accent"`
	Secondary string `json:"secondary"`

	// DeckCount is how many decks currently use this slug. Derived per query,
	// never stored — a cached count is a count that goes stale.
	DeckCount int `json:"deckCount"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TaxonomyFilter narrows a listing.
type TaxonomyFilter struct {
	Kind TaxonomyKind
	// ActiveOnly hides retired terms. The browse UI wants this; the admin
	// screen does not, because retiring something you cannot then see is a
	// one-way door.
	ActiveOnly bool
}

// UnknownTaxonomyValue is a value decks refer to that no term defines. These
// exist because the columns are plain text and always have been; surfacing
// them is what makes reconciling possible.
type UnknownTaxonomyValue struct {
	Value     string `json:"value"`
	DeckCount int    `json:"deckCount"`
}

// TaxonomyRepository abstracts persistence for the master lists.
type TaxonomyRepository interface {
	List(ctx context.Context, f TaxonomyFilter) ([]*TaxonomyTerm, error)
	Get(ctx context.Context, kind TaxonomyKind, slug string) (*TaxonomyTerm, error)
	Create(ctx context.Context, t *TaxonomyTerm) error
	Update(ctx context.Context, t *TaxonomyTerm) error
	Delete(ctx context.Context, kind TaxonomyKind, slug string) error

	// Exists reports whether an active term with this slug exists. Deck writes
	// use it, so it is one indexed lookup rather than a full listing.
	Exists(ctx context.Context, kind TaxonomyKind, slug string) (bool, error)

	// Unknown lists values in use with no matching term.
	Unknown(ctx context.Context, kind TaxonomyKind) ([]UnknownTaxonomyValue, error)
}
