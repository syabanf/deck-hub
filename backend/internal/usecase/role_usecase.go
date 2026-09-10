package usecase

import (
	"context"

	"github.com/wit/wit-backend/internal/domain"
)

// RoleUsecase answers what the roles are and how many people hold them.
//
// The whole point of this one is what it does *not* return. An external team
// asked for "the roles"; the useful answer is the three of them, what each may
// do, and how many accounts sit in each — not a roster. No name, address or id
// leaves through here, so the key that opens it cannot leak a staff list even
// if the key itself leaks.
type RoleUsecase struct {
	users domain.UserRepository
}

// NewRoleUsecase wires a RoleUsecase.
func NewRoleUsecase(users domain.UserRepository) *RoleUsecase {
	return &RoleUsecase{users: users}
}

// Role is one role as the outside world sees it.
type Role struct {
	Role        string   `json:"role"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Can         []string `json:"can"`
	UserCount   int      `json:"userCount"`
}

// roleCatalog is the description of each role, in the order they should be
// read: most privileged first.
//
// Written out rather than derived, because "what can this role do" is a
// product statement, not something the router can be asked. Whenever the
// answer changes in RequireRole, it has to change here too — and the e2e suite
// asserts that every role the domain knows about appears in this list, so a
// fourth role cannot be added without somebody noticing this file.
var roleCatalog = []Role{
	{
		Role:        string(domain.RoleAdmin),
		Label:       "Administrator",
		Description: "Runs the catalog and the team.",
		Can: []string{
			"browse and play every deck",
			"add, edit and remove decks",
			"upload files",
			"manage accounts and roles",
			"manage the master data, settings and the Demo Center PIN",
			"read the activity log",
		},
	},
	{
		Role:        string(domain.RoleEditor),
		Label:       "Editor",
		Description: "Keeps the catalog stocked.",
		Can: []string{
			"browse and play every deck",
			"add, edit and remove decks",
			"upload files",
			"read and change the Demo Center",
		},
	},
	{
		Role:        string(domain.RoleViewer),
		Label:       "Viewer",
		Description: "Reads the catalog.",
		Can: []string{
			"browse and play every deck",
			"keep a personal library",
			"read the Demo Center",
		},
	},
}

// List returns the role catalog with a live count against each one.
func (uc *RoleUsecase) List(ctx context.Context) ([]Role, error) {
	counts, err := uc.users.CountByRole(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]Role, 0, len(roleCatalog))
	for _, r := range roleCatalog {
		r.UserCount = counts[domain.Role(r.Role)]
		out = append(out, r)
	}
	return out, nil
}

// KnownRoles is what the catalog above covers, for the test that keeps it in
// step with the domain.
func KnownRoles() []string {
	out := make([]string, 0, len(roleCatalog))
	for _, r := range roleCatalog {
		out = append(out, r.Role)
	}
	return out
}
