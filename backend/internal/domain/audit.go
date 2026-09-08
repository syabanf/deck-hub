package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// AuditEntry is one recorded change.
//
// The actor's email and role are copied in rather than joined at read time.
// An account deleted later would otherwise erase its own history, which is the
// opposite of what a log is for.
type AuditEntry struct {
	ID         int64      `json:"id"`
	At         time.Time  `json:"at"`
	ActorID    *uuid.UUID `json:"actorId,omitempty"`
	ActorEmail string     `json:"actorEmail"`
	ActorRole  string     `json:"actorRole"`
	Action     string     `json:"action"`
	Entity     string     `json:"entity"`
	EntityID   string     `json:"entityId"`
	Route      string     `json:"route"`
	Status     int        `json:"status"`
	IP         string     `json:"ip"`
}

// AuditFilter narrows a listing. Zero values mean "no filter".
type AuditFilter struct {
	Entity  string
	Action  string
	ActorID *uuid.UUID
	Limit   int
	Offset  int
}

// AuditRepository abstracts persistence for the log.
type AuditRepository interface {
	// Record never fails a request: the caller logs and carries on. A change
	// that happened is worth more than a change that was recorded.
	Record(ctx context.Context, e *AuditEntry) error
	List(ctx context.Context, f AuditFilter) ([]*AuditEntry, error)
	Count(ctx context.Context, f AuditFilter) (int, error)
}
