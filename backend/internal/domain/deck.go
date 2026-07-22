package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// DeckSource describes where a deck's content lives (e.g. a Google Slides URL,
// an uploaded file id, or an embed code). Type is a small enum-ish string;
// Value is the corresponding locator.
type DeckSource struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

// Deck is the core catalog entity. Field names align with the React frontend's
// deck shape so the API can back it directly.
type Deck struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Subtitle    string     `json:"subtitle"`
	Author      string     `json:"author"`
	Year        int        `json:"year"`
	Category    string     `json:"category"` // category id
	Industry    string     `json:"industry"` // industry id
	Tags        []string   `json:"tags"`
	Source      DeckSource `json:"source"`
	Description string     `json:"description"`
	Featured    bool       `json:"featured"`
	ViewCount   int        `json:"viewCount"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// DeckFilter narrows a List query. Zero values mean "no filter".
type DeckFilter struct {
	Search     string // matches title/subtitle/author/description (case-insensitive)
	Category   string
	Industry   string
	SourceType string
	Featured   *bool
	IDs        []uuid.UUID // fetch a specific set (used to hydrate favourites/history)
	Sort       DeckSort
	Limit      int
	Offset     int
}

// DeckSort is the ordering applied to a listing. Kept as a closed set so a
// caller can never inject an arbitrary ORDER BY.
type DeckSort string

const (
	SortNewest    DeckSort = "newest"
	SortOldest    DeckSort = "oldest"
	SortMostViews DeckSort = "views"
	SortTitle     DeckSort = "title"
)

// ParseDeckSort maps a query-string value to a known sort, falling back to
// newest for anything unrecognised.
func ParseDeckSort(s string) DeckSort {
	switch DeckSort(s) {
	case SortOldest:
		return SortOldest
	case SortMostViews:
		return SortMostViews
	case SortTitle:
		return SortTitle
	default:
		return SortNewest
	}
}

// DeckStats are catalog-wide aggregates. The browse UI needs a count per
// category and per industry; without this it would have to download every deck
// just to count them.
type DeckStats struct {
	Total      int
	Featured   int
	TotalViews int64
	ByCategory map[string]int
	ByIndustry map[string]int
}

// DeckRepository abstracts persistence for decks. Implementations live in the
// outer repository layer; usecases depend only on this interface.
type DeckRepository interface {
	Create(ctx context.Context, d *Deck) error
	GetByID(ctx context.Context, id uuid.UUID) (*Deck, error)
	List(ctx context.Context, f DeckFilter) ([]*Deck, error)
	Count(ctx context.Context, f DeckFilter) (int, error)
	Stats(ctx context.Context) (*DeckStats, error)
	Update(ctx context.Context, d *Deck) error
	Delete(ctx context.Context, id uuid.UUID) error
	IncrementViews(ctx context.Context, id uuid.UUID) (*Deck, error)
}
