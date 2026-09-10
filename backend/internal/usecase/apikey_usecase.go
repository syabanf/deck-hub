package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// APIKeyUsecase issues and checks the keys external systems call with.
type APIKeyUsecase struct {
	repo domain.APIKeyRepository
}

// NewAPIKeyUsecase wires an APIKeyUsecase.
func NewAPIKeyUsecase(repo domain.APIKeyRepository) *APIKeyUsecase {
	return &APIKeyUsecase{repo: repo}
}

// keyPrefix marks a WIT key wherever it turns up — a log, a config file, a
// paste in a chat. Somebody who finds one can tell what it opens, which is the
// difference between a leak that gets reported and one that does not.
const keyPrefix = "wit_"

// displayPrefix is how much of the key the admin screen keeps in clear: enough
// to tell two keys apart, far too little to guess the rest.
const displayPrefix = 12

// Generate makes a new key and returns the plaintext exactly once.
//
// The plaintext is never stored and cannot be recovered — the row holds a
// SHA-256 hash. Losing it means issuing a new key, which is the right trade:
// a key a database backup hands over is not a credential.
func (uc *APIKeyUsecase) Generate(ctx context.Context, name string, createdBy *uuid.UUID) (*domain.APIKey, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, "", fmt.Errorf("%w: give the key a name, so it can be recognised later", domain.ErrInvalidInput)
	}
	if len(name) > 200 {
		return nil, "", fmt.Errorf("%w: name is too long", domain.ErrInvalidInput)
	}

	// 32 bytes from crypto/rand. Nothing about this needs to be memorable, so
	// there is no reason for it to be anything less than unguessable.
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("generate api key: %w", err)
	}
	plaintext := keyPrefix + base64.RawURLEncoding.EncodeToString(raw)

	k := &domain.APIKey{
		ID:        uuid.New(),
		Name:      name,
		Prefix:    plaintext[:displayPrefix],
		CreatedBy: createdBy,
		CreatedAt: time.Now().UTC(),
	}
	if err := uc.repo.Create(ctx, k, hashKey(plaintext)); err != nil {
		return nil, "", err
	}
	return k, plaintext, nil
}

// List returns every key ever issued, live and revoked.
func (uc *APIKeyUsecase) List(ctx context.Context) ([]*domain.APIKey, error) {
	return uc.repo.List(ctx)
}

// Revoke stops a key working. The row stays.
func (uc *APIKeyUsecase) Revoke(ctx context.Context, id uuid.UUID) error {
	return uc.repo.Revoke(ctx, id, time.Now().UTC())
}

// Verify checks a presented key and returns the record behind it.
//
// Missing, unknown and revoked all answer with the same error. Telling them
// apart would tell somebody working through guesses which of them landed.
func (uc *APIKeyUsecase) Verify(ctx context.Context, presented string) (*domain.APIKey, error) {
	presented = strings.TrimSpace(presented)
	if presented == "" {
		return nil, domain.ErrInvalidAPIKey
	}

	k, err := uc.repo.FindByHash(ctx, hashKey(presented))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrInvalidAPIKey
		}
		return nil, err
	}
	if !k.Active() {
		return nil, domain.ErrInvalidAPIKey
	}

	// Best effort, and deliberately not fatal: the key is valid, and failing
	// the request because a bookkeeping column would not update would be a
	// self-inflicted outage.
	_ = uc.repo.TouchLastUsed(ctx, k.ID, time.Now().UTC())

	return k, nil
}

// hashKey is what the database stores.
//
// SHA-256 rather than bcrypt, which is the opposite of the choice made for
// passwords two files away — and for a reason. bcrypt is slow on purpose
// because a password is short, human-chosen and therefore guessable; the
// slowness is what makes guessing expensive. An API key is 32 bytes of
// crypto/rand: there is no guessing to make expensive. What is left is the
// cost, and this hash runs on every single request the key is presented on.
func hashKey(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}
