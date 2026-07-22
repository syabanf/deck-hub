package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// foreignKeyViolation is the PostgreSQL SQLSTATE raised when favoriting a deck
// id that doesn't exist.
const foreignKeyViolation = "23503"

// FavoriteRepository is the pgx-backed implementation of
// domain.FavoriteRepository.
type FavoriteRepository struct {
	pool *pgxpool.Pool
}

// NewFavoriteRepository constructs a FavoriteRepository over the given pool.
func NewFavoriteRepository(pool *pgxpool.Pool) *FavoriteRepository {
	return &FavoriteRepository{pool: pool}
}

var _ domain.FavoriteRepository = (*FavoriteRepository)(nil)

func (r *FavoriteRepository) ListDeckIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	const q = `SELECT deck_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("query favorites: %w", err)
	}
	defer rows.Close()

	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan favorite: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *FavoriteRepository) Add(ctx context.Context, userID, deckID uuid.UUID) error {
	const q = `
		INSERT INTO favorites (user_id, deck_id) VALUES ($1, $2)
		ON CONFLICT (user_id, deck_id) DO NOTHING`
	_, err := r.pool.Exec(ctx, q, userID, deckID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation {
			return fmt.Errorf("%w: deck %s", domain.ErrNotFound, deckID)
		}
		return fmt.Errorf("insert favorite: %w", err)
	}
	return nil
}

func (r *FavoriteRepository) Remove(ctx context.Context, userID, deckID uuid.UUID) error {
	const q = `DELETE FROM favorites WHERE user_id = $1 AND deck_id = $2`
	if _, err := r.pool.Exec(ctx, q, userID, deckID); err != nil {
		return fmt.Errorf("delete favorite: %w", err)
	}
	return nil
}
