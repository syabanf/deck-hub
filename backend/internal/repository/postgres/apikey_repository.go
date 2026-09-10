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

// APIKeyRepository is the pgx-backed implementation of domain.APIKeyRepository.
type APIKeyRepository struct {
	pool *pgxpool.Pool
}

// NewAPIKeyRepository constructs an APIKeyRepository over the given pool.
func NewAPIKeyRepository(pool *pgxpool.Pool) *APIKeyRepository {
	return &APIKeyRepository{pool: pool}
}

var _ domain.APIKeyRepository = (*APIKeyRepository)(nil)

// key_hash is deliberately absent from every read. Nothing above this layer
// has any use for it, and a column that is never selected cannot be logged,
// serialised or returned by accident.
const apiKeyColumns = `id, name, prefix, revoked_at, last_used_at, created_by, created_at`

func scanAPIKey(row pgx.Row) (*domain.APIKey, error) {
	var k domain.APIKey
	if err := row.Scan(&k.ID, &k.Name, &k.Prefix, &k.RevokedAt, &k.LastUsedAt, &k.CreatedBy, &k.CreatedAt); err != nil {
		return nil, err
	}
	return &k, nil
}

func (r *APIKeyRepository) Create(ctx context.Context, k *domain.APIKey, hash string) error {
	const q = `INSERT INTO api_keys (id, name, key_hash, prefix, created_by, created_at)
	           VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.pool.Exec(ctx, q, k.ID, k.Name, hash, k.Prefix, k.CreatedBy, k.CreatedAt)
	if err != nil {
		return fmt.Errorf("create api key: %w", err)
	}
	return nil
}

// List returns every key, revoked ones included. The admin screen needs the
// dead ones as much as the live: "this key was revoked last Tuesday" is the
// answer to most questions anyone brings to that page.
func (r *APIKeyRepository) List(ctx context.Context) ([]*domain.APIKey, error) {
	const q = `SELECT ` + apiKeyColumns + ` FROM api_keys ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	defer rows.Close()

	out := make([]*domain.APIKey, 0)
	for rows.Next() {
		k, err := scanAPIKey(rows)
		if err != nil {
			return nil, fmt.Errorf("scan api key: %w", err)
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func (r *APIKeyRepository) FindByHash(ctx context.Context, hash string) (*domain.APIKey, error) {
	const q = `SELECT ` + apiKeyColumns + ` FROM api_keys WHERE key_hash = $1`
	k, err := scanAPIKey(r.pool.QueryRow(ctx, q, hash))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find api key: %w", err)
	}
	return k, nil
}

func (r *APIKeyRepository) Revoke(ctx context.Context, id uuid.UUID, at time.Time) error {
	// Already-revoked keys keep their original timestamp: the interesting date
	// is when it stopped working, not when somebody last clicked the button.
	const q = `UPDATE api_keys SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`
	tag, err := r.pool.Exec(ctx, q, id, at)
	if err != nil {
		return fmt.Errorf("revoke api key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Either no such key, or it was already revoked. Both mean the caller
		// has nothing left to do.
		return domain.ErrNotFound
	}
	return nil
}

// TouchLastUsed records that the key was just accepted.
//
// Best-effort by design — see the usecase. A failure here must not turn a
// valid request into an error, so the caller ignores what this returns.
func (r *APIKeyRepository) TouchLastUsed(ctx context.Context, id uuid.UUID, at time.Time) error {
	const q = `UPDATE api_keys SET last_used_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, at)
	return err
}
