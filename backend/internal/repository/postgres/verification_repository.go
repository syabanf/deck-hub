package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// EmailVerificationRepository persists email-verification tokens.
type EmailVerificationRepository struct {
	pool *pgxpool.Pool
}

func NewEmailVerificationRepository(pool *pgxpool.Pool) *EmailVerificationRepository {
	return &EmailVerificationRepository{pool: pool}
}

func (r *EmailVerificationRepository) Create(ctx context.Context, t *domain.EmailVerificationToken) error {
	const q = `
		INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, created_at)
		VALUES ($1, $2, $3, $4)`
	if _, err := r.pool.Exec(ctx, q, t.TokenHash, t.UserID, t.ExpiresAt, t.CreatedAt); err != nil {
		return fmt.Errorf("insert verification token: %w", mapWriteErr(err))
	}
	return nil
}

func (r *EmailVerificationRepository) GetByHash(ctx context.Context, hash string) (*domain.EmailVerificationToken, error) {
	const q = `
		SELECT token_hash, user_id, expires_at, created_at
		FROM email_verification_tokens
		WHERE token_hash = $1`

	var t domain.EmailVerificationToken
	err := r.pool.QueryRow(ctx, q, hash).Scan(&t.TokenHash, &t.UserID, &t.ExpiresAt, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No detail in the message: this is reached with attacker-supplied
			// input, and confirming which tokens exist is free information.
			return nil, fmt.Errorf("%w: verification token", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("query verification token: %w", err)
	}
	return &t, nil
}

func (r *EmailVerificationRepository) DeleteForUser(ctx context.Context, userID uuid.UUID) error {
	const q = `DELETE FROM email_verification_tokens WHERE user_id = $1`
	if _, err := r.pool.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("delete verification tokens: %w", err)
	}
	return nil
}

func (r *EmailVerificationRepository) CountRecentForUser(ctx context.Context, userID uuid.UUID, since time.Time) (int, error) {
	const q = `
		SELECT count(*) FROM email_verification_tokens
		WHERE user_id = $1 AND created_at >= $2`

	var n int
	if err := r.pool.QueryRow(ctx, q, userID, since).Scan(&n); err != nil {
		return 0, fmt.Errorf("count recent verification tokens: %w", err)
	}
	return n, nil
}
