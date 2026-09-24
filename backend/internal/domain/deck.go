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
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`

	// Slug is the deck's readable name in a share link — /d/<slug>. Optional:
	// empty means the deck is only addressable by id, which is how every deck
	// added before slugs existed stays reachable.
	//
	// The current one. Renaming does not retire the old name; see
	// DeckRepository.ClaimSlug.
	Slug string `json:"slug,omitempty"`

	Subtitle    string     `json:"subtitle"`
	Author      string     `json:"author"`
	Year        int        `json:"year"`
	Category    string     `json:"category"` // category id
	Industry    string     `json:"industry"` // industry id
	Tags        []string   `json:"tags"`
	Source      DeckSource `json:"source"`
	Description string     `json:"description"`

	// CoverImage is an optional server-relative upload path. Empty means the
	// frontend generates artwork from the deck id, which is the default and
	// looks deliberate rather than missing.
	CoverImage string `json:"coverImage"`

	// Images are the photos of a 'photos' deck, in order. Empty for every
	// other type. Loaded alongside the deck rather than fetched separately:
	// a gallery with no photos is not a thing anyone wants to render.
	Images []DeckImage `json:"images,omitempty"`

	// CreatedBy is the account that added the deck, separate from Author,
	// which is free text naming whoever made the presentation. Nil for every
	// deck added before this was recorded — "unknown" rather than a guess.
	CreatedBy *uuid.UUID `json:"createdBy,omitempty"`
	Featured  bool       `json:"featured"`
	ViewCount int        `json:"viewCount"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// DeckImage is one photo in a 'photos' deck.
type DeckImage struct {
	ID  uuid.UUID `json:"id"`
	URL string    `json:"url"`
	// Name is what the file was called when it was uploaded. The stored name is
	// a UUID, so this is the only readable one there is — and it is what a
	// download is offered under.
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
}

// SourceTypes are the kinds of content the player can actually render.
//
// Deliberately not master data. A category is a label — add one and the
// catalog files decks under it straight away. A source type is a rendering
// contract: 'pdf' means pdf.js, 'video' means the media element, 'gslides' and
// 'embed' mean an iframe with their own URL rules, 'url' means a plain link.
// Adding a sixth through an admin screen would only produce decks nothing
// knows how to play, and the failure would surface at playback to a viewer
// instead of at creation to whoever caused it.
//
// 'photos' is the odd one: its content is not one locator but a list, kept in
// deck_images. Source.Value still holds the first photo, so everything that
// only wants something to show — a cover, a share preview — keeps working
// without knowing this type exists.
//
// Changing this list means changing src/lib/embed.js and DeckPlayer with it,
// which is why it sits in code rather than in a table.
var SourceTypes = []string{"pdf", "gslides", "url", "video", "embed", "photos"}

// ValidSourceType reports whether the player has a branch for this type.
func ValidSourceType(s string) bool {
	for _, t := range SourceTypes {
		if t == s {
			return true
		}
	}
	return false
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
	// ByTag counts every distinct tag in the catalog. Tags are free text,
	// so this is the only place the real ones can be listed from.
	ByTag map[string]int
}

// DeckRepository abstracts persistence for decks. Implementations live in the
// outer repository layer; usecases depend only on this interface.
type DeckRepository interface {
	Create(ctx context.Context, d *Deck) error
	GetByID(ctx context.Context, id uuid.UUID) (*Deck, error)

	// GetBySlug resolves a readable share link, current name or retired one.
	// A slug a deck used to have still points at that deck — see ClaimSlug —
	// so a link sent to a client months ago keeps opening after a rename.
	GetBySlug(ctx context.Context, slug string) (*Deck, error)

	// ClaimSlug makes slug the deck's current name and records that this deck
	// has held it. Every name a deck has ever had stays claimed, so releasing
	// one is not something a rename can do by accident; ErrConflict means the
	// name belongs to a different deck, now or in the past.
	//
	// An empty slug clears the current name without releasing the history.
	ClaimSlug(ctx context.Context, deckID uuid.UUID, slug string) error

	List(ctx context.Context, f DeckFilter) ([]*Deck, error)
	// SetImages replaces a deck's photo list wholesale. A replace rather
	// than add/remove/reorder: the client edits the list as a list, and
	// three endpoints to express one edit is three chances to disagree
	// about the order.
	SetImages(ctx context.Context, deckID uuid.UUID, images []DeckImage) error
	// ImagesByDeck loads photos for the given decks, keyed by deck id, so a
	// listing costs one query rather than one per deck.
	ImagesByDeck(ctx context.Context, deckIDs []uuid.UUID) (map[uuid.UUID][]DeckImage, error)
	Count(ctx context.Context, f DeckFilter) (int, error)
	Stats(ctx context.Context) (*DeckStats, error)
	Update(ctx context.Context, d *Deck) error
	Delete(ctx context.Context, id uuid.UUID) error
	IncrementViews(ctx context.Context, id uuid.UUID) (*Deck, error)

	// CountByCreator is what a profile page reports. A separate query rather
	// than a filter on List: the answer is one number, and listing every deck
	// to count them is the shape of a problem that only shows up later.
	CountByCreator(ctx context.Context, userID uuid.UUID) (int, error)
}
