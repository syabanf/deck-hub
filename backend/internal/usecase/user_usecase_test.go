package usecase

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/wit/wit-backend/internal/domain"
)

// fakeUserRepo is an in-memory domain.UserRepository used to prove the usecase
// layer is testable with no database.
type fakeUserRepo struct {
	mu       sync.Mutex
	byID     map[uuid.UUID]*domain.User
	byEmail  map[string]*domain.User
	createErr error
}

// MarkEmailVerified mirrors the real repository: idempotent, first stamp wins.
func (f *fakeUserRepo) MarkEmailVerified(_ context.Context, id uuid.UUID, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.byID[id]
	if !ok {
		return fmt.Errorf("%w: user %s", domain.ErrNotFound, id)
	}
	if u.EmailVerifiedAt == nil {
		u.EmailVerifiedAt = &at
	}
	return nil
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{
		byID:    make(map[uuid.UUID]*domain.User),
		byEmail: make(map[string]*domain.User),
	}
}

func (f *fakeUserRepo) Create(_ context.Context, u *domain.User) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.createErr != nil {
		return f.createErr
	}
	if _, ok := f.byEmail[u.Email]; ok {
		return domain.ErrConflict
	}
	cp := *u
	f.byID[u.ID] = &cp
	f.byEmail[u.Email] = &cp
	return nil
}

func (f *fakeUserRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.byID[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (f *fakeUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.byEmail[email]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (f *fakeUserRepo) List(_ context.Context, _ domain.UserFilter) ([]*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]*domain.User, 0, len(f.byID))
	for _, u := range f.byID {
		cp := *u
		out = append(out, &cp)
	}
	return out, nil
}

func (f *fakeUserRepo) Update(_ context.Context, u *domain.User) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	old, ok := f.byID[u.ID]
	if !ok {
		return domain.ErrNotFound
	}
	if old.Email != u.Email {
		delete(f.byEmail, old.Email)
	}
	cp := *u
	f.byID[u.ID] = &cp
	f.byEmail[u.Email] = &cp
	return nil
}

func (f *fakeUserRepo) Delete(_ context.Context, id uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	u, ok := f.byID[id]
	if !ok {
		return domain.ErrNotFound
	}
	delete(f.byID, id)
	delete(f.byEmail, u.Email)
	return nil
}

func TestUserUsecase_Create(t *testing.T) {
	tests := []struct {
		name    string
		seed    func(*fakeUserRepo)
		input   CreateUserInput
		wantErr error
	}{
		{
			name: "valid user with defaults",
			input: CreateUserInput{
				Name:     "Ada Lovelace",
				Email:    "Ada@Example.com",
				Password: "supersecret",
			},
		},
		{
			name: "valid admin",
			input: CreateUserInput{
				Name:     "Root",
				Email:    "root@example.com",
				Password: "supersecret",
				Role:     domain.RoleAdmin,
				Status:   domain.StatusActive,
			},
		},
		{
			name:    "missing name",
			input:   CreateUserInput{Email: "x@example.com", Password: "supersecret"},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "invalid email",
			input:   CreateUserInput{Name: "X", Email: "not-an-email", Password: "supersecret"},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "short password",
			input:   CreateUserInput{Name: "X", Email: "x@example.com", Password: "short"},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name:    "invalid role",
			input:   CreateUserInput{Name: "X", Email: "x@example.com", Password: "supersecret", Role: domain.Role("superuser")},
			wantErr: domain.ErrInvalidInput,
		},
		{
			name: "duplicate email",
			seed: func(r *fakeUserRepo) {
				_ = r.Create(context.Background(), &domain.User{
					ID:     uuid.New(),
					Name:   "Existing",
					Email:  "dup@example.com",
					Role:   domain.RoleViewer,
					Status: domain.StatusActive,
				})
			},
			input:   CreateUserInput{Name: "New", Email: "dup@example.com", Password: "supersecret"},
			wantErr: domain.ErrConflict,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeUserRepo()
			if tc.seed != nil {
				tc.seed(repo)
			}
			uc := NewUserUsecase(repo)

			got, err := uc.Create(context.Background(), tc.input)

			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected error %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got == nil {
				t.Fatal("expected user, got nil")
			}
			if got.ID == uuid.Nil {
				t.Error("expected generated ID")
			}
			if got.PasswordHash == "" {
				t.Error("expected password to be hashed")
			}
			if got.PasswordHash == tc.input.Password {
				t.Error("password stored in plaintext")
			}
			// Email must be normalised to lowercase.
			if got.Email != "ada@example.com" && got.Email != "root@example.com" {
				t.Errorf("email not normalised: %q", got.Email)
			}
			if got.Role == "" || got.Status == "" {
				t.Error("expected role/status defaults to be applied")
			}
			if err := bcrypt.CompareHashAndPassword([]byte(got.PasswordHash), []byte(tc.input.Password)); err != nil {
				t.Errorf("stored hash does not verify against password: %v", err)
			}
		})
	}
}

func TestUserUsecase_Authenticate(t *testing.T) {
	repo := newFakeUserRepo()
	uc := NewUserUsecase(repo)

	created, err := uc.Create(context.Background(), CreateUserInput{
		Name:     "Grace",
		Email:    "grace@example.com",
		Password: "navypassword",
		Role:     domain.RoleEditor,
	})
	if err != nil {
		t.Fatalf("seed create failed: %v", err)
	}

	tests := []struct {
		name     string
		email    string
		password string
		wantErr  error
	}{
		{name: "correct credentials", email: "grace@example.com", password: "navypassword"},
		{name: "case-insensitive email", email: "GRACE@example.com", password: "navypassword"},
		{name: "wrong password", email: "grace@example.com", password: "nope", wantErr: domain.ErrUnauthorized},
		{name: "unknown email", email: "ghost@example.com", password: "navypassword", wantErr: domain.ErrUnauthorized},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			u, err := uc.Authenticate(context.Background(), tc.email, tc.password)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected error %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if u.ID != created.ID {
				t.Errorf("authenticated wrong user: got %v want %v", u.ID, created.ID)
			}
		})
	}
}

func TestUserUsecase_Authenticate_Suspended(t *testing.T) {
	repo := newFakeUserRepo()
	uc := NewUserUsecase(repo)

	created, err := uc.Create(context.Background(), CreateUserInput{
		Name:     "Suspended Sam",
		Email:    "sam@example.com",
		Password: "validpassword",
	})
	if err != nil {
		t.Fatalf("seed create failed: %v", err)
	}

	suspended := domain.StatusSuspended
	if _, err := uc.Update(context.Background(), created.ID, UpdateUserInput{Status: &suspended}); err != nil {
		t.Fatalf("suspend failed: %v", err)
	}

	if _, err := uc.Authenticate(context.Background(), "sam@example.com", "validpassword"); !errors.Is(err, domain.ErrUnauthorized) {
		t.Fatalf("expected ErrUnauthorized for suspended account, got %v", err)
	}
}
