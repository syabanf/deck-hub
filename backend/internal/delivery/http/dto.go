package http

import (
	"time"

	"github.com/wit/wit-backend/internal/domain"
)

// ----- User DTOs -----

// userResponse is the public representation of a user. It deliberately omits
// PasswordHash so the bcrypt hash can never leak into a response.
type userResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
	// Absent while an address is unproven. Lets the admin list show who is
	// still pending without a second request.
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

func toUserResponse(u *domain.User) userResponse {
	return userResponse{
		ID:              u.ID.String(),
		Name:            u.Name,
		Email:           u.Email,
		Role:            string(u.Role),
		Status:          string(u.Status),
		EmailVerifiedAt: u.EmailVerifiedAt,
		CreatedAt:       u.CreatedAt,
		UpdatedAt:       u.UpdatedAt,
	}
}

func toUserResponses(users []*domain.User) []userResponse {
	out := make([]userResponse, 0, len(users))
	for _, u := range users {
		out = append(out, toUserResponse(u))
	}
	return out
}

type createUserRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

// updateUserRequest uses pointers so omitted fields are distinguishable from
// zero values and left unchanged.
type updateUserRequest struct {
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Password *string `json:"password"`
	Role     *string `json:"role"`
	Status   *string `json:"status"`
}

// ----- Auth DTOs -----

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

// ----- Deck DTOs -----

type deckSourceDTO struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type deckResponse struct {
	ID          string        `json:"id"`
	Title       string        `json:"title"`
	Subtitle    string        `json:"subtitle"`
	Author      string        `json:"author"`
	Year        int           `json:"year"`
	Category    string        `json:"category"`
	Industry    string        `json:"industry"`
	Tags        []string      `json:"tags"`
	Source      deckSourceDTO `json:"source"`
	Description string        `json:"description"`
	CoverImage  string        `json:"coverImage"`
	Featured    bool          `json:"featured"`
	ViewCount   int           `json:"viewCount"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}

func toDeckResponse(d *domain.Deck) deckResponse {
	tags := d.Tags
	if tags == nil {
		tags = []string{}
	}
	return deckResponse{
		ID:          d.ID.String(),
		Title:       d.Title,
		Subtitle:    d.Subtitle,
		Author:      d.Author,
		Year:        d.Year,
		Category:    d.Category,
		Industry:    d.Industry,
		Tags:        tags,
		Source:      deckSourceDTO{Type: d.Source.Type, Value: d.Source.Value},
		Description: d.Description,
		CoverImage:  d.CoverImage,
		Featured:    d.Featured,
		ViewCount:   d.ViewCount,
		CreatedAt:   d.CreatedAt,
		UpdatedAt:   d.UpdatedAt,
	}
}

func toDeckResponses(decks []*domain.Deck) []deckResponse {
	out := make([]deckResponse, 0, len(decks))
	for _, d := range decks {
		out = append(out, toDeckResponse(d))
	}
	return out
}

type createDeckRequest struct {
	Title       string        `json:"title"`
	Subtitle    string        `json:"subtitle"`
	Author      string        `json:"author"`
	Year        int           `json:"year"`
	Category    string        `json:"category"`
	Industry    string        `json:"industry"`
	Tags        []string      `json:"tags"`
	Source      deckSourceDTO `json:"source"`
	Description string        `json:"description"`
	CoverImage  string        `json:"coverImage"`
	Featured    bool          `json:"featured"`
}

// updateDeckRequest uses pointers for partial updates.
type updateDeckRequest struct {
	Title       *string        `json:"title"`
	Subtitle    *string        `json:"subtitle"`
	Author      *string        `json:"author"`
	Year        *int           `json:"year"`
	Category    *string        `json:"category"`
	Industry    *string        `json:"industry"`
	Tags        *[]string      `json:"tags"`
	Source      *deckSourceDTO `json:"source"`
	Description *string        `json:"description"`
	CoverImage  *string        `json:"coverImage"`
	Featured    *bool          `json:"featured"`
}

// ----- taxonomy -----

// termResponse is one entry in a master list. deckCount rides along because
// every screen that shows these also needs to know what is safe to remove.
type termResponse struct {
	Kind      string `json:"kind"`
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	SortOrder int    `json:"sortOrder"`
	Active    bool   `json:"active"`
	Accent    string `json:"accent"`
	Secondary string `json:"secondary"`
	DeckCount int    `json:"deckCount"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func toTermResponse(t *domain.TaxonomyTerm) termResponse {
	return termResponse{
		Kind:      string(t.Kind),
		Slug:      t.Slug,
		Title:     t.Title,
		SortOrder: t.SortOrder,
		Active:    t.Active,
		Accent:    t.Accent,
		Secondary: t.Secondary,
		DeckCount: t.DeckCount,
		CreatedAt: t.CreatedAt.UTC().Format(time.RFC3339Nano),
		UpdatedAt: t.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func toTermResponses(terms []*domain.TaxonomyTerm) []termResponse {
	out := make([]termResponse, 0, len(terms))
	for _, t := range terms {
		out = append(out, toTermResponse(t))
	}
	return out
}

// createTermRequest carries the slug because it is chosen once, on create.
type createTermRequest struct {
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	SortOrder int    `json:"sortOrder"`
	Active    *bool  `json:"active"`
	Accent    string `json:"accent"`
	Secondary string `json:"secondary"`
}

// updateTermRequest has no slug: renaming it would orphan every deck storing
// the old value.
type updateTermRequest struct {
	Title     string `json:"title"`
	SortOrder int    `json:"sortOrder"`
	Active    *bool  `json:"active"`
	Accent    string `json:"accent"`
	Secondary string `json:"secondary"`
}
