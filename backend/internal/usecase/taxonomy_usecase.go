package usecase

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/wit/wit-backend/internal/domain"
)

// TaxonomyUsecase holds the rules for the master lists decks are browsed by.
type TaxonomyUsecase struct {
	repo domain.TaxonomyRepository
}

// NewTaxonomyUsecase wires a TaxonomyUsecase with its repository dependency.
func NewTaxonomyUsecase(repo domain.TaxonomyRepository) *TaxonomyUsecase {
	return &TaxonomyUsecase{repo: repo}
}

// slugRe is deliberately narrower than the column allows. The slug ends up in
// query strings, CSS class lookups and file paths in the frontend; permitting
// spaces or uppercase would make two terms that look identical behave
// differently depending on which one someone typed.
var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// hexColorRe matches the six-digit form only. Three-digit shorthand renders
// the same in a browser but not in the gradient string the cards build.
var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

const maxTermTitle = 120

// TermInput carries the editable fields of a term. Slug is separate because it
// is the identity, supplied on create and never changed after.
type TermInput struct {
	Title     string
	SortOrder int
	Active    *bool
	Accent    string
	Secondary string
}

func (uc *TaxonomyUsecase) List(ctx context.Context, kind domain.TaxonomyKind, activeOnly bool) ([]*domain.TaxonomyTerm, error) {
	return uc.repo.List(ctx, domain.TaxonomyFilter{Kind: kind, ActiveOnly: activeOnly})
}

func (uc *TaxonomyUsecase) Get(ctx context.Context, kind domain.TaxonomyKind, slug string) (*domain.TaxonomyTerm, error) {
	return uc.repo.Get(ctx, kind, strings.TrimSpace(slug))
}

// Unknown lists values decks use that no term defines.
func (uc *TaxonomyUsecase) Unknown(ctx context.Context, kind domain.TaxonomyKind) ([]domain.UnknownTaxonomyValue, error) {
	return uc.repo.Unknown(ctx, kind)
}

func (uc *TaxonomyUsecase) Create(ctx context.Context, kind domain.TaxonomyKind, slug string, in TermInput) (*domain.TaxonomyTerm, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if !slugRe.MatchString(slug) {
		return nil, fmt.Errorf("%w: slug must be lowercase letters, digits and hyphens", domain.ErrInvalidInput)
	}
	title, err := validTitle(in.Title)
	if err != nil {
		return nil, err
	}
	accent, secondary, err := validColors(in.Accent, in.Secondary)
	if err != nil {
		return nil, err
	}

	// A new term goes to the end of its list unless placed explicitly. Landing
	// silently at position zero would reorder the navigation of a site nobody
	// meant to touch.
	order := in.SortOrder
	if order == 0 {
		existing, err := uc.repo.List(ctx, domain.TaxonomyFilter{Kind: kind})
		if err != nil {
			return nil, err
		}
		for _, t := range existing {
			if t.SortOrder >= order {
				order = t.SortOrder + 10
			}
		}
	}

	term := &domain.TaxonomyTerm{
		Kind:      kind,
		Slug:      slug,
		Title:     title,
		SortOrder: order,
		Active:    in.Active == nil || *in.Active,
		Accent:    accent,
		Secondary: secondary,
	}
	if err := uc.repo.Create(ctx, term); err != nil {
		return nil, err
	}
	return uc.repo.Get(ctx, kind, slug)
}

func (uc *TaxonomyUsecase) Update(ctx context.Context, kind domain.TaxonomyKind, slug string, in TermInput) (*domain.TaxonomyTerm, error) {
	current, err := uc.repo.Get(ctx, kind, strings.TrimSpace(slug))
	if err != nil {
		return nil, err
	}

	if in.Title != "" {
		if current.Title, err = validTitle(in.Title); err != nil {
			return nil, err
		}
	}
	if in.SortOrder != 0 {
		current.SortOrder = in.SortOrder
	}
	if in.Active != nil {
		current.Active = *in.Active
	}
	if in.Accent != "" || in.Secondary != "" {
		if current.Accent, current.Secondary, err = validColors(in.Accent, in.Secondary); err != nil {
			return nil, err
		}
	}

	if err := uc.repo.Update(ctx, current); err != nil {
		return nil, err
	}
	return uc.repo.Get(ctx, kind, current.Slug)
}

// Delete removes a term, but only while nothing points at it.
//
// The columns decks store these in are plain text with no foreign key, so the
// database would happily delete a term 300 decks refer to and leave every one
// of them unreachable from the filter that used to find them. Retiring
// (active=false) is the reversible way to take something out of circulation,
// and the error says so.
func (uc *TaxonomyUsecase) Delete(ctx context.Context, kind domain.TaxonomyKind, slug string) error {
	slug = strings.TrimSpace(slug)
	term, err := uc.repo.Get(ctx, kind, slug)
	if err != nil {
		return err
	}
	if term.DeckCount > 0 {
		return fmt.Errorf("%w: %d deck(s) still use %q — retire it instead, or move them first",
			domain.ErrConflict, term.DeckCount, slug)
	}
	return uc.repo.Delete(ctx, kind, slug)
}

func validTitle(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", fmt.Errorf("%w: title is required", domain.ErrInvalidInput)
	}
	if len(s) > maxTermTitle {
		return "", fmt.Errorf("%w: title must be at most %d characters", domain.ErrInvalidInput, maxTermTitle)
	}
	return s, nil
}

func validColors(accent, secondary string) (string, string, error) {
	accent, secondary = strings.TrimSpace(accent), strings.TrimSpace(secondary)
	for _, c := range []string{accent, secondary} {
		if c != "" && !hexColorRe.MatchString(c) {
			return "", "", fmt.Errorf("%w: colour must be #rrggbb", domain.ErrInvalidInput)
		}
	}
	// The industry cards build a two-stop gradient. One colour without the
	// other produces a gradient from a colour to nothing, which renders as a
	// flat black card rather than an obvious mistake.
	if (accent == "") != (secondary == "") {
		return "", "", fmt.Errorf("%w: accent and secondary must be set together", domain.ErrInvalidInput)
	}
	return accent, secondary, nil
}
