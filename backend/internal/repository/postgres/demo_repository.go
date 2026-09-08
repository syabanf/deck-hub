package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// DemoRepository is the pgx-backed implementation of domain.DemoRepository.
type DemoRepository struct {
	pool *pgxpool.Pool
}

// NewDemoRepository constructs a DemoRepository over the given pool.
func NewDemoRepository(pool *pgxpool.Pool) *DemoRepository {
	return &DemoRepository{pool: pool}
}

var _ domain.DemoRepository = (*DemoRepository)(nil)

const demoColumns = `id, name, product, url, username, password, notes,
	sort_order, active, created_by, created_at, updated_at`

func scanDemo(row pgx.Row) (*domain.Demo, error) {
	var d domain.Demo
	err := row.Scan(&d.ID, &d.Name, &d.Product, &d.URL, &d.Username, &d.Password,
		&d.Notes, &d.SortOrder, &d.Active, &d.CreatedBy, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DemoRepository) List(ctx context.Context, f domain.DemoFilter) ([]*domain.Demo, error) {
	// Search escapes its own wildcards: % and _ are ILIKE operators, and a
	// search for "%" that matched everything was a real bug in the deck
	// listing before it did the same.
	q := `SELECT ` + demoColumns + ` FROM demos
	       WHERE ($1::bool IS NOT TRUE OR active)
	         AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR product ILIKE '%' || $2 || '%')
	       ORDER BY sort_order, name, id`

	rows, err := r.pool.Query(ctx, q, f.ActiveOnly, escapeLike(f.Search))
	if err != nil {
		return nil, fmt.Errorf("query demos: %w", err)
	}
	defer rows.Close()

	out := make([]*domain.Demo, 0)
	for rows.Next() {
		d, err := scanDemo(rows)
		if err != nil {
			return nil, fmt.Errorf("scan demo: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate demos: %w", err)
	}
	return out, nil
}

func (r *DemoRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Demo, error) {
	q := `SELECT ` + demoColumns + ` FROM demos WHERE id = $1`
	d, err := scanDemo(r.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("%w: demo %s", domain.ErrNotFound, id)
	}
	if err != nil {
		return nil, fmt.Errorf("get demo: %w", err)
	}
	return d, nil
}

func (r *DemoRepository) Create(ctx context.Context, d *domain.Demo) error {
	const q = `
		INSERT INTO demos (id, name, product, url, username, password, notes,
			sort_order, active, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	_, err := r.pool.Exec(ctx, q, d.ID, d.Name, d.Product, d.URL, d.Username,
		d.Password, d.Notes, d.SortOrder, d.Active, d.CreatedBy, d.CreatedAt, d.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert demo: %w", err)
	}
	return nil
}

func (r *DemoRepository) Update(ctx context.Context, d *domain.Demo) error {
	const q = `
		UPDATE demos
		   SET name = $2, product = $3, url = $4, username = $5, password = $6,
		       notes = $7, sort_order = $8, active = $9, updated_at = $10
		 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, d.ID, d.Name, d.Product, d.URL, d.Username,
		d.Password, d.Notes, d.SortOrder, d.Active, d.UpdatedAt)
	if err != nil {
		return fmt.Errorf("update demo: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: demo %s", domain.ErrNotFound, d.ID)
	}
	return nil
}

func (r *DemoRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM demos WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("delete demo: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: demo %s", domain.ErrNotFound, id)
	}
	return nil
}
