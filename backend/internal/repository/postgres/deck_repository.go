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
	if len(f.IDs) > 0 {
		conds = append(conds, fmt.Sprintf("id = ANY($%d)", i))
		args = append(args, f.IDs)
		i++
	}

	q := `SELECT ` + deckColumns + ` FROM decks`
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	q += " ORDER BY " + orderBy(f.Sort)

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

// orderBy maps a validated DeckSort to SQL. The input is a closed set from the
// domain, so this never interpolates caller-supplied text.
//
// Every ordering is tie-broken by id: without it, rows with equal sort keys can
// come back in a different order between pages, which makes a paginated client
// skip or repeat rows.
func orderBy(s domain.DeckSort) string {
	switch s {
	case domain.SortOldest:
		return "created_at ASC, id ASC"
	case domain.SortMostViews:
		return "view_count DESC, id ASC"
	case domain.SortTitle:
		return "lower(title) ASC, id ASC"
	default:
		return "created_at DESC, id DESC"
	}
}

// Count returns how many decks match the filter, ignoring limit/offset. It is
// what lets a client know there are more pages without fetching them.
func (r *DeckRepository) Count(ctx context.Context, f domain.DeckFilter) (int, error) {
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
	if len(f.IDs) > 0 {
		conds = append(conds, fmt.Sprintf("id = ANY($%d)", i))
		args = append(args, f.IDs)
		i++
	}

	q := "SELECT count(*) FROM decks"
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}

	var n int
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("count decks: %w", err)
	}
	return n, nil
}

// Stats aggregates the whole catalog in one round trip, so the browse UI can
// show per-category and per-industry counts without downloading any decks.
func (r *DeckRepository) Stats(ctx context.Context) (*domain.DeckStats, error) {
	// One round trip for every aggregate the browse and admin screens need.
	// 'total' is computed here rather than summed from the category buckets so
	// decks with no category still count.
	const q = `
		SELECT 'category' AS kind, category AS key, count(*) AS n FROM decks GROUP BY category
		UNION ALL
		SELECT 'industry', industry, count(*) FROM decks GROUP BY industry
		UNION ALL
		SELECT 'total', '', count(*) FROM decks
		UNION ALL
		SELECT 'featured', '', count(*) FROM decks WHERE featured
		UNION ALL
		SELECT 'views', '', coalesce(sum(view_count), 0) FROM decks`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("query deck stats: %w", err)
	}
	defer rows.Close()

	out := &domain.DeckStats{
		ByCategory: map[string]int{},
		ByIndustry: map[string]int{},
	}
	for rows.Next() {
		var kind, key string
		var n int
		if err := rows.Scan(&kind, &key, &n); err != nil {
			return nil, fmt.Errorf("scan deck stats: %w", err)
		}
		switch kind {
		case "total":
			out.Total = n
		case "featured":
			out.Featured = n
		case "views":
			out.TotalViews = int64(n)
		case "category":
			// Untagged decks still count in the total; they just have no bucket.
			if key != "" {
				out.ByCategory[key] = n
			}
		case "industry":
			if key != "" {
				out.ByIndustry[key] = n
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate deck stats: %w", err)
	}
	return out, nil
}
