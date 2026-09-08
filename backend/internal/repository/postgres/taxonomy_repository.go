package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// TaxonomyRepository is the pgx-backed implementation of
// domain.TaxonomyRepository.
type TaxonomyRepository struct {
	pool *pgxpool.Pool
}

// NewTaxonomyRepository constructs a TaxonomyRepository over the given pool.
func NewTaxonomyRepository(pool *pgxpool.Pool) *TaxonomyRepository {
	return &TaxonomyRepository{pool: pool}
}

var _ domain.TaxonomyRepository = (*TaxonomyRepository)(nil)

// Qualified with the alias the count subquery needs; the plain list would be
// ambiguous against decks in the same statement.
const taxonomyColumns = `t.kind, t.slug, t.title, t.sort_order, t.active, t.accent, t.secondary, t.created_at, t.updated_at`

// List returns the terms of one kind, each with the number of decks currently
// using it.
//
// The deck count is a correlated subquery rather than a join: the column it
// counts differs per kind, and a join would need the same switch anyway while
// also collapsing terms nothing uses. kind.DeckColumn() is a constant chosen
// from a closed set, never caller input, so interpolating it is safe.
func (r *TaxonomyRepository) List(ctx context.Context, f domain.TaxonomyFilter) ([]*domain.TaxonomyTerm, error) {
	q := fmt.Sprintf(`
		SELECT %s,
		       (SELECT count(*) FROM decks d WHERE d.%s = t.slug) AS deck_count
		  FROM taxonomy_terms t
		 WHERE kind = $1
		   AND ($2::bool IS NOT TRUE OR active)
		 ORDER BY sort_order, slug`,
		taxonomyColumns, f.Kind.DeckColumn())

	rows, err := r.pool.Query(ctx, q, f.Kind, f.ActiveOnly)
	if err != nil {
		return nil, fmt.Errorf("query taxonomy: %w", err)
	}
	defer rows.Close()

	terms := make([]*domain.TaxonomyTerm, 0)
	for rows.Next() {
		var t domain.TaxonomyTerm
		if err := rows.Scan(&t.Kind, &t.Slug, &t.Title, &t.SortOrder, &t.Active,
			&t.Accent, &t.Secondary, &t.CreatedAt, &t.UpdatedAt, &t.DeckCount); err != nil {
			return nil, fmt.Errorf("scan taxonomy: %w", err)
		}
		terms = append(terms, &t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate taxonomy: %w", err)
	}
	return terms, nil
}

func (r *TaxonomyRepository) Get(ctx context.Context, kind domain.TaxonomyKind, slug string) (*domain.TaxonomyTerm, error) {
	q := fmt.Sprintf(`
		SELECT %s,
		       (SELECT count(*) FROM decks d WHERE d.%s = t.slug) AS deck_count
		  FROM taxonomy_terms t
		 WHERE kind = $1 AND slug = $2`,
		taxonomyColumns, kind.DeckColumn())

	var t domain.TaxonomyTerm
	err := r.pool.QueryRow(ctx, q, kind, slug).Scan(&t.Kind, &t.Slug, &t.Title,
		&t.SortOrder, &t.Active, &t.Accent, &t.Secondary, &t.CreatedAt, &t.UpdatedAt, &t.DeckCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("%w: no %s %q", domain.ErrNotFound, kind, slug)
	}
	if err != nil {
		return nil, fmt.Errorf("get taxonomy term: %w", err)
	}
	return &t, nil
}

func (r *TaxonomyRepository) Create(ctx context.Context, t *domain.TaxonomyTerm) error {
	const q = `
		INSERT INTO taxonomy_terms (kind, slug, title, sort_order, active, accent, secondary)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, q, t.Kind, t.Slug, t.Title, t.SortOrder,
		t.Active, t.Accent, t.Secondary).Scan(&t.CreatedAt, &t.UpdatedAt)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return fmt.Errorf("%w: %s %q already exists", domain.ErrConflict, t.Kind, t.Slug)
	}
	if err != nil {
		return fmt.Errorf("insert taxonomy term: %w", err)
	}
	return nil
}

// Update changes everything except the slug, which is the term's identity and
// the value decks store.
func (r *TaxonomyRepository) Update(ctx context.Context, t *domain.TaxonomyTerm) error {
	const q = `
		UPDATE taxonomy_terms
		   SET title = $3, sort_order = $4, active = $5, accent = $6,
		       secondary = $7, updated_at = now()
		 WHERE kind = $1 AND slug = $2
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, q, t.Kind, t.Slug, t.Title, t.SortOrder,
		t.Active, t.Accent, t.Secondary).Scan(&t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("%w: no %s %q", domain.ErrNotFound, t.Kind, t.Slug)
	}
	if err != nil {
		return fmt.Errorf("update taxonomy term: %w", err)
	}
	return nil
}

func (r *TaxonomyRepository) Delete(ctx context.Context, kind domain.TaxonomyKind, slug string) error {
	const q = `DELETE FROM taxonomy_terms WHERE kind = $1 AND slug = $2`
	tag, err := r.pool.Exec(ctx, q, kind, slug)
	if err != nil {
		return fmt.Errorf("delete taxonomy term: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: no %s %q", domain.ErrNotFound, kind, slug)
	}
	return nil
}

func (r *TaxonomyRepository) Exists(ctx context.Context, kind domain.TaxonomyKind, slug string) (bool, error) {
	const q = `SELECT true FROM taxonomy_terms WHERE kind = $1 AND slug = $2 AND active`
	var ok bool
	err := r.pool.QueryRow(ctx, q, kind, slug).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check taxonomy term: %w", err)
	}
	return ok, nil
}

// Unknown lists values decks refer to that no term of this kind defines.
func (r *TaxonomyRepository) Unknown(ctx context.Context, kind domain.TaxonomyKind) ([]domain.UnknownTaxonomyValue, error) {
	q := fmt.Sprintf(`
		SELECT d.%[1]s AS value, count(*) AS deck_count
		  FROM decks d
		 WHERE d.%[1]s <> ''
		   AND NOT EXISTS (
		       SELECT 1 FROM taxonomy_terms t
		        WHERE t.kind = $1 AND t.slug = d.%[1]s)
		 GROUP BY d.%[1]s
		 ORDER BY count(*) DESC, d.%[1]s`, kind.DeckColumn())

	rows, err := r.pool.Query(ctx, q, kind)
	if err != nil {
		return nil, fmt.Errorf("query unknown taxonomy values: %w", err)
	}
	defer rows.Close()

	out := make([]domain.UnknownTaxonomyValue, 0)
	for rows.Next() {
		var v domain.UnknownTaxonomyValue
		if err := rows.Scan(&v.Value, &v.DeckCount); err != nil {
			return nil, fmt.Errorf("scan unknown taxonomy value: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate unknown taxonomy values: %w", err)
	}
	return out, nil
}
