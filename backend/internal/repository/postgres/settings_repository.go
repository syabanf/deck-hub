package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// SettingsRepository is the pgx-backed implementation of
// domain.SettingsRepository.
type SettingsRepository struct {
	pool *pgxpool.Pool
}

// NewSettingsRepository constructs a SettingsRepository over the given pool.
func NewSettingsRepository(pool *pgxpool.Pool) *SettingsRepository {
	return &SettingsRepository{pool: pool}
}

var _ domain.SettingsRepository = (*SettingsRepository)(nil)

func (r *SettingsRepository) All(ctx context.Context) (map[string]string, error) {
	const q = `SELECT key, value FROM app_settings`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("query settings: %w", err)
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan setting: %w", err)
		}
		out[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate settings: %w", err)
	}
	return out, nil
}

// Get reads one setting. Missing is not an error: the caller decides what an
// unset value means, and for the PIN it means the gate is not configured.
func (r *SettingsRepository) Get(ctx context.Context, key string) (string, error) {
	const q = `SELECT value FROM app_settings WHERE key = $1`
	var v string
	err := r.pool.QueryRow(ctx, q, key).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get setting: %w", err)
	}
	return v, nil
}

func (r *SettingsRepository) Set(ctx context.Context, key, value string) error {
	const q = `
		INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`
	if _, err := r.pool.Exec(ctx, q, key, value); err != nil {
		return fmt.Errorf("save setting: %w", err)
	}
	return nil
}
