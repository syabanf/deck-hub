package usecase

import (
	"context"

	"github.com/wit/wit-backend/internal/domain"
)

// Paging bounds for the log. It is the one table that only grows, so an
// unbounded read of it is a resource limit rather than a formatting choice —
// the same reasoning as DefaultDeckLimit.
const (
	DefaultAuditLimit = 50
	MaxAuditLimit     = 200
)

// AuditUsecase reads the activity log.
type AuditUsecase struct {
	repo domain.AuditRepository
}

// NewAuditUsecase wires an AuditUsecase with its repository dependency.
func NewAuditUsecase(repo domain.AuditRepository) *AuditUsecase {
	return &AuditUsecase{repo: repo}
}

// List returns one page and the total matching the same filter.
func (uc *AuditUsecase) List(ctx context.Context, f domain.AuditFilter) ([]*domain.AuditEntry, int, error) {
	if f.Limit <= 0 {
		f.Limit = DefaultAuditLimit
	}
	if f.Limit > MaxAuditLimit {
		f.Limit = MaxAuditLimit
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	entries, err := uc.repo.List(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	total, err := uc.repo.Count(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	return entries, total, nil
}
