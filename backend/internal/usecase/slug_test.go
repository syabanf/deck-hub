package usecase

import (
	"errors"
	"strings"
	"testing"

	"github.com/wit/wit-backend/internal/domain"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Company Profile 2026":  "company-profile-2026",
		"  Laporan   Tahunan  ": "laporan-tahunan",
		"Q1/Q2 — Review":        "q1-q2-review",
		"Profil WIT 2026!":      "profil-wit-2026",
		"already-a-slug":        "already-a-slug",
		"--leading-and-":        "leading-and",
		"WIT":                   "wit",

		// Nothing a readable URL can carry survives, and that is not an error
		// here — NormalizeSlug is what turns it into one.
		"日本語": "",
		"!!!": "",
		"":    "",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSlugifyIsIdempotent(t *testing.T) {
	// The value goes through this on the way in and again on the way out, when
	// a link is resolved. If a second pass changed anything, a deck could be
	// stored under a name its own share link no longer matched.
	for _, in := range []string{"Company Profile 2026", "Q1/Q2 — Review", "a--b", "-x-"} {
		once := Slugify(in)
		if twice := Slugify(once); twice != once {
			t.Errorf("Slugify(%q) = %q, but Slugify of that = %q", in, once, twice)
		}
	}
}

func TestSlugifyStaysWithinTheLengthCap(t *testing.T) {
	long := strings.Repeat("laporan tahunan ", 20)
	got := Slugify(long)
	if len(got) > maxSlugLen {
		t.Fatalf("Slugify produced %d characters, cap is %d: %q", len(got), maxSlugLen, got)
	}
	// Truncation must not leave the hyphen it cut on, or the link ends in a
	// dangling separator.
	if strings.HasSuffix(got, "-") {
		t.Errorf("truncated slug ends in a hyphen: %q", got)
	}
}

func TestNormalizeSlugRefusesWhatCannotBeALink(t *testing.T) {
	for _, in := range []string{
		"日本語", // nothing ASCII survives
		"!!!",
		"api",      // reserved by the site
		"Settings", // reserved, and only after cleaning
		"2026",     // digits alone read as an id
		"12-34",
	} {
		got, err := NormalizeSlug(in)
		if err == nil {
			t.Errorf("NormalizeSlug(%q) = %q, want an error", in, got)
			continue
		}
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("NormalizeSlug(%q) error = %v, want ErrInvalidInput", in, err)
		}
	}
}

func TestNormalizeSlugAcceptsEmptyAsNoSlug(t *testing.T) {
	// A deck without a slug is a deck addressed by id, which is every deck
	// that existed before this feature. Empty must not be an error.
	for _, in := range []string{"", "   "} {
		got, err := NormalizeSlug(in)
		if err != nil || got != "" {
			t.Errorf("NormalizeSlug(%q) = (%q, %v), want (\"\", nil)", in, got, err)
		}
	}
}

func TestNormalizeSlugCleansRatherThanRefuses(t *testing.T) {
	got, err := NormalizeSlug("  Profil WIT 2026!  ")
	if err != nil {
		t.Fatalf("NormalizeSlug: %v", err)
	}
	if got != "profil-wit-2026" {
		t.Errorf("got %q, want %q", got, "profil-wit-2026")
	}
}
