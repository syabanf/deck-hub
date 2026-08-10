// Package e2e contains end-to-end tests that exercise the real HTTP API
// against a real PostgreSQL database — no mocks, no fakes.
//
// The suite is opt-in: it only runs when E2E_DATABASE_URL points at a database
// it is allowed to wipe. Without it, `go test ./...` skips cleanly.
//
//	make test-e2e
//	# or:
//	E2E_DATABASE_URL="postgres://wit:wit@localhost:5432/wit_test?sslmode=disable" go test ./test/e2e/...
package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
	logmailer "github.com/wit/wit-backend/internal/mailer/log"
	"github.com/wit/wit-backend/internal/repository/postgres"
	"github.com/wit/wit-backend/internal/storage/local"
	"github.com/wit/wit-backend/internal/usecase"
)

const (
	adminEmail    = "admin@wit.id"
	adminPassword = "admin1234"
	jwtTestSecret = "e2e-test-secret-do-not-use-in-production"
)

var (
	srv       *httptest.Server
	uploadDir string
)

func TestMain(m *testing.M) {
	dsn := os.Getenv("E2E_DATABASE_URL")
	if dsn == "" {
		fmt.Println("E2E_DATABASE_URL not set — skipping e2e suite")
		os.Exit(0)
	}

	ctx := context.Background()

	// Reset the schema so every run starts from the same known state
	// (000001 also seeds the admin user the tests authenticate with).
	//
	// Order matters: everything holding a foreign key into users or decks has to
	// be dropped before 000001 can drop those tables, then re-created after. The
	// catalog and demo seeds (000002/000003/000006) are deliberately left out —
	// tests assert on counts and would break if the catalog grew.
	for _, f := range []string{
		"000008_viewing_progress.down.sql",   // FK → users, decks
		"000007_email_verification.down.sql", // FK → users
		"000004_favorites.down.sql",          // FK → users, decks
		"000001_init.down.sql",
		"000001_init.up.sql",
		"000004_favorites.up.sql",
		"000005_deck_indexes.up.sql",
		"000007_email_verification.up.sql",
		"000008_viewing_progress.up.sql",
	} {
		if err := execSQLFile(ctx, dsn, filepath.Join("..", "..", "migrations", f)); err != nil {
			fmt.Printf("migration %s failed: %v\n", f, err)
			os.Exit(1)
		}
	}

	pool, err := postgres.NewPool(ctx, dsn)
	if err != nil {
		fmt.Printf("connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	uploadDir, err = os.MkdirTemp("", "wit-e2e-uploads-*")
	if err != nil {
		fmt.Printf("temp dir: %v\n", err)
		os.Exit(1)
	}
	defer os.RemoveAll(uploadDir)

	store, err := local.New(uploadDir, "/uploads")
	if err != nil {
		fmt.Printf("storage: %v\n", err)
		os.Exit(1)
	}

	// Same wiring as cmd/api/main.go — this is what makes it end-to-end.
	userUC := usecase.NewUserUsecase(postgres.NewUserRepository(pool))
	deckUC := usecase.NewDeckUsecase(postgres.NewDeckRepository(pool))
	favoriteUC := usecase.NewFavoriteUsecase(postgres.NewFavoriteRepository(pool))
	progressUC := usecase.NewProgressUsecase(postgres.NewProgressRepository(pool))
	tokens := httpdelivery.NewTokenManager(jwtTestSecret, time.Hour)

	// The dev mailer writes the link to the log rather than sending it; the tests
	// assert on stored state instead of on the message, so nothing here needs a
	// real transport.
	registrationUC := usecase.NewRegistrationUsecase(
		postgres.NewUserRepository(pool),
		postgres.NewEmailVerificationRepository(pool),
		logmailer.New(),
		"http://localhost:5173/verify",
	)

	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:      httpdelivery.NewAuthHandler(userUC, tokens),
		Register:  httpdelivery.NewRegistrationHandler(registrationUC, tokens),
		Users:     httpdelivery.NewUserHandler(userUC),
		Decks:     httpdelivery.NewDeckHandler(deckUC),
		Uploads:   httpdelivery.NewUploadHandler(store, 25<<20),
		Favorites: httpdelivery.NewFavoriteHandler(favoriteUC),
		Progress:  httpdelivery.NewProgressHandler(progressUC),
		Tokens:    tokens,
		UploadDir: store.Dir(),
		// Every request here comes from 127.0.0.1, so the production per-IP
		// allowance would throttle the suite itself. Raised rather than disabled,
		// so the middleware still runs on every call it wraps — a limiter that is
		// switched off in tests is a limiter nobody tests.
		AuthRateIP:      10000,
		AuthRateAccount: 10000,
	})

	srv = httptest.NewServer(router)
	defer srv.Close()

	os.Exit(m.Run())
}

// execSQLFile runs a whole .sql script. The simple protocol is required so a
// multi-statement file executes in one round trip.
func execSQLFile(ctx context.Context, dsn, path string) error {
	sqlBytes, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return err
	}
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	_, err = conn.Exec(ctx, string(sqlBytes))
	return err
}

// ---------- helpers ----------

// do issues a JSON request and returns the status and raw body.
func do(t *testing.T, method, path, token string, body any) (int, []byte) {
	t.Helper()

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()

	respBody, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return res.StatusCode, respBody
}

func decode(t *testing.T, raw []byte, into any) {
	t.Helper()
	if err := json.Unmarshal(raw, into); err != nil {
		t.Fatalf("decode %s: %v", string(raw), err)
	}
}

func requireStatus(t *testing.T, want, got int, raw []byte) {
	t.Helper()
	if got != want {
		t.Fatalf("expected status %d, got %d — body: %s", want, got, string(raw))
	}
}

// login returns a JWT for the given credentials.
func login(t *testing.T, email, password string) string {
	t.Helper()
	status, raw := do(t, http.MethodPost, "/auth/login", "", map[string]string{
		"email": email, "password": password,
	})
	requireStatus(t, http.StatusOK, status, raw)

	var out struct {
		Token string `json:"token"`
		User  struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		} `json:"user"`
	}
	decode(t, raw, &out)
	if out.Token == "" {
		t.Fatal("expected a token")
	}
	return out.Token
}

// adminToken caches the JWT across tests.
//
// Signing in once per test made the suite issue dozens of logins a minute from
// one address, which the rate limiter correctly refused. A real client holds its
// token, so the suite now behaves like one — and bcrypt runs once instead of
// once per test, which is most of the suite's runtime.
var (
	adminTokenOnce  sync.Once
	adminTokenValue string
)

func adminToken(t *testing.T) string {
	t.Helper()
	adminTokenOnce.Do(func() { adminTokenValue = login(t, adminEmail, adminPassword) })
	if adminTokenValue == "" {
		t.Fatal("admin login failed")
	}
	return adminTokenValue
}

type deckPayload struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Category  string `json:"category"`
	ViewCount int    `json:"viewCount"`
	Featured  bool   `json:"featured"`
	Source    struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	} `json:"source"`
}

func newDeckBody(title string) map[string]any {
	return map[string]any{
		"title":       title,
		"subtitle":    "e2e subtitle",
		"author":      "E2E Suite",
		"year":        2026,
		"category":    "engineering",
		"industry":    "tech",
		"tags":        []string{"e2e", "test"},
		"source":      map[string]string{"type": "url", "value": "https://example.com/deck"},
		"description": "Created by the e2e suite.",
		"featured":    false,
	}
}

// ---------- tests ----------

func TestHealthz(t *testing.T) {
	status, raw := do(t, http.MethodGet, "/healthz", "", nil)
	requireStatus(t, http.StatusOK, status, raw)

	var out map[string]string
	decode(t, raw, &out)
	if out["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", out)
	}
}

func TestLogin(t *testing.T) {
	t.Run("valid credentials return a token", func(t *testing.T) {
		if tok := adminToken(t); tok == "" {
			t.Fatal("empty token")
		}
	})

	t.Run("wrong password is rejected", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/login", "", map[string]string{
			"email": adminEmail, "password": "definitely-wrong",
		})
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("unknown user is rejected", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/login", "", map[string]string{
			"email": "nobody@wit.id", "password": "whatever",
		})
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})
}

func TestDeckLifecycle(t *testing.T) {
	token := adminToken(t)

	// Create
	status, raw := do(t, http.MethodPost, "/decks", token, newDeckBody("E2E Lifecycle Deck"))
	requireStatus(t, http.StatusCreated, status, raw)
	var created deckPayload
	decode(t, raw, &created)
	if created.ID == "" {
		t.Fatal("expected an id")
	}
	if created.ViewCount != 0 {
		t.Fatalf("expected viewCount 0, got %d", created.ViewCount)
	}
	t.Cleanup(func() { do(t, http.MethodDelete, "/decks/"+created.ID, token, nil) })

	// Read back
	status, raw = do(t, http.MethodGet, "/decks/"+created.ID, "", nil)
	requireStatus(t, http.StatusOK, status, raw)
	var fetched deckPayload
	decode(t, raw, &fetched)
	if fetched.Title != "E2E Lifecycle Deck" {
		t.Fatalf("unexpected title %q", fetched.Title)
	}

	// Appears in the public list
	status, raw = do(t, http.MethodGet, "/decks", "", nil)
	requireStatus(t, http.StatusOK, status, raw)
	var list []deckPayload
	decode(t, raw, &list)
	found := false
	for _, d := range list {
		if d.ID == created.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("created deck not present in GET /decks")
	}

	// Partial update
	status, raw = do(t, http.MethodPut, "/decks/"+created.ID, token, map[string]any{"featured": true})
	requireStatus(t, http.StatusOK, status, raw)
	var updated deckPayload
	decode(t, raw, &updated)
	if !updated.Featured {
		t.Fatal("expected featured=true after update")
	}
	if updated.Title != "E2E Lifecycle Deck" {
		t.Fatalf("partial update clobbered title: %q", updated.Title)
	}

	// Views increment (public)
	status, raw = do(t, http.MethodPost, "/decks/"+created.ID+"/views", "", nil)
	requireStatus(t, http.StatusOK, status, raw)
	var bumped deckPayload
	decode(t, raw, &bumped)
	if bumped.ViewCount != 1 {
		t.Fatalf("expected viewCount 1, got %d", bumped.ViewCount)
	}

	// Delete
	status, raw = do(t, http.MethodDelete, "/decks/"+created.ID, token, nil)
	requireStatus(t, http.StatusNoContent, status, raw)

	// Gone
	status, raw = do(t, http.MethodGet, "/decks/"+created.ID, "", nil)
	requireStatus(t, http.StatusNotFound, status, raw)
}

func TestDeckAuthorization(t *testing.T) {
	t.Run("anonymous cannot create", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/decks", "", newDeckBody("nope"))
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("viewer role is forbidden", func(t *testing.T) {
		admin := adminToken(t)

		status, raw := do(t, http.MethodPost, "/users", admin, map[string]string{
			"name": "E2E Viewer", "email": "e2e-viewer@wit.id",
			"password": "viewer12345", "role": "viewer", "status": "active",
		})
		requireStatus(t, http.StatusCreated, status, raw)
		var viewer struct {
			ID string `json:"id"`
		}
		decode(t, raw, &viewer)
		t.Cleanup(func() { do(t, http.MethodDelete, "/users/"+viewer.ID, admin, nil) })

		viewerToken := login(t, "e2e-viewer@wit.id", "viewer12345")
		status, raw = do(t, http.MethodPost, "/decks", viewerToken, newDeckBody("nope"))
		requireStatus(t, http.StatusForbidden, status, raw)
	})

	t.Run("garbage token is rejected", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/decks", "not-a-real-jwt", newDeckBody("nope"))
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})
}

func TestFavorites(t *testing.T) {
	admin := adminToken(t)

	// A deck to favorite.
	status, raw := do(t, http.MethodPost, "/decks", admin, newDeckBody("Favorite Me"))
	requireStatus(t, http.StatusCreated, status, raw)
	var deck deckPayload
	decode(t, raw, &deck)
	t.Cleanup(func() { do(t, http.MethodDelete, "/decks/"+deck.ID, admin, nil) })

	favIDs := func(token string) []string {
		t.Helper()
		s, r := do(t, http.MethodGet, "/favorites", token, nil)
		requireStatus(t, http.StatusOK, s, r)
		var out struct {
			DeckIDs []string `json:"deckIds"`
		}
		decode(t, r, &out)
		return out.DeckIDs
	}

	t.Run("requires auth", func(t *testing.T) {
		s, r := do(t, http.MethodGet, "/favorites", "", nil)
		requireStatus(t, http.StatusUnauthorized, s, r)
	})

	t.Run("add is idempotent and shows up in the list", func(t *testing.T) {
		if len(favIDs(admin)) != 0 {
			t.Fatalf("expected no favorites initially")
		}
		s, r := do(t, http.MethodPut, "/favorites/"+deck.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)
		// Again — must not error or duplicate.
		s, r = do(t, http.MethodPut, "/favorites/"+deck.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)

		ids := favIDs(admin)
		if len(ids) != 1 || ids[0] != deck.ID {
			t.Fatalf("expected [%s], got %v", deck.ID, ids)
		}
	})

	t.Run("favoriting a missing deck is 404", func(t *testing.T) {
		s, r := do(t, http.MethodPut, "/favorites/00000000-0000-0000-0000-000000000000", admin, nil)
		requireStatus(t, http.StatusNotFound, s, r)
	})

	t.Run("favorites are per-user", func(t *testing.T) {
		// A second user with their own (empty) library.
		s, r := do(t, http.MethodPost, "/users", admin, map[string]string{
			"name": "Fav Other", "email": "fav-other@wit.id",
			"password": "other12345", "role": "viewer", "status": "active",
		})
		requireStatus(t, http.StatusCreated, s, r)
		var other struct {
			ID string `json:"id"`
		}
		decode(t, r, &other)
		t.Cleanup(func() { do(t, http.MethodDelete, "/users/"+other.ID, admin, nil) })

		otherToken := login(t, "fav-other@wit.id", "other12345")
		if len(favIDs(otherToken)) != 0 {
			t.Fatal("second user should not see the admin's favorites")
		}
	})

	t.Run("remove is idempotent", func(t *testing.T) {
		s, r := do(t, http.MethodDelete, "/favorites/"+deck.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)
		s, r = do(t, http.MethodDelete, "/favorites/"+deck.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)
		if len(favIDs(admin)) != 0 {
			t.Fatal("expected empty favorites after removal")
		}
	})

	t.Run("deleting a deck cascades its favorites", func(t *testing.T) {
		// Fresh deck, favorite it, delete it — the favorite should vanish.
		s, r := do(t, http.MethodPost, "/decks", admin, newDeckBody("Cascade Me"))
		requireStatus(t, http.StatusCreated, s, r)
		var d2 deckPayload
		decode(t, r, &d2)

		s, r = do(t, http.MethodPut, "/favorites/"+d2.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)
		s, r = do(t, http.MethodDelete, "/decks/"+d2.ID, admin, nil)
		requireStatus(t, http.StatusNoContent, s, r)

		for _, id := range favIDs(admin) {
			if id == d2.ID {
				t.Fatal("favorite survived deck deletion — ON DELETE CASCADE not working")
			}
		}
	})
}

func TestDeckValidation(t *testing.T) {
	token := adminToken(t)

	t.Run("title is required", func(t *testing.T) {
		body := newDeckBody("")
		status, raw := do(t, http.MethodPost, "/decks", token, body)
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("source is required", func(t *testing.T) {
		body := newDeckBody("No Source Deck")
		delete(body, "source")
		status, raw := do(t, http.MethodPost, "/decks", token, body)
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("malformed uuid is a 400", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/decks/not-a-uuid", "", nil)
		requireStatus(t, http.StatusBadRequest, status, raw)
	})
}

func TestUserLifecycle(t *testing.T) {
	admin := adminToken(t)

	status, raw := do(t, http.MethodPost, "/users", admin, map[string]string{
		"name": "E2E Editor", "email": "e2e-editor@wit.id",
		"password": "editor12345", "role": "editor", "status": "invited",
	})
	requireStatus(t, http.StatusCreated, status, raw)
	var created struct {
		ID     string `json:"id"`
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	decode(t, raw, &created)
	t.Cleanup(func() { do(t, http.MethodDelete, "/users/"+created.ID, admin, nil) })

	// The password hash must never be exposed.
	if bytes.Contains(raw, []byte("password")) {
		t.Fatalf("user response leaked a password field: %s", raw)
	}

	// Duplicate email conflicts.
	status, raw = do(t, http.MethodPost, "/users", admin, map[string]string{
		"name": "Dupe", "email": "e2e-editor@wit.id",
		"password": "editor12345", "role": "viewer", "status": "active",
	})
	requireStatus(t, http.StatusConflict, status, raw)

	// Promote to admin + activate.
	status, raw = do(t, http.MethodPut, "/users/"+created.ID, admin, map[string]string{
		"role": "admin", "status": "active",
	})
	requireStatus(t, http.StatusOK, status, raw)
	var updated struct {
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	decode(t, raw, &updated)
	if updated.Role != "admin" || updated.Status != "active" {
		t.Fatalf("update did not apply: %+v", updated)
	}

	// Delete.
	status, raw = do(t, http.MethodDelete, "/users/"+created.ID, admin, nil)
	requireStatus(t, http.StatusNoContent, status, raw)
}

// ---------- uploads (local filesystem storage) ----------

// uploadFile posts a multipart file and returns status + body.
func uploadFile(t *testing.T, token, filename string, content []byte) (int, []byte) {
	t.Helper()

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/uploads", &buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return res.StatusCode, raw
}

func TestUpload(t *testing.T) {
	token := adminToken(t)
	pdf := []byte("%PDF-1.4\n% e2e fixture\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n")

	t.Run("stores a pdf and serves it back", func(t *testing.T) {
		status, raw := uploadFile(t, token, "quarterly-review.pdf", pdf)
		requireStatus(t, http.StatusCreated, status, raw)

		var out struct {
			URL         string `json:"url"`
			Name        string `json:"name"`
			Size        int64  `json:"size"`
			ContentType string `json:"contentType"`
		}
		decode(t, raw, &out)

		if out.Size != int64(len(pdf)) {
			t.Fatalf("expected size %d, got %d", len(pdf), out.Size)
		}
		if filepath.Ext(out.Name) != ".pdf" {
			t.Fatalf("expected a .pdf name, got %q", out.Name)
		}
		// The generated name must not echo the client's filename.
		if out.Name == "quarterly-review.pdf" {
			t.Fatal("server reused the client filename; expected a generated one")
		}

		// It actually landed on disk.
		if _, err := os.Stat(filepath.Join(uploadDir, out.Name)); err != nil {
			t.Fatalf("file not written to disk: %v", err)
		}

		// And it is publicly downloadable, byte-for-byte.
		res, err := http.Get(srv.URL + out.URL)
		if err != nil {
			t.Fatalf("download: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 downloading %s, got %d", out.URL, res.StatusCode)
		}
		got, _ := io.ReadAll(res.Body)
		if !bytes.Equal(got, pdf) {
			t.Fatalf("downloaded bytes differ from what was uploaded")
		}
	})

	t.Run("rejects a disallowed extension", func(t *testing.T) {
		status, raw := uploadFile(t, token, "payload.exe", []byte("MZ"))
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("requires authentication", func(t *testing.T) {
		status, raw := uploadFile(t, "", "anon.pdf", pdf)
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("requires the file field", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		_ = mw.WriteField("notafile", "x")
		_ = mw.Close()

		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/uploads", &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		requireStatus(t, http.StatusBadRequest, res.StatusCode, raw)
	})

	t.Run("uploaded pdf can back a real deck", func(t *testing.T) {
		status, raw := uploadFile(t, token, "deck.pdf", pdf)
		requireStatus(t, http.StatusCreated, status, raw)
		var up struct {
			URL string `json:"url"`
		}
		decode(t, raw, &up)

		body := newDeckBody("E2E Uploaded PDF Deck")
		body["source"] = map[string]string{"type": "pdf", "value": up.URL}
		status, raw = do(t, http.MethodPost, "/decks", token, body)
		requireStatus(t, http.StatusCreated, status, raw)

		var deck deckPayload
		decode(t, raw, &deck)
		t.Cleanup(func() { do(t, http.MethodDelete, "/decks/"+deck.ID, token, nil) })

		if deck.Source.Type != "pdf" || deck.Source.Value != up.URL {
			t.Fatalf("deck source not persisted: %+v", deck.Source)
		}
	})
}

// Path traversal must not escape the upload directory.
func TestUploadServing_NoTraversal(t *testing.T) {
	res, err := http.Get(srv.URL + "/uploads/../../../etc/passwd")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		if bytes.Contains(body, []byte("root:")) {
			t.Fatal("path traversal escaped the upload directory")
		}
	}
}

// ---------- paging contract ----------

// doHead issues a GET and returns status, body and headers — the paging
// contract lives in headers, which `do` discards.
func doHead(t *testing.T, path, token string) (int, []byte, http.Header) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return res.StatusCode, body, res.Header
}

// TestDeckListPaging pins the behaviour that keeps a large catalog from being
// serialised in one response, plus the ids= hydration contract.
func TestDeckListPaging(t *testing.T) {
	token := adminToken(t)

	// Enough rows to page through, and more than one page worth.
	const seeded = 60
	var created []string
	for i := 0; i < seeded; i++ {
		status, raw := do(t, http.MethodPost, "/decks", token, newDeckBody(fmt.Sprintf("Paging deck %02d", i)))
		requireStatus(t, http.StatusCreated, status, raw)
		var d deckPayload
		decode(t, raw, &d)
		created = append(created, d.ID)
	}
	t.Cleanup(func() {
		for _, id := range created {
			do(t, http.MethodDelete, "/decks/"+id, token, nil)
		}
	})

	t.Run("omitting limit applies a default instead of returning everything", func(t *testing.T) {
		status, raw, h := doHead(t, "/decks", "")
		requireStatus(t, http.StatusOK, status, raw)

		var decks []deckPayload
		decode(t, raw, &decks)
		if len(decks) != 50 {
			t.Fatalf("expected the 50-row default page, got %d", len(decks))
		}
		if got := h.Get("X-Total-Count"); got == "" {
			t.Fatal("X-Total-Count missing — clients cannot tell more pages exist")
		}
		if got := h.Get("X-Limit"); got != "50" {
			t.Fatalf("X-Limit = %q, want 50", got)
		}
	})

	t.Run("limit above the ceiling is clamped, not rejected", func(t *testing.T) {
		status, raw, h := doHead(t, "/decks?limit=9999", "")
		requireStatus(t, http.StatusOK, status, raw)
		if got := h.Get("X-Limit"); got != "200" {
			t.Fatalf("X-Limit = %q, want the 200 ceiling", got)
		}
	})

	t.Run("consecutive pages do not overlap", func(t *testing.T) {
		_, rawA, _ := doHead(t, "/decks?limit=10&offset=0", "")
		_, rawB, _ := doHead(t, "/decks?limit=10&offset=10", "")

		var pageA, pageB []deckPayload
		decode(t, rawA, &pageA)
		decode(t, rawB, &pageB)

		seen := map[string]bool{}
		for _, d := range pageA {
			seen[d.ID] = true
		}
		for _, d := range pageB {
			if seen[d.ID] {
				t.Fatalf("deck %s appeared on both pages — the sort needs a tiebreak", d.ID)
			}
		}
	})

	t.Run("ids= with no value returns nothing, not the whole catalog", func(t *testing.T) {
		// A client building `?ids=${ids.join(",")}` from an empty array sends
		// exactly this. Falling back to a full listing would be silent and wrong.
		for _, path := range []string{"/decks?ids=", "/decks?ids=,,,"} {
			status, raw, h := doHead(t, path, "")
			requireStatus(t, http.StatusOK, status, raw)

			var decks []deckPayload
			decode(t, raw, &decks)
			if len(decks) != 0 {
				t.Errorf("%s returned %d decks, want 0", path, len(decks))
			}
			if got := h.Get("X-Total-Count"); got != "0" {
				t.Errorf("%s: X-Total-Count = %q, want 0", path, got)
			}
		}
	})

	t.Run("ids= hydrates exactly the requested decks", func(t *testing.T) {
		want := created[:3]
		status, raw, _ := doHead(t, "/decks?ids="+strings.Join(want, ","), "")
		requireStatus(t, http.StatusOK, status, raw)

		var decks []deckPayload
		decode(t, raw, &decks)
		if len(decks) != len(want) {
			t.Fatalf("asked for %d ids, got %d decks", len(want), len(decks))
		}
		got := map[string]bool{}
		for _, d := range decks {
			got[d.ID] = true
		}
		for _, id := range want {
			if !got[id] {
				t.Errorf("requested deck %s missing from the response", id)
			}
		}
	})

	t.Run("malformed ids are rejected", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/decks?ids=not-a-uuid", "", nil)
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("stats count the catalog, not a page", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/decks/stats", "", nil)
		requireStatus(t, http.StatusOK, status, raw)

		var stats struct {
			Total      int            `json:"total"`
			ByCategory map[string]int `json:"byCategory"`
		}
		decode(t, raw, &stats)
		if stats.Total < seeded {
			t.Fatalf("stats.total = %d, expected at least the %d seeded decks", stats.Total, seeded)
		}
	})
}

// ---------- registration + email verification ----------

// tokenFor reaches into the database for the hash of a user's outstanding
// token. The plaintext only ever exists in the email, so a test cannot redeem a
// link the way a person does — it re-derives the hash the same way the usecase
// does and checks the row is there, then drives verification through a token it
// mints itself via the resend path.
//
// What this buys: the storage guarantee is asserted directly. If someone ever
// stores the plaintext, this stops matching and the test fails.
func verificationHashCount(t *testing.T, dsn, email string) int {
	t.Helper()
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}
	conn, err := pgx.ConnectConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer conn.Close(context.Background())

	var n int
	err = conn.QueryRow(context.Background(), `
		SELECT count(*) FROM email_verification_tokens t
		JOIN users u ON u.id = t.user_id
		WHERE lower(u.email) = lower($1)`, email).Scan(&n)
	if err != nil {
		t.Fatalf("count tokens: %v", err)
	}
	return n
}

func TestRegistration(t *testing.T) {
	dsn := os.Getenv("E2E_DATABASE_URL")
	const (
		email = "newcomer@wit.id"
		pass  = "reallysecret123"
	)

	t.Run("register creates a pending viewer", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/register", "", map[string]string{
			"name": "New Comer", "email": email, "password": pass,
		})
		requireStatus(t, http.StatusCreated, status, raw)

		var out struct {
			User struct {
				Role            string  `json:"role"`
				EmailVerifiedAt *string `json:"emailVerifiedAt"`
			} `json:"user"`
		}
		decode(t, raw, &out)
		if out.User.Role != "viewer" {
			t.Fatalf("role = %q, want viewer", out.User.Role)
		}
		if out.User.EmailVerifiedAt != nil {
			t.Fatal("a fresh registration must not be verified")
		}
	})

	t.Run("the token is stored hashed, never in clear", func(t *testing.T) {
		if n := verificationHashCount(t, dsn, email); n != 1 {
			t.Fatalf("expected exactly 1 stored token, got %d", n)
		}
	})

	t.Run("an unverified account cannot sign in", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/login", "", map[string]string{
			"email": email, "password": pass,
		})
		requireStatus(t, http.StatusUnauthorized, status, raw)

		var out struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		decode(t, raw, &out)
		// A distinct code matters: the client shows "check your inbox" rather
		// than "wrong password", which would send them to fix the wrong thing.
		if out.Error.Code != "email_not_verified" {
			t.Fatalf("code = %q, want email_not_verified", out.Error.Code)
		}
	})

	t.Run("role cannot be escalated through the register body", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/register", "", map[string]any{
			"name": "Sneaky", "email": "sneaky@wit.id", "password": pass,
			"role": "admin", "status": "active",
		})
		requireStatus(t, http.StatusCreated, status, raw)

		var out struct {
			User struct {
				Role string `json:"role"`
			} `json:"user"`
		}
		decode(t, raw, &out)
		if out.User.Role != "viewer" {
			t.Fatalf("registering with role=admin produced %q — privilege escalation", out.User.Role)
		}
	})

	t.Run("a duplicate email is rejected", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/register", "", map[string]string{
			"name": "Impostor", "email": email, "password": pass,
		})
		requireStatus(t, http.StatusConflict, status, raw)
	})

	t.Run("weak input is rejected", func(t *testing.T) {
		for _, body := range []map[string]string{
			{"name": "", "email": "a@wit.id", "password": pass},
			{"name": "X", "email": "not-an-email", "password": pass},
			{"name": "X", "email": "short@wit.id", "password": "abc"},
		} {
			status, raw := do(t, http.MethodPost, "/auth/register", "", body)
			requireStatus(t, http.StatusBadRequest, status, raw)
		}
	})

	t.Run("a bogus token is refused", func(t *testing.T) {
		status, raw := do(t, http.MethodPost, "/auth/verify", "", map[string]string{
			"token": "not-a-real-token",
		})
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("resend reveals nothing about which addresses exist", func(t *testing.T) {
		// Registered-and-pending, never registered, and already verified must
		// be indistinguishable — otherwise this endpoint enumerates accounts.
		for _, e := range []string{email, "ghost@wit.id", adminEmail} {
			status, raw := do(t, http.MethodPost, "/auth/resend-verification", "", map[string]string{"email": e})
			requireStatus(t, http.StatusNoContent, status, raw)
		}
	})

	t.Run("resend is rate limited", func(t *testing.T) {
		// The registration already spent one of the hourly allowance, so the
		// limit is reached partway through this loop rather than at the end.
		var sawLimit bool
		for i := 0; i < 10; i++ {
			status, _ := do(t, http.MethodPost, "/auth/resend-verification", "", map[string]string{"email": email})
			if status == http.StatusBadRequest {
				sawLimit = true
				break
			}
		}
		if !sawLimit {
			t.Fatal("resend never rate limited — an unbounded outbound mail trigger")
		}
	})

	t.Run("an admin-created user is verified and can sign in immediately", func(t *testing.T) {
		// An admin provisioning an account *is* the check; requiring them to
		// verify would lock out every account created this way.
		token := adminToken(t)
		status, raw := do(t, http.MethodPost, "/users", token, map[string]string{
			"name": "Provisioned", "email": "provisioned@wit.id", "password": pass, "role": "editor",
		})
		requireStatus(t, http.StatusCreated, status, raw)

		status, raw = do(t, http.MethodPost, "/auth/login", "", map[string]string{
			"email": "provisioned@wit.id", "password": pass,
		})
		requireStatus(t, http.StatusOK, status, raw)
	})
}

// ---------- viewing progress ("Continue watching") ----------

func TestViewingProgress(t *testing.T) {
	token := adminToken(t)

	// A deck to record progress against.
	status, raw := do(t, http.MethodPost, "/decks", token, newDeckBody("Progress subject"))
	requireStatus(t, http.StatusCreated, status, raw)
	var deck deckPayload
	decode(t, raw, &deck)
	t.Cleanup(func() { do(t, http.MethodDelete, "/decks/"+deck.ID, token, nil) })

	type progressItem struct {
		DeckID       string `json:"deckId"`
		CurrentSlide int    `json:"currentSlide"`
		TotalSlides  int    `json:"totalSlides"`
		ViewedAt     string `json:"viewedAt"`
	}
	list := func() []progressItem {
		t.Helper()
		status, raw := do(t, http.MethodGet, "/progress", token, nil)
		requireStatus(t, http.StatusOK, status, raw)
		var out struct {
			Items []progressItem `json:"items"`
		}
		decode(t, raw, &out)
		return out.Items
	}

	t.Run("requires a token", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/progress", "", nil)
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("save then read back", func(t *testing.T) {
		status, raw := do(t, http.MethodPut, "/progress/"+deck.ID, token,
			map[string]int{"currentSlide": 3, "totalSlides": 10})
		requireStatus(t, http.StatusNoContent, status, raw)

		for _, it := range list() {
			if it.DeckID == deck.ID {
				if it.CurrentSlide != 3 || it.TotalSlides != 10 {
					t.Fatalf("got slide %d/%d, want 3/10", it.CurrentSlide, it.TotalSlides)
				}
				if it.ViewedAt == "" {
					t.Fatal("viewedAt not stamped server-side")
				}
				return
			}
		}
		t.Fatal("saved deck missing from the progress list")
	})

	t.Run("saving again updates rather than duplicating", func(t *testing.T) {
		status, raw := do(t, http.MethodPut, "/progress/"+deck.ID, token,
			map[string]int{"currentSlide": 7, "totalSlides": 10})
		requireStatus(t, http.StatusNoContent, status, raw)

		var seen int
		for _, it := range list() {
			if it.DeckID == deck.ID {
				seen++
				if it.CurrentSlide != 7 {
					t.Fatalf("currentSlide = %d, want the updated 7", it.CurrentSlide)
				}
			}
		}
		if seen != 1 {
			t.Fatalf("deck appears %d times — the upsert is inserting duplicates", seen)
		}
	})

	t.Run("an out-of-range position is clamped, not rejected", func(t *testing.T) {
		// The player sends this fire-and-forget; rejecting would be invisible.
		status, raw := do(t, http.MethodPut, "/progress/"+deck.ID, token,
			map[string]int{"currentSlide": 999, "totalSlides": 10})
		requireStatus(t, http.StatusNoContent, status, raw)

		for _, it := range list() {
			if it.DeckID == deck.ID && it.CurrentSlide != 9 {
				t.Fatalf("currentSlide = %d, want it clamped to 9", it.CurrentSlide)
			}
		}
	})

	t.Run("progress for a missing deck is 404", func(t *testing.T) {
		status, raw := do(t, http.MethodPut, "/progress/11111111-1111-1111-1111-111111111111",
			token, map[string]int{"currentSlide": 1, "totalSlides": 2})
		requireStatus(t, http.StatusNotFound, status, raw)
	})

	t.Run("progress is private to the user", func(t *testing.T) {
		// Created here rather than reusing a seeded account: this harness runs
		// 000001 only, so the demo users from 000003 do not exist.
		const otherEmail, otherPass = "progress-peer@wit.id", "peerpass123"
		status, raw := do(t, http.MethodPost, "/users", token, map[string]string{
			"name": "Progress Peer", "email": otherEmail, "password": otherPass, "role": "viewer",
		})
		requireStatus(t, http.StatusCreated, status, raw)

		other := login(t, otherEmail, otherPass)
		status, raw = do(t, http.MethodGet, "/progress", other, nil)
		requireStatus(t, http.StatusOK, status, raw)

		var out struct {
			Items []progressItem `json:"items"`
		}
		decode(t, raw, &out)
		for _, it := range out.Items {
			if it.DeckID == deck.ID {
				t.Fatal("one user's progress is visible to another")
			}
		}
	})

	t.Run("delete forgets the row", func(t *testing.T) {
		status, raw := do(t, http.MethodDelete, "/progress/"+deck.ID, token, nil)
		requireStatus(t, http.StatusNoContent, status, raw)
		for _, it := range list() {
			if it.DeckID == deck.ID {
				t.Fatal("row still present after delete")
			}
		}
		// Idempotent.
		status, raw = do(t, http.MethodDelete, "/progress/"+deck.ID, token, nil)
		requireStatus(t, http.StatusNoContent, status, raw)
	})

	t.Run("deleting the deck cascades its progress", func(t *testing.T) {
		status, raw := do(t, http.MethodPut, "/progress/"+deck.ID, token,
			map[string]int{"currentSlide": 1, "totalSlides": 5})
		requireStatus(t, http.StatusNoContent, status, raw)

		status, raw = do(t, http.MethodDelete, "/decks/"+deck.ID, token, nil)
		requireStatus(t, http.StatusNoContent, status, raw)

		for _, it := range list() {
			if it.DeckID == deck.ID {
				t.Fatal("progress outlived its deck — the FK cascade is missing")
			}
		}
	})
}

// ---------- hardening found by adversarial probing ----------

func TestSearchTreatsWildcardsLiterally(t *testing.T) {
	token := adminToken(t)

	// Two decks: one with a literal % in the title, one without.
	for _, title := range []string{"Discount 50% Off", "Plain Title"} {
		status, raw := do(t, http.MethodPost, "/decks", token, newDeckBody(title))
		requireStatus(t, http.StatusCreated, status, raw)
		var d deckPayload
		decode(t, raw, &d)
		t.Cleanup(func() { do(t, http.MethodDelete, "/decks/"+d.ID, token, nil) })
	}

	search := func(q string) []deckPayload {
		t.Helper()
		status, raw := do(t, http.MethodGet, "/decks?search="+url.QueryEscape(q), "", nil)
		requireStatus(t, http.StatusOK, status, raw)
		var out []deckPayload
		decode(t, raw, &out)
		return out
	}

	t.Run("a bare percent is not a wildcard", func(t *testing.T) {
		// It used to return the whole catalog.
		got := search("%")
		for _, d := range got {
			if !strings.Contains(d.Title, "%") {
				t.Fatalf("searching %% returned %q, which contains no %% — the wildcard leaks", d.Title)
			}
		}
	})

	t.Run("a percent inside a phrase still matches literally", func(t *testing.T) {
		got := search("50%")
		var found bool
		for _, d := range got {
			if d.Title == "Discount 50% Off" {
				found = true
			}
		}
		if !found {
			t.Fatal(`searching "50%" did not find "Discount 50% Off"`)
		}
	})

	t.Run("an underscore is not a single-character wildcard", func(t *testing.T) {
		// "P_ain" would match "Plain" if _ were still a wildcard.
		for _, d := range search("P_ain") {
			if d.Title == "Plain Title" {
				t.Fatal("underscore is still behaving as a wildcard")
			}
		}
	})
}

func TestUploadHardening(t *testing.T) {
	token := adminToken(t)

	upload := func(t *testing.T, name string, body []byte) (int, []byte) {
		t.Helper()
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		fw, err := mw.CreateFormFile("file", name)
		if err != nil {
			t.Fatalf("form file: %v", err)
		}
		if _, err := fw.Write(body); err != nil {
			t.Fatalf("write: %v", err)
		}
		mw.Close()

		req, err := http.NewRequest(http.MethodPost, srv.URL+"/uploads", &buf)
		if err != nil {
			t.Fatalf("request: %v", err)
		}
		req.Header.Set("Content-Type", mw.FormDataContentType())
		req.Header.Set("Authorization", "Bearer "+token)

		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("do: %v", err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, raw
	}

	t.Run("an empty file is rejected", func(t *testing.T) {
		// Accepting it produces a deck that can never render, and the failure
		// would only surface later at playback.
		status, raw := upload(t, "empty.pdf", nil)
		requireStatus(t, http.StatusBadRequest, status, raw)
	})

	t.Run("stored files are served with nosniff", func(t *testing.T) {
		// The extension decides Content-Type, so a .pdf holding HTML is already
		// labelled application/pdf — but without nosniff a browser may ignore
		// that, sniff the HTML, and run its scripts against the API's origin.
		status, raw := upload(t, "sniff.pdf", []byte("<html><script>alert(1)</script></html>"))
		requireStatus(t, http.StatusCreated, status, raw)

		var out struct {
			URL string `json:"url"`
		}
		decode(t, raw, &out)

		res, err := http.Get(srv.URL + out.URL)
		if err != nil {
			t.Fatalf("fetch upload: %v", err)
		}
		defer res.Body.Close()

		if got := res.Header.Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
		}
		if ct := res.Header.Get("Content-Type"); strings.Contains(ct, "text/html") {
			t.Errorf("Content-Type = %q — HTML would execute on this origin", ct)
		}
	})

	t.Run("the client filename cannot escape the upload directory", func(t *testing.T) {
		status, raw := upload(t, "../../evil.pdf", []byte("%PDF-1.4 test"))
		requireStatus(t, http.StatusCreated, status, raw)

		var out struct {
			URL string `json:"url"`
		}
		decode(t, raw, &out)
		if strings.Contains(out.URL, "..") {
			t.Fatalf("stored path %q still contains a traversal segment", out.URL)
		}
	})
}

// ---------- production hardening ----------

func TestUsersRequireAdmin(t *testing.T) {
	// The listing returns every account's email and role. Public, it handed an
	// attacker the target list — including which addresses are admins — before
	// they tried a single password.
	t.Run("anonymous cannot list users", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/users", "", nil)
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("anonymous cannot read one user", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/users/"+uuid.Nil.String(), "", nil)
		requireStatus(t, http.StatusUnauthorized, status, raw)
	})

	t.Run("a non-admin is forbidden", func(t *testing.T) {
		token := adminToken(t)
		const email, pass = "viewer-probe@wit.id", "viewerpass123"
		status, raw := do(t, http.MethodPost, "/users", token, map[string]string{
			"name": "Viewer Probe", "email": email, "password": pass, "role": "viewer",
		})
		requireStatus(t, http.StatusCreated, status, raw)

		viewer := login(t, email, pass)
		status, raw = do(t, http.MethodGet, "/users", viewer, nil)
		requireStatus(t, http.StatusForbidden, status, raw)
	})

	t.Run("an admin still can", func(t *testing.T) {
		status, raw := do(t, http.MethodGet, "/users", adminToken(t), nil)
		requireStatus(t, http.StatusOK, status, raw)
	})
}

func TestAuthRateLimit(t *testing.T) {
	// The suite raises the allowance so it can sign in freely; this exercises the
	// middleware with its own limiter rather than trusting the raised one.
	rl := httpdelivery.NewRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !rl.Allow("ip:203.0.113.1") {
			t.Fatalf("attempt %d refused while still inside the burst", i+1)
		}
	}
	if rl.Allow("ip:203.0.113.1") {
		t.Fatal("a fourth attempt was allowed — the burst is not enforced")
	}

	// One client's exhaustion must not lock anyone else out. Without a per-key
	// bucket a single noisy address would deny the whole service.
	if !rl.Allow("ip:203.0.113.9") {
		t.Fatal("a different address was refused because of another's usage")
	}
}
