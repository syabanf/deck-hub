package postgres

import (
	"context"
	"fmt"

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

func (r *SettingsRepository) Set(ctx context.Context, key, value string) error {
	const q = `
		INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`
	if _, err := r.pool.Exec(ctx, q, key, value); err != nil {
		return fmt.Errorf("save setting: %w", err)
	}
	return nil
}
