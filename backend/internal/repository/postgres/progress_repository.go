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

type ProgressRepository struct {
	pool *pgxpool.Pool
}

func NewProgressRepository(pool *pgxpool.Pool) *ProgressRepository {
	return &ProgressRepository{pool: pool}
}

func (r *ProgressRepository) List(ctx context.Context, userID uuid.UUID) ([]*domain.ViewingProgress, error) {
	const q = `
		SELECT deck_id, current_slide, total_slides, viewed_at
		FROM viewing_progress
		WHERE user_id = $1
		ORDER BY viewed_at DESC, deck_id`

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("query progress: %w", err)
	}
	defer rows.Close()

	out := make([]*domain.ViewingProgress, 0)
	for rows.Next() {
		var p domain.ViewingProgress
		if err := rows.Scan(&p.DeckID, &p.CurrentSlide, &p.TotalSlides, &p.ViewedAt); err != nil {
			return nil, fmt.Errorf("scan progress: %w", err)
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

func (r *ProgressRepository) Save(ctx context.Context, userID uuid.UUID, p *domain.ViewingProgress) error {
	// viewed_at is set server-side: a client clock that is wrong or hostile
	// would otherwise control the ordering of everyone's "continue watching".
	const q = `
		INSERT INTO viewing_progress (user_id, deck_id, current_slide, total_slides, viewed_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id, deck_id) DO UPDATE
		SET current_slide = EXCLUDED.current_slide,
		    total_slides  = EXCLUDED.total_slides,
		    viewed_at     = now()`

	_, err := r.pool.Exec(ctx, q, userID, p.DeckID, p.CurrentSlide, p.TotalSlides)
	if err != nil {
		// A missing deck trips the foreign key; report it as not-found rather
		// than as an opaque server error.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return fmt.Errorf("%w: deck %s", domain.ErrNotFound, p.DeckID)
		}
		return fmt.Errorf("save progress: %w", err)
	}
	return nil
}

func (r *ProgressRepository) Delete(ctx context.Context, userID, deckID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM viewing_progress WHERE user_id = $1 AND deck_id = $2`, userID, deckID)
	if err != nil {
		return fmt.Errorf("delete progress: %w", err)
	}
	return nil
}
