// Package docs keeps docs/openapi.yaml honest.
//
// Hand-written API docs rot the moment someone adds a route and forgets the
// spec — and nothing about a stale spec looks broken, which is what makes it
// dangerous. This walks the real chi router and compares it to the spec in both
// directions: a route with no documentation fails, and documentation for a
// route that no longer exists fails too.
//
// It needs no database: the router is built with handlers over nil usecases,
// because only the route table is under test, never the handler bodies.
//
// The spec is read with a small line scanner rather than a YAML library. Pulling
// one in cost two indirect dependencies and forced the module's minimum Go
// version up, which is a poor trade for reading one file we control. The scanner
// only understands the shape this file actually uses, and fails loudly if the
// structure stops matching.
package docs

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
)

const specPath = "../../docs/openapi.yaml"

// chi spells a catch-all "/uploads/*"; OpenAPI has no wildcard, so the spec
// names the segment. Map between the two rather than loosening the comparison.
var patternAliases = map[string]string{
	"/uploads/*": "/uploads/{path}",
}

var httpVerbs = map[string]bool{
	"get": true, "post": true, "put": true, "patch": true,
	"delete": true, "head": true, "options": true,
}

func routeKey(method, pattern string) string {
	return strings.ToUpper(method) + " " + pattern
}

func readSpec(t *testing.T) []string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(specPath))
	if err != nil {
		t.Fatalf("read %s: %v", specPath, err)
	}
	return strings.Split(string(raw), "\n")
}

// mountedRoutes walks the router that cmd/api actually serves.
func mountedRoutes(t *testing.T) map[string]bool {
	t.Helper()

	// Handlers over nil dependencies: chi only needs something non-nil to mount,
	// and no request is ever served here.
	// Every optional handler must be supplied. Several routes are mounted only
	// when their handler is non-nil, so a nil here would silently drop them
	// from the comparison and let an undocumented route pass — which is exactly
	// what this test exists to prevent.
	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:      httpdelivery.NewAuthHandler(nil, nil),
		Register:  httpdelivery.NewRegistrationHandler(nil, nil),
		Users:     httpdelivery.NewUserHandler(nil),
		Decks:     httpdelivery.NewDeckHandler(nil),
		Uploads:   httpdelivery.NewUploadHandler(nil, 0),
		Favorites: httpdelivery.NewFavoriteHandler(nil),
		Tokens:    httpdelivery.NewTokenManager("test-secret", 0),
		// Non-empty so the static /uploads/* route is mounted; never read from.
		UploadDir: t.TempDir(),
	})

	mux, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("router does not expose chi.Routes; cannot enumerate mounted routes")
	}

	found := map[string]bool{}
	err := chi.Walk(mux, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		// chi reports "/decks/" for a subrouter index; the spec calls it "/decks".
		route = strings.TrimSuffix(route, "/")
		if route == "" {
			route = "/"
		}
		if alias, ok := patternAliases[route]; ok {
			route = alias
		}
		// CORS preflight is added by middleware to every route — a transport
		// concern, not an operation anyone documents.
		if strings.EqualFold(method, http.MethodOptions) {
			return nil
		}
		found[routeKey(method, route)] = true
		return nil
	})
	if err != nil {
		t.Fatalf("walk routes: %v", err)
	}
	return found
}

// documentedRoutes reads the operations declared under `paths:`.
//
// Path items are indented two spaces and start with "/"; their verbs are
// indented four. Anything deeper, and any non-verb key (parameters, summary),
// is ignored.
func documentedRoutes(t *testing.T) map[string]bool {
	t.Helper()

	var (
		pathItem = regexp.MustCompile(`^  (/\S*):\s*$`)
		verbItem = regexp.MustCompile(`^    ([a-z]+):\s*$`)
	)

	documented := map[string]bool{}
	inPaths, current := false, ""

	for _, line := range readSpec(t) {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		// A non-indented key ends the paths section.
		if !strings.HasPrefix(line, " ") {
			inPaths = line == "paths:"
			current = ""
			continue
		}
		if !inPaths {
			continue
		}
		if m := pathItem.FindStringSubmatch(line); m != nil {
			current = m[1]
			continue
		}
		if m := verbItem.FindStringSubmatch(line); m != nil && current != "" {
			if httpVerbs[m[1]] {
				documented[routeKey(m[1], current)] = true
			}
		}
	}

	if len(documented) == 0 {
		t.Fatalf("no operations parsed from %s — has the file structure changed?", specPath)
	}
	return documented
}

func TestOpenAPIMatchesRouter(t *testing.T) {
	mounted := mountedRoutes(t)
	documented := documentedRoutes(t)

	var undocumented, phantom []string
	for k := range mounted {
		if !documented[k] {
			undocumented = append(undocumented, k)
		}
	}
	for k := range documented {
		if !mounted[k] {
			phantom = append(phantom, k)
		}
	}
	sort.Strings(undocumented)
	sort.Strings(phantom)

	if len(undocumented) > 0 {
		t.Errorf("mounted but missing from %s:\n  %s", specPath, strings.Join(undocumented, "\n  "))
	}
	if len(phantom) > 0 {
		t.Errorf("documented in %s but not mounted:\n  %s", specPath, strings.Join(phantom, "\n  "))
	}
	if !t.Failed() {
		t.Logf("%d operations, all documented", len(mounted))
	}
}

// TestOpenAPIRefsResolve catches the other common rot: a $ref pointing at a
// schema that was renamed or removed. A dangling ref breaks generated clients
// and doc viewers in ways that are tedious to trace back here.
func TestOpenAPIRefsResolve(t *testing.T) {
	lines := readSpec(t)

	// Definitions live two levels under `components:` — section at two spaces,
	// name at four.
	var (
		sectionRe = regexp.MustCompile(`^  ([A-Za-z]+):\s*$`)
		nameRe    = regexp.MustCompile(`^    ([A-Za-z0-9_]+):\s*$`)
		refRe     = regexp.MustCompile(`\$ref:\s*"?(#/[^"'\s]+)"?`)
	)

	defined := map[string]bool{} // "components/schemas/Deck" → true
	inComponents, section := false, ""

	for _, line := range lines {
		if strings.TrimSpace(line) == "" || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		if !strings.HasPrefix(line, " ") {
			inComponents = line == "components:"
			section = ""
			continue
		}
		if !inComponents {
			continue
		}
		if m := sectionRe.FindStringSubmatch(line); m != nil {
			section = m[1]
			continue
		}
		if m := nameRe.FindStringSubmatch(line); m != nil && section != "" {
			defined["components/"+section+"/"+m[1]] = true
		}
	}

	if len(defined) == 0 {
		t.Fatalf("no component definitions parsed from %s", specPath)
	}

	seen := map[string]bool{}
	total := 0
	for _, line := range lines {
		for _, m := range refRe.FindAllStringSubmatch(line, -1) {
			total++
			target := strings.TrimPrefix(m[1], "#/")
			if seen[target] {
				continue
			}
			seen[target] = true
			if !defined[target] {
				t.Errorf("$ref #/%s does not resolve — renamed or removed?", target)
			}
		}
	}
	if total == 0 {
		t.Fatal("expected the spec to use $ref")
	}
	if !t.Failed() {
		t.Logf("%d $ref uses across %d distinct targets, all resolve", total, len(seen))
	}
}
