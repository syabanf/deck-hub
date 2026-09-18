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
// domain interfaces.
type DeckUsecase struct {
	repo domain.DeckRepository

	// taxonomy is what turns the master lists into master data rather than a
	// list of suggestions. Required, not optional: a wiring that forgot it
	// would accept anything and nothing would say so until a deck went missing
	// from its own category.
	taxonomy domain.TaxonomyRepository
}

// NewDeckUsecase wires a DeckUsecase with its repository dependencies.
func NewDeckUsecase(repo domain.DeckRepository, taxonomy domain.TaxonomyRepository) *DeckUsecase {
	return &DeckUsecase{repo: repo, taxonomy: taxonomy}
}

// checkTerm rejects a value no active term defines.
//
// Empty passes: industry is optional, and category and source type are already
// required by validateDeckCore. Retired terms are rejected too — that is what
// retiring is for, and decks already carrying one are left alone because this
// only runs on the fields a write actually touches.
func (uc *DeckUsecase) checkTerm(ctx context.Context, kind domain.TaxonomyKind, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	ok, err := uc.taxonomy.Exists(ctx, kind, value)
	if err != nil {
		return fmt.Errorf("check %s: %w", kind, err)
	}
	if !ok {
		return fmt.Errorf("%w: no active %s %q", domain.ErrInvalidInput, kind, value)
	}
	return nil
}

// checkDeckTerms validates every taxonomy field a write is setting.
//
// Source type is checked against domain.SourceTypes rather than the database:
// it is a rendering contract the player implements, not a list anyone can add
// to. See the comment on that variable.
func (uc *DeckUsecase) checkDeckTerms(ctx context.Context, category, industry, sourceType string) error {
	if err := uc.checkTerm(ctx, domain.KindCategory, category); err != nil {
		return err
	}
	if err := uc.checkTerm(ctx, domain.KindIndustry, industry); err != nil {
		return err
	}
	if sourceType != "" && !domain.ValidSourceType(sourceType) {
		return fmt.Errorf("%w: source type %q is not one of %v",
			domain.ErrInvalidInput, sourceType, domain.SourceTypes)
	}
	return nil
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
	CoverImage  string
	Featured    bool

	// Images are the photos of a 'photos' deck, in the order they should
	// be shown. Ignored for every other type.
	Images []DeckImageInput

	// CreatedBy is set from the token by the handler, never from the request
	// body. A client naming its own author would make the record worthless.
	CreatedBy *uuid.UUID
}

// DeckImageInput is one photo as the client sends it: where the file landed
// after upload, and what it was called before it got a UUID for a name.
type DeckImageInput struct {
	URL  string
	Name string
}

// maxDeckImages caps one gallery.
//
// Not a storage limit — the files are already on disk by the time this runs —
// but a rendering one: the player loads the list up front, and a "deck" of a
// thousand photos is an archive that wants a different screen than this.
const maxDeckImages = 200

// prepareImages validates and normalises a photo list.
//
// Every URL goes through the same check a deck source does: these end up in an
// <img src>, and a `javascript:` there is script on this application's origin.
func prepareImages(in []DeckImageInput) ([]domain.DeckImage, error) {
	if len(in) > maxDeckImages {
		return nil, fmt.Errorf("%w: a photo deck holds at most %d photos", domain.ErrInvalidInput, maxDeckImages)
	}
	out := make([]domain.DeckImage, 0, len(in))
	for i, img := range in {
		url, err := normalizeLink(fmt.Sprintf("photo %d", i+1), img.URL)
		if err != nil {
			return nil, err
		}
		if url == "" {
			return nil, fmt.Errorf("%w: photo %d has no file", domain.ErrInvalidInput, i+1)
		}
		out = append(out, domain.DeckImage{URL: url, Name: strings.TrimSpace(img.Name)})
	}
	return out, nil
}

// SourceTypePhotos is the type whose content is the image list rather than
// Source.Value. Named rather than repeated, because the rule "this one type
// behaves differently" is easy to apply in three places and forget in a
// fourth.
const SourceTypePhotos = "photos"

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
	images, err := prepareImages(in.Images)
	if err != nil {
		return nil, err
	}
	// A photo deck's content is the list, so its Source.Value is derived rather
	// than sent: the first photo. That keeps every caller that only wants
	// "something to show" — a cover, a share preview, the catalog table —
	// working without knowing this type exists.
	//
	// Done before validateDeckCore, which insists on a source value and would
	// otherwise reject a perfectly complete gallery for not repeating itself.
	if in.Source.Type == SourceTypePhotos {
		if len(images) == 0 {
			return nil, fmt.Errorf("%w: a photo deck needs at least one photo", domain.ErrInvalidInput)
		}
		in.Source.Value = images[0].URL
	} else if len(images) > 0 {
		return nil, fmt.Errorf("%w: photos belong to a %q deck, not a %q one",
			domain.ErrInvalidInput, SourceTypePhotos, in.Source.Type)
	}

	if err := validateDeckCore(in.Title, in.Category, in.Source); err != nil {
		return nil, err
	}
	if err := uc.checkDeckTerms(ctx, in.Category, in.Industry, in.Source.Type); err != nil {
		return nil, err
	}
	// The source and the cover both end up as an href or an iframe src — see
	// normalizeLink for what that has to be protected from.
	value, err := normalizeLink("the deck source", in.Source.Value)
	if err != nil {
		return nil, err
	}
	in.Source.Value = value
	cover, err := normalizeLink("the cover image", in.CoverImage)
	if err != nil {
		return nil, err
	}
	in.CoverImage = cover

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
		CoverImage:  in.CoverImage,
		CreatedBy:   in.CreatedBy,
		Featured:    in.Featured,
		ViewCount:   0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := uc.repo.Create(ctx, d); err != nil {
		return nil, fmt.Errorf("create deck: %w", err)
	}

	if len(images) > 0 {
		if err := uc.repo.SetImages(ctx, d.ID, images); err != nil {
			return nil, fmt.Errorf("attach deck photos: %w", err)
		}
		// Read back, so the response carries the ids and the order the database
		// settled on rather than what was asked for.
		if err := uc.attachImages(ctx, d); err != nil {
			return nil, err
		}
	}
	return d, nil
}

// attachImages fills in Images for the given decks in one query.
//
// One query for any number of decks: a listing that loaded photos per deck
// would be the classic N+1, and the catalog table asks for fifty at a time.
func (uc *DeckUsecase) attachImages(ctx context.Context, decks ...*domain.Deck) error {
	ids := make([]uuid.UUID, 0, len(decks))
	for _, d := range decks {
		// Only the type that has any. Asking about the rest would turn a page
		// of PDFs into a pointless query.
		if d != nil && d.Source.Type == SourceTypePhotos {
			ids = append(ids, d.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}

	byDeck, err := uc.repo.ImagesByDeck(ctx, ids)
	if err != nil {
		return fmt.Errorf("load deck photos: %w", err)
	}
	for _, d := range decks {
		if d != nil {
			d.Images = byDeck[d.ID]
		}
	}
	return nil
}

// GetByID returns a single deck or domain.ErrNotFound.
func (uc *DeckUsecase) GetByID(ctx context.Context, id uuid.UUID) (*domain.Deck, error) {
	d, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get deck: %w", err)
	}
	if err := uc.attachImages(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

// List returns decks matching the filter.
// Paging bounds. These live here rather than in the HTTP layer so every caller
// gets them — an unbounded list is a resource limit, not a formatting choice.
//
// Measured at 73k decks: unbounded served 25.1 MB per request at 34 rps, while
// a 50-row page served 0.017 MB at 17857 rps.
const (
	DefaultDeckLimit = 50
	MaxDeckLimit     = 200
)

// clampPaging applies the default and ceiling. A caller asking for everything
// (limit 0) gets the default page, not the whole table.
func clampPaging(f domain.DeckFilter) domain.DeckFilter {
	if f.Limit <= 0 {
		f.Limit = DefaultDeckLimit
	}
	if f.Limit > MaxDeckLimit {
		f.Limit = MaxDeckLimit
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	return f
}

func (uc *DeckUsecase) List(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, error) {
	decks, err := uc.repo.List(ctx, clampPaging(f))
	if err != nil {
		return nil, fmt.Errorf("list decks: %w", err)
	}
	if err := uc.attachImages(ctx, decks...); err != nil {
		return nil, err
	}
	return decks, nil
}

// ListPage returns one page plus the total number of matches, so a client can
// tell whether more pages exist without asking for them.
func (uc *DeckUsecase) ListPage(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, int, error) {
	f = clampPaging(f)

	decks, err := uc.repo.List(ctx, f)
	if err != nil {
		return nil, 0, fmt.Errorf("list decks: %w", err)
	}
	if err := uc.attachImages(ctx, decks...); err != nil {
		return nil, 0, err
	}

	// Skip the count query when the first page already holds everything —
	// the common case for a filtered browse, and it halves the round trips.
	if f.Offset == 0 && len(decks) < f.Limit {
		return decks, len(decks), nil
	}

	total, err := uc.repo.Count(ctx, f)
	if err != nil {
		return nil, 0, fmt.Errorf("count decks: %w", err)
	}
	return decks, total, nil
}

// Stats returns catalog-wide aggregates for the browse UI.
func (uc *DeckUsecase) Stats(ctx context.Context) (*domain.DeckStats, error) {
	stats, err := uc.repo.Stats(ctx)
	if err != nil {
		return nil, fmt.Errorf("deck stats: %w", err)
	}
	return stats, nil
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
	CoverImage  *string
	Featured    *bool

	// Images replaces the whole photo list when supplied. A pointer, so an
	// omitted field leaves the gallery alone while an empty list is a real
	// edit — somebody clearing it out.
	Images *[]DeckImageInput
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
		value, err := normalizeLink("the deck source", in.Source.Value)
		if err != nil {
			return nil, err
		}
		in.Source.Value = value
		d.Source = *in.Source
	}
	if in.Description != nil {
		d.Description = *in.Description
	}
	if in.CoverImage != nil {
		// Empty is meaningful: it clears an uploaded cover and hands the deck
		// back to the generated artwork.
		cover, err := normalizeLink("the cover image", *in.CoverImage)
		if err != nil {
			return nil, err
		}
		d.CoverImage = cover
	}

	// Only the fields this request set. A deck that already carries a retired
	// term keeps it through an unrelated edit; changing it means opting into
	// the current lists.
	var newCategory, newIndustry, newSourceType string
	if in.Category != nil {
		newCategory = d.Category
	}
	if in.Industry != nil {
		newIndustry = d.Industry
	}
	if in.Source != nil {
		newSourceType = d.Source.Type
	}
	if err := uc.checkDeckTerms(ctx, newCategory, newIndustry, newSourceType); err != nil {
		return nil, err
	}
	if in.Featured != nil {
		d.Featured = *in.Featured
	}

	d.UpdatedAt = time.Now().UTC()
	if err := uc.repo.Update(ctx, d); err != nil {
		return nil, fmt.Errorf("update deck: %w", err)
	}

	if in.Images != nil {
		images, err := prepareImages(*in.Images)
		if err != nil {
			return nil, err
		}
		if d.Source.Type != SourceTypePhotos {
			return nil, fmt.Errorf("%w: photos belong to a %q deck, not a %q one",
				domain.ErrInvalidInput, SourceTypePhotos, d.Source.Type)
		}
		if len(images) == 0 {
			return nil, fmt.Errorf("%w: a photo deck needs at least one photo", domain.ErrInvalidInput)
		}
		if err := uc.repo.SetImages(ctx, d.ID, images); err != nil {
			return nil, fmt.Errorf("replace deck photos: %w", err)
		}
		// The first photo is the source value, so reordering the gallery has to
		// move it too — otherwise the cover keeps pointing at a photo that is
		// no longer the first one.
		d.Source.Value = images[0].URL
		if err := uc.repo.Update(ctx, d); err != nil {
			return nil, fmt.Errorf("update deck source after photo edit: %w", err)
		}
	}

	if err := uc.attachImages(ctx, d); err != nil {
		return nil, err
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

// CountByCreator returns how many decks an account has added. What a profile
// page reports about itself.
func (uc *DeckUsecase) CountByCreator(ctx context.Context, userID uuid.UUID) (int, error) {
	n, err := uc.repo.CountByCreator(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("count decks: %w", err)
	}
	return n, nil
}
