package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// uniqueViolation is the PostgreSQL SQLSTATE for a unique_violation.
const uniqueViolation = "23505"

// UserRepository is the pgx-backed implementation of domain.UserRepository.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository constructs a UserRepository over the given pool.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Ensure interface compliance at compile time.
var _ domain.UserRepository = (*UserRepository)(nil)

const userColumns = `id, name, email, role, status, password_hash, email_verified_at, created_at, updated_at`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(
		&u.ID, &u.Name, &u.Email, &u.Role, &u.Status, &u.PasswordHash, &u.EmailVerifiedAt,
		&u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &u, nil
}

func mapWriteErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return fmt.Errorf("%w: %s", domain.ErrConflict, pgErr.ConstraintName)
	}
	return err
}

func (r *UserRepository) Create(ctx context.Context, u *domain.User) error {
	const q = `
		INSERT INTO users (id, name, email, role, status, password_hash, email_verified_at,
		                   created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := r.pool.Exec(ctx, q,
		u.ID, u.Name, u.Email, u.Role, u.Status, u.PasswordHash, u.EmailVerifiedAt,
		u.CreatedAt, u.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert user: %w", mapWriteErr(err))
	}
	return nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE id = $1`
	u, err := scanUser(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: user %s", domain.ErrNotFound, id)
		}
		return nil, fmt.Errorf("query user by id: %w", err)
	}
	return u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE lower(email) = lower($1)`
	u, err := scanUser(r.pool.QueryRow(ctx, q, email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: user %s", domain.ErrNotFound, email)
		}
		return nil, fmt.Errorf("query user by email: %w", err)
	}
	return u, nil
}

func (r *UserRepository) List(ctx context.Context, f domain.UserFilter) ([]*domain.User, error) {
	var (
		conds []string
		args  []any
		i     = 1
	)

	if f.Search != "" {
		conds = append(conds, fmt.Sprintf("(name ILIKE $%d OR email ILIKE $%d)", i, i))
		args = append(args, "%"+f.Search+"%")
		i++
	}
	if f.Role != "" {
		conds = append(conds, fmt.Sprintf("role = $%d", i))
		args = append(args, f.Role)
		i++
	}
	if f.Status != "" {
		conds = append(conds, fmt.Sprintf("status = $%d", i))
		args = append(args, f.Status)
		i++
	}

	q := `SELECT ` + userColumns + ` FROM users`
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
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}
	return users, nil
}

// Update deliberately leaves email_verified_at alone. An admin editing a name
// or role must not silently re-verify — or un-verify — an address; that is
// MarkEmailVerified's job.
func (r *UserRepository) Update(ctx context.Context, u *domain.User) error {
	const q = `
		UPDATE users
		SET name = $2, email = $3, role = $4, status = $5, password_hash = $6, updated_at = $7
		WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q,
		u.ID, u.Name, u.Email, u.Role, u.Status, u.PasswordHash, u.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update user: %w", mapWriteErr(err))
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: user %s", domain.ErrNotFound, u.ID)
	}
	return nil
}

// MarkEmailVerified stamps the verification time. Idempotent: verifying twice
// keeps the first timestamp, so a double-clicked link is not an error.
func (r *UserRepository) MarkEmailVerified(ctx context.Context, id uuid.UUID, at time.Time) error {
	const q = `
		UPDATE users
		SET email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2
		WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id, at)
	if err != nil {
		return fmt.Errorf("mark email verified: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: user %s", domain.ErrNotFound, id)
	}
	return nil
}

func (r *UserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM users WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: user %s", domain.ErrNotFound, id)
	}
	return nil
}
