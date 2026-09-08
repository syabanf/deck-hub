package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wit/wit-backend/internal/domain"
)

// AuditRepository is the pgx-backed implementation of domain.AuditRepository.
type AuditRepository struct {
	pool *pgxpool.Pool
}

// NewAuditRepository constructs an AuditRepository over the given pool.
func NewAuditRepository(pool *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

var _ domain.AuditRepository = (*AuditRepository)(nil)

func (r *AuditRepository) Record(ctx context.Context, e *domain.AuditEntry) error {
	const q = `
		INSERT INTO audit_log (actor_id, actor_email, actor_role, action, entity,
			entity_id, route, status, ip)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := r.pool.Exec(ctx, q, e.ActorID, e.ActorEmail, e.ActorRole, e.Action,
		e.Entity, e.EntityID, e.Route, e.Status, e.IP)
	if err != nil {
		return fmt.Errorf("record audit entry: %w", err)
	}
	return nil
}

// where builds the shared filter so List and Count can never disagree about
// what they are looking at — a total that counts different rows than the page
// is worse than no total.
func auditWhere(f domain.AuditFilter) (string, []any) {
	clauses := []string{"1=1"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		clauses = append(clauses, fmt.Sprintf(cond, len(args)))
	}
	if f.Entity != "" {
		add("entity = $%d", f.Entity)
	}
	if f.Action != "" {
		add("action = $%d", f.Action)
	}
	if f.ActorID != nil {
		add("actor_id = $%d", *f.ActorID)
	}
	return strings.Join(clauses, " AND "), args
}

func (r *AuditRepository) List(ctx context.Context, f domain.AuditFilter) ([]*domain.AuditEntry, error) {
	where, args := auditWhere(f)
	// Newest first, id breaking ties inside a timestamp so paging cannot
	// repeat or skip a row.
	q := fmt.Sprintf(`
		SELECT id, at, actor_id, actor_email, actor_role, action, entity,
		       entity_id, route, status, ip
		  FROM audit_log
		 WHERE %s
		 ORDER BY at DESC, id DESC
		 LIMIT $%d OFFSET $%d`, where, len(args)+1, len(args)+2)
	args = append(args, f.Limit, f.Offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query audit log: %w", err)
	}
	defer rows.Close()

	out := make([]*domain.AuditEntry, 0)
	for rows.Next() {
		var e domain.AuditEntry
		if err := rows.Scan(&e.ID, &e.At, &e.ActorID, &e.ActorEmail, &e.ActorRole,
			&e.Action, &e.Entity, &e.EntityID, &e.Route, &e.Status, &e.IP); err != nil {
			return nil, fmt.Errorf("scan audit entry: %w", err)
		}
		out = append(out, &e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit log: %w", err)
	}
	return out, nil
}

func (r *AuditRepository) Count(ctx context.Context, f domain.AuditFilter) (int, error) {
	where, args := auditWhere(f)
	q := fmt.Sprintf(`SELECT count(*) FROM audit_log WHERE %s`, where)
	var n int
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("count audit log: %w", err)
	}
	return n, nil
}
