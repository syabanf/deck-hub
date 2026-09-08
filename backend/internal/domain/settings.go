package domain

import (
	"context"
	"fmt"
	"strconv"
)

// Settings an admin can change without a deploy.
//
// The keys are a closed set rather than a free-form store. A key nothing reads
// is a setting somebody thinks they changed, and the failure is silent — so an
// unknown key is refused at the door.
const (
	// SettingNavMaxCategories caps how many categories the header shows before
	// the rest move into its "More" menu.
	SettingNavMaxCategories = "nav_max_categories"
)

// SettingDefaults is also the list of keys that exist. A caller that never set
// anything still gets a complete, usable answer.
var SettingDefaults = map[string]string{
	SettingNavMaxCategories: "5",
}

// ValidSettingKey reports whether the key is one the code reads.
func ValidSettingKey(k string) bool {
	_, ok := SettingDefaults[k]
	return ok
}

// ValidateSetting checks a value against what its key means. Values are stored
// as text, so this is where a number stays a number.
func ValidateSetting(key, value string) error {
	switch key {
	case SettingNavMaxCategories:
		n, err := strconv.Atoi(value)
		if err != nil {
			return fmt.Errorf("%w: %s must be a whole number", ErrInvalidInput, key)
		}
		// One is the floor: a header with no categories at all is a header
		// nobody can browse from. The ceiling is generous — the frontend still
		// drops any that do not fit the window.
		if n < 1 || n > 20 {
			return fmt.Errorf("%w: %s must be between 1 and 20", ErrInvalidInput, key)
		}
	}
	return nil
}

// SettingsRepository abstracts persistence for the settings map.
type SettingsRepository interface {
	// All returns every stored setting. Defaults are applied above this.
	All(ctx context.Context) (map[string]string, error)
	Set(ctx context.Context, key, value string) error
}
