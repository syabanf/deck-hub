package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/wit/wit-backend/internal/domain"
)

const (
	// How long a verification link works. Long enough to survive a night and a
	// slow mail relay; short enough that a link leaked from an old inbox is
	// usually already dead.
	VerificationTTL = 24 * time.Hour

	// Resend allowance, per user, per window. Each resend is an outbound email
	// to an address that may not belong to the requester, so this bounds how
	// far the endpoint can be used to spam someone.
	resendLimit  = 5
	resendWindow = time.Hour
)

// RegistrationUsecase owns self-service sign-up: creating the pending account,
// issuing verification tokens, and redeeming them.
type RegistrationUsecase struct {
	users     domain.UserRepository
	tokens    domain.EmailVerificationRepository
	mailer    domain.Mailer
	verifyURL string // frontend page that redeems a token, e.g. http://localhost:5173/verify
	now       func() time.Time
}

func NewRegistrationUsecase(
	users domain.UserRepository,
	tokens domain.EmailVerificationRepository,
	mailer domain.Mailer,
	verifyURL string,
) *RegistrationUsecase {
	return &RegistrationUsecase{
		users:     users,
		tokens:    tokens,
		mailer:    mailer,
		verifyURL: strings.TrimRight(verifyURL, "/"),
		now:       time.Now,
	}
}

// RegisterInput is what a stranger may set about themselves. Note what is
// absent: role and status. Honouring a role from an unauthenticated request
// would let anyone register as an admin.
type RegisterInput struct {
	Name     string
	Email    string
	Password string
}

// Register creates an unverified viewer and emails a verification link.
//
// Returns the created user. The token is never returned — it goes to the
// address being proven, which is the entire point.
func (uc *RegistrationUsecase) Register(ctx context.Context, in RegisterInput) (*domain.User, error) {
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

	// A plain 409 rather than a vague "check your inbox". Address enumeration
	// is not defensible here anyway — GET /users is public and lists every
	// address — so pretending otherwise would cost usability and protect
	// nothing. Locking that endpoint down is the fix; see docs/API.md.
	if existing, err := uc.users.GetByEmail(ctx, in.Email); err == nil && existing != nil {
		return nil, fmt.Errorf("%w: email already registered", domain.ErrConflict)
	} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("check email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	now := uc.now()
	u := &domain.User{
		ID:           uuid.New(),
		Name:         in.Name,
		Email:        in.Email,
		Role:         domain.RoleViewer, // never from the request body
		Status:       domain.StatusActive,
		PasswordHash: string(hash),
		// Nil: unverified. Authenticate refuses to issue a token until this is
		// set, so the account exists but cannot be used yet.
		EmailVerifiedAt: nil,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := uc.users.Create(ctx, u); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	if err := uc.issue(ctx, u); err != nil {
		// The account is already created. Failing the whole request would
		// leave an account nobody can verify and whose email is now taken;
		// better to succeed and let them use "resend".
		return u, nil
	}
	return u, nil
}

// Verify redeems a token and marks the address proven.
func (uc *RegistrationUsecase) Verify(ctx context.Context, plaintext string) (*domain.User, error) {
	plaintext = strings.TrimSpace(plaintext)
	if plaintext == "" {
		return nil, fmt.Errorf("%w: a verification token is required", domain.ErrInvalidInput)
	}

	t, err := uc.tokens.GetByHash(ctx, hashToken(plaintext))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: this verification link is not valid", domain.ErrInvalidInput)
		}
		return nil, fmt.Errorf("look up token: %w", err)
	}

	// Distinct from "not valid": an expired link means the account is real and
	// a resend will work, which is worth telling someone.
	if t.Expired(uc.now()) {
		return nil, fmt.Errorf("%w: this verification link has expired", domain.ErrInvalidInput)
	}

	u, err := uc.users.GetByID(ctx, t.UserID)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}

	if err := uc.users.MarkEmailVerified(ctx, u.ID, uc.now()); err != nil {
		return nil, fmt.Errorf("mark verified: %w", err)
	}
	// Burn every outstanding token, not just this one: a resend leaves earlier
	// tokens valid, and any of them would otherwise still redeem later.
	if err := uc.tokens.DeleteForUser(ctx, u.ID); err != nil {
		return nil, fmt.Errorf("clear tokens: %w", err)
	}

	return uc.users.GetByID(ctx, u.ID)
}

// Resend issues a fresh link.
//
// Always reports success. Unlike Register, this takes only an address, so a
// truthful "no such account" would turn it into an oracle for any address —
// and unlike Register there is no usability cost, because someone who did just
// register knows they did.
func (uc *RegistrationUsecase) Resend(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if !emailRegexp.MatchString(email) {
		return fmt.Errorf("%w: a valid email is required", domain.ErrInvalidInput)
	}

	u, err := uc.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("look up user: %w", err)
	}
	if u.EmailVerifiedAt != nil {
		return nil // already verified; nothing to send
	}

	n, err := uc.tokens.CountRecentForUser(ctx, u.ID, uc.now().Add(-resendWindow))
	if err != nil {
		return fmt.Errorf("count recent tokens: %w", err)
	}
	if n >= resendLimit {
		return fmt.Errorf("%w: too many verification emails requested, try again later", domain.ErrInvalidInput)
	}

	return uc.issue(ctx, u)
}

// issue mints a token, stores its hash, and mails the plaintext.
func (uc *RegistrationUsecase) issue(ctx context.Context, u *domain.User) error {
	plaintext, err := newToken()
	if err != nil {
		return fmt.Errorf("generate token: %w", err)
	}

	now := uc.now()
	err = uc.tokens.Create(ctx, &domain.EmailVerificationToken{
		TokenHash: hashToken(plaintext),
		UserID:    u.ID,
		ExpiresAt: now.Add(VerificationTTL),
		CreatedAt: now,
	})
	if err != nil {
		return fmt.Errorf("store token: %w", err)
	}

	link := fmt.Sprintf("%s?token=%s", uc.verifyURL, url.QueryEscape(plaintext))
	if err := uc.mailer.SendVerification(ctx, u.Email, u.Name, link); err != nil {
		return fmt.Errorf("send verification email: %w", err)
	}
	return nil
}

// newToken returns 32 bytes of cryptographic randomness, URL-safe so it can be
// pasted into a query string unescaped.
func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// hashToken is what gets stored. SHA-256 rather than bcrypt: the input is 256
// bits of randomness, so there is nothing to brute-force, and verification
// happens on a lookup path where a deliberately slow hash would hurt.
func hashToken(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}
