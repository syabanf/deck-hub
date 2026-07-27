package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Role enumerates the permission levels a user may hold.
type Role string

// Status enumerates the lifecycle states of a user account.
type Status string

const (
	RoleAdmin  Role = "admin"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"

	StatusActive    Status = "active"
	StatusInvited   Status = "invited"
	StatusSuspended Status = "suspended"
)

// ValidRole reports whether r is a recognised role.
func ValidRole(r Role) bool {
	switch r {
	case RoleAdmin, RoleEditor, RoleViewer:
		return true
	default:
		return false
	}
}

// ValidStatus reports whether s is a recognised status.
func ValidStatus(s Status) bool {
	switch s {
	case StatusActive, StatusInvited, StatusSuspended:
		return true
	default:
		return false
	}
}

// User is the core account entity. PasswordHash is never serialised to JSON.
type User struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         Role      `json:"role"`
	Status       Status    `json:"status"`
	PasswordHash string    `json:"-"`
	// Nil until the address is proven. Kept separate from Status, which is
	// admin-managed — suspending an account must not undo its verification.
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// UserFilter narrows a List query. Zero values mean "no filter".
type UserFilter struct {
	Search string // matches name or email (case-insensitive)
	Role   Role
	Status Status
	Limit  int
	Offset int
}

// UserRepository abstracts persistence for users. Implementations live in the
// outer repository layer; usecases depend only on this interface.
type UserRepository interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id uuid.UUID) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	List(ctx context.Context, f UserFilter) ([]*User, error)
	Update(ctx context.Context, u *User) error
	MarkEmailVerified(ctx context.Context, id uuid.UUID, at time.Time) error
	Delete(ctx context.Context, id uuid.UUID) error
}
