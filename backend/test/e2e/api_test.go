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
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
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
	// (000001 also seeds the admin user the tests authenticate with). Favorites
	// is dropped first — its FK to decks would otherwise block the reset — and
	// re-created after, without the catalog/demo seeds from 000002/000003.
	for _, f := range []string{
		"000004_favorites.down.sql",
		"000001_init.down.sql",
		"000001_init.up.sql",
		"000004_favorites.up.sql",
		"000005_deck_indexes.up.sql",
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
	tokens := httpdelivery.NewTokenManager(jwtTestSecret, time.Hour)

	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:      httpdelivery.NewAuthHandler(userUC, tokens),
		Users:     httpdelivery.NewUserHandler(userUC),
		Decks:     httpdelivery.NewDeckHandler(deckUC),
		Uploads:   httpdelivery.NewUploadHandler(store, 25<<20),
		Favorites: httpdelivery.NewFavoriteHandler(favoriteUC),
		Tokens:    tokens,
		UploadDir: store.Dir(),
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

func adminToken(t *testing.T) string { return login(t, adminEmail, adminPassword) }

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
