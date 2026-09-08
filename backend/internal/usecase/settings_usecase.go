package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/wit/wit-backend/internal/domain"
)

// SettingsUsecase reads and writes the settings an admin can change.
type SettingsUsecase struct {
	repo domain.SettingsRepository
}

// NewSettingsUsecase wires a SettingsUsecase with its repository dependency.
func NewSettingsUsecase(repo domain.SettingsRepository) *SettingsUsecase {
	return &SettingsUsecase{repo: repo}
}

// All returns every known setting, defaults filled in for anything unset.
//
// Complete rather than sparse: a caller that has to know which keys exist in
// order to read them is a caller that breaks when a key is added.
func (uc *SettingsUsecase) All(ctx context.Context) (map[string]string, error) {
	stored, err := uc.repo.All(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(domain.SettingDefaults))
	for k, v := range domain.SettingDefaults {
		if s, ok := stored[k]; ok {
			v = s
		}
		out[k] = v
	}
	return out, nil
}

// Update writes the supplied settings, refusing keys the code does not read
// and values their key cannot mean.
func (uc *SettingsUsecase) Update(ctx context.Context, in map[string]string) (map[string]string, error) {
	for k, v := range in {
		k = strings.TrimSpace(k)
		if !domain.ValidSettingKey(k) {
			return nil, fmt.Errorf("%w: unknown setting %q", domain.ErrInvalidInput, k)
		}
		if err := domain.ValidateSetting(k, strings.TrimSpace(v)); err != nil {
			return nil, err
		}
	}
	// Validated in full first: a half-applied batch leaves the settings in a
	// state nobody asked for.
	for k, v := range in {
		if err := uc.repo.Set(ctx, strings.TrimSpace(k), strings.TrimSpace(v)); err != nil {
			return nil, err
		}
	}
	return uc.All(ctx)
}
