package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// DeckRepository is the pgx-backed implementation of domain.DeckRepository.
type DeckRepository struct {
	pool *pgxpool.Pool
}

// NewDeckRepository constructs a DeckRepository over the given pool.
func NewDeckRepository(pool *pgxpool.Pool) *DeckRepository {
	return &DeckRepository{pool: pool}
}

// Ensure interface compliance at compile time.
var _ domain.DeckRepository = (*DeckRepository)(nil)

const deckColumns = `id, title, subtitle, author, year, category, industry, tags,
	source_type, source_value, description, featured, view_count, created_at, updated_at`

func scanDeck(row pgx.Row) (*domain.Deck, error) {
	var d domain.Deck
	if err := row.Scan(
		&d.ID, &d.Title, &d.Subtitle, &d.Author, &d.Year, &d.Category, &d.Industry, &d.Tags,
		&d.Source.Type, &d.Source.Value, &d.Description, &d.Featured, &d.ViewCount,
		&d.CreatedAt, &d.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if d.Tags == nil {
		d.Tags = []string{}
	}
	return &d, nil
}

func (r *DeckRepository) Create(ctx context.Context, d *domain.Deck) error {
	const q = `
		INSERT INTO decks (id, title, subtitle, author, year, category, industry, tags,
			source_type, source_value, description, featured, view_count, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`
	_, err := r.pool.Exec(ctx, q,
		d.ID, d.Title, d.Subtitle, d.Author, d.Year, d.Category, d.Industry, d.Tags,
		d.Source.Type, d.Source.Value, d.Description, d.Featured, d.ViewCount,
		d.CreatedAt, d.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert deck: %w", mapWriteErr(err))
	}
	return nil
}

func (r *DeckRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Deck, error) {
	q := `SELECT ` + deckColumns + ` FROM decks WHERE id = $1`
	d, err := scanDeck(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: deck %s", domain.ErrNotFound, id)
		}
		return nil, fmt.Errorf("query deck by id: %w", err)
	}
	return d, nil
}

func (r *DeckRepository) List(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, error) {
	var (
		conds []string
		args  []any
		i     = 1
	)

	if f.Search != "" {
		conds = append(conds, fmt.Sprintf(
			"(title ILIKE $%d OR subtitle ILIKE $%d OR author ILIKE $%d OR description ILIKE $%d)",
			i, i, i, i))
		args = append(args, "%"+f.Search+"%")
		i++
	}
	if f.Category != "" {
		conds = append(conds, fmt.Sprintf("category = $%d", i))
		args = append(args, f.Category)
		i++
	}
	if f.Industry != "" {
		conds = append(conds, fmt.Sprintf("industry = $%d", i))
		args = append(args, f.Industry)
		i++
	}
	if f.SourceType != "" {
		conds = append(conds, fmt.Sprintf("source_type = $%d", i))
		args = append(args, f.SourceType)
		i++
	}
	if f.Featured != nil {
		conds = append(conds, fmt.Sprintf("featured = $%d", i))
		args = append(args, *f.Featured)
		i++
	}

	q := `SELECT ` + deckColumns + ` FROM decks`
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	q += " ORDER BY created_at DESC"

	if f.Limit > 0 {
		q += fmt.Sprintf(" LIMIT $%d", i)
		args = append(args, f.Limit)
		i++
	}
	if f.Offset > 0 {
		q += fmt.Sprintf(" OFFSET $%d", i)
		args = append(args, f.Offset)
		i++
	}

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query decks: %w", err)
	}
	defer rows.Close()

	var decks []*domain.Deck
	for rows.Next() {
		d, err := scanDeck(rows)
		if err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		decks = append(decks, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate decks: %w", err)
	}
	return decks, nil
}

func (r *DeckRepository) Update(ctx context.Context, d *domain.Deck) error {
	const q = `
		UPDATE decks
		SET title = $2, subtitle = $3, author = $4, year = $5, category = $6, industry = $7,
			tags = $8, source_type = $9, source_value = $10, description = $11, featured = $12,
			updated_at = $13
		WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q,
		d.ID, d.Title, d.Subtitle, d.Author, d.Year, d.Category, d.Industry,
		d.Tags, d.Source.Type, d.Source.Value, d.Description, d.Featured, d.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update deck: %w", mapWriteErr(err))
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: deck %s", domain.ErrNotFound, d.ID)
	}
	return nil
}

func (r *DeckRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM decks WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("delete deck: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: deck %s", domain.ErrNotFound, id)
	}
	return nil
}

func (r *DeckRepository) IncrementViews(ctx context.Context, id uuid.UUID) (*domain.Deck, error) {
	q := `
		UPDATE decks
		SET view_count = view_count + 1, updated_at = now()
		WHERE id = $1
		RETURNING ` + deckColumns
	d, err := scanDeck(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: deck %s", domain.ErrNotFound, id)
		}
		return nil, fmt.Errorf("increment deck views: %w", err)
	}
	return d, nil
}
