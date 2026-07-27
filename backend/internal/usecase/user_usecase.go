package usecase

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/wit/wit-backend/internal/domain"
)

// emailRegexp is a pragmatic email validator (not RFC 5322 exhaustive, but
// rejects obviously malformed addresses).
var emailRegexp = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

const minPasswordLen = 8

// UserUsecase holds application business rules for users. It depends only on
// the domain UserRepository interface.
type UserUsecase struct {
	repo domain.UserRepository
}

// NewUserUsecase wires a UserUsecase with its repository dependency.
func NewUserUsecase(repo domain.UserRepository) *UserUsecase {
	return &UserUsecase{repo: repo}
}

// CreateUserInput carries the fields needed to create a user.
type CreateUserInput struct {
	Name     string
	Email    string
	Password string
	Role     domain.Role
	Status   domain.Status
}

// Create validates input, hashes the password with bcrypt, enforces email
// uniqueness, and persists the new user.
func (uc *UserUsecase) Create(ctx context.Context, in CreateUserInput) (*domain.User, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))

	if in.Name == "" {
		return nil, fmt.Errorf("%w: name is required", domain.ErrInvalidInput)
	}
	if !emailRegexp.MatchString(in.Email) {
		return nil, fmt.Errorf("%w: a valid email is required", domain.ErrInvalidInput)
	}
	if len(in.Password) < minPasswordLen {
		return nil, fmt.Errorf("%w: password must be at least %d characters", domain.ErrInvalidInput, minPasswordLen)
	}
	if in.Role == "" {
		in.Role = domain.RoleViewer
	}
	if !domain.ValidRole(in.Role) {
		return nil, fmt.Errorf("%w: invalid role %q", domain.ErrInvalidInput, in.Role)
	}
	if in.Status == "" {
		in.Status = domain.StatusActive
	}
	if !domain.ValidStatus(in.Status) {
		return nil, fmt.Errorf("%w: invalid status %q", domain.ErrInvalidInput, in.Status)
	}

	// Pre-check uniqueness for a friendly error; the DB unique index is the
	// authoritative guard against races.
	if existing, err := uc.repo.GetByEmail(ctx, in.Email); err == nil && existing != nil {
		return nil, fmt.Errorf("%w: email already in use", domain.ErrConflict)
	} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("check email uniqueness: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	u := &domain.User{
		ID:           uuid.New(),
		Name:         in.Name,
		Email:        in.Email,
		Role:         in.Role,
		Status:       in.Status,
		PasswordHash: string(hash),
		// Provisioned by an admin, so the address counts as verified: an admin
		// deciding someone should have an account *is* the check. Leaving this
		// nil would lock every admin-created user out of a login they were
		// never told to verify. Self-service sign-up is the path that has to
		// prove the address — see RegistrationUsecase.
		EmailVerifiedAt: &now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := uc.repo.Create(ctx, u); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// GetByID returns a single user or domain.ErrNotFound.
func (uc *UserUsecase) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	u, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

// List returns users matching the filter.
func (uc *UserUsecase) List(ctx context.Context, f domain.UserFilter) ([]*domain.User, error) {
	users, err := uc.repo.List(ctx, f)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	return users, nil
}

// UpdateUserInput carries optional updates. Nil pointers are left unchanged.
type UpdateUserInput struct {
	Name     *string
	Email    *string
	Password *string
	Role     *domain.Role
	Status   *domain.Status
}

// Update applies partial changes to an existing user after validation.
func (uc *UserUsecase) Update(ctx context.Context, id uuid.UUID, in UpdateUserInput) (*domain.User, error) {
	u, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: name cannot be empty", domain.ErrInvalidInput)
		}
		u.Name = name
	}
	if in.Email != nil {
		email := strings.ToLower(strings.TrimSpace(*in.Email))
		if !emailRegexp.MatchString(email) {
			return nil, fmt.Errorf("%w: a valid email is required", domain.ErrInvalidInput)
		}
		if email != u.Email {
			if existing, err := uc.repo.GetByEmail(ctx, email); err == nil && existing != nil && existing.ID != u.ID {
				return nil, fmt.Errorf("%w: email already in use", domain.ErrConflict)
			} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("check email uniqueness: %w", err)
			}
		}
		u.Email = email
	}
	if in.Password != nil {
		if len(*in.Password) < minPasswordLen {
			return nil, fmt.Errorf("%w: password must be at least %d characters", domain.ErrInvalidInput, minPasswordLen)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(*in.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		u.PasswordHash = string(hash)
	}
	if in.Role != nil {
		if !domain.ValidRole(*in.Role) {
			return nil, fmt.Errorf("%w: invalid role %q", domain.ErrInvalidInput, *in.Role)
		}
		u.Role = *in.Role
	}
	if in.Status != nil {
		if !domain.ValidStatus(*in.Status) {
			return nil, fmt.Errorf("%w: invalid status %q", domain.ErrInvalidInput, *in.Status)
		}
		u.Status = *in.Status
	}

	u.UpdatedAt = time.Now().UTC()
	if err := uc.repo.Update(ctx, u); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

// Delete removes a user by id.
func (uc *UserUsecase) Delete(ctx context.Context, id uuid.UUID) error {
	if err := uc.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}

// Authenticate verifies an email/password pair. It returns the user on success
// or domain.ErrUnauthorized on any failure (kept deliberately vague to avoid
// leaking which part was wrong). Suspended accounts cannot authenticate.
func (uc *UserUsecase) Authenticate(ctx context.Context, email, password string) (*domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	u, err := uc.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: invalid credentials", domain.ErrUnauthorized)
		}
		return nil, fmt.Errorf("authenticate: %w", err)
	}
	if u.Status == domain.StatusSuspended {
		return nil, fmt.Errorf("%w: account suspended", domain.ErrUnauthorized)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("%w: invalid credentials", domain.ErrUnauthorized)
	}
	// Checked after the password, deliberately. Answering "verify your email"
	// before the password is proven would confirm that an address is registered
	// to anyone who guesses it.
	//
	// A distinct error code, because the fix is completely different from a
	// wrong password: the client turns this into "check your inbox", with a
	// resend button.
	if u.EmailVerifiedAt == nil {
		return nil, fmt.Errorf("%w: email not verified", domain.ErrEmailNotVerified)
	}
	return u, nil
}
