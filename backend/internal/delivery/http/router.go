package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// RouterDeps bundles everything the router needs to wire its routes. Handlers
// depend on narrow usecase interfaces, not concrete types or repositories.
type RouterDeps struct {
	Auth      *AuthHandler
	Register  *RegistrationHandler
	Users     *UserHandler
	Decks     *DeckHandler
	Taxonomy  *TaxonomyHandler
	Uploads   *UploadHandler
	Favorites *FavoriteHandler
	Progress  *ProgressHandler
	Docs      *DocsHandler
	Tokens    *TokenManager

	// UploadDir is the directory uploaded files are served from. When empty,
	// the static /uploads/* route is not mounted.
	UploadDir string

	// CORSOrigins are the browser origins allowed to call the API. Empty falls
	// back to the Vite dev origin.
	CORSOrigins []string

	// AuthRateIP/AuthRateAccount are the per-minute auth allowances. Zero uses
	// the defaults.
	AuthRateIP      int
	AuthRateAccount int
}

// downloadName sanitises a requested download filename.
//
// It ends up inside a Content-Disposition header, so anything that could close
// the quoted string or start a new header line has to go — a name carrying a
// newline could otherwise inject a header of the caller's choosing. Path
// separators go too: the value is a filename, and browsers differ on what they
// do with a path in one.
func downloadName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r < 0x20 || r == 0x7f: // control characters, newlines included
			continue
		case r == '"' || r == '\\' || r == '/' || r == ';':
			b.WriteRune('-')
		default:
			b.WriteRune(r)
		}
		if b.Len() > 150 {
			break
		}
	}
	return strings.TrimSpace(b.String())
}

// NewRouter builds the chi router with middleware and all mounted routes.
func NewRouter(d RouterDeps) http.Handler {
	r := chi.NewRouter()

	// Standard middleware stack.
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS for the browser frontend (dev server, preview, or deployed PWA).
	origins := d.CORSOrigins
	if len(origins) == 0 {
		origins = []string{"http://localhost:5173"}
	}
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: origins,
		AllowedMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-Request-Id"},
		// Paging metadata is unreadable from JS unless it is exposed here.
		ExposedHeaders:   []string{"X-Request-Id", "X-Total-Count", "X-Limit", "X-Offset"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Liveness probe.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// API reference. Public: it documents an API whose reads are public anyway,
	// and a reference nobody can open is a reference nobody uses.
	if d.Docs != nil {
		r.Get("/docs", d.Docs.Page)
		r.Get("/openapi.yaml", d.Docs.Spec)
	}

	// Auth (public), rate limited on two axes at once — see ratelimit.go.
	//
	// The numbers are chosen so a person who fatfingers a password never notices
	// while a script does. 10 attempts/minute from one address covers a few typos
	// and a password-manager retry; 5/minute against one account is more than any
	// human needs and far less than a guessing run.
	ipBurst, accountBurst := d.AuthRateIP, d.AuthRateAccount
	if ipBurst <= 0 {
		ipBurst = 10
	}
	if accountBurst <= 0 {
		accountBurst = 5
	}
	ipLimiter := NewRateLimiter(ipBurst, time.Minute)
	accountLimiter := NewRateLimiter(accountBurst, time.Minute)

	// Self-service sign-up is mounted only when a registration handler is
	// supplied, so a deployment can leave it off entirely.
	r.Route("/auth", func(r chi.Router) {
		r.Use(RateLimit(ipLimiter, ByIP))
		r.Use(RateLimit(accountLimiter, ByEmail))

		r.Post("/login", d.Auth.Login)
		if d.Register != nil {
			r.Post("/register", d.Register.Register)
			r.Post("/verify", d.Register.Verify)
			r.Post("/resend-verification", d.Register.Resend)
		}
	})

	// Users: admin only, reads included.
	//
	// The listing used to be public. It returns every account's email and role,
	// which hands an attacker the exact target list — including which addresses
	// are admins — before they try a single password. Nothing outside the admin
	// screen needs it.
	r.Route("/users", func(r chi.Router) {
		r.Use(d.Tokens.JWTAuth)
		r.Use(RequireRole("admin"))
		r.Get("/", d.Users.List)
		r.Get("/{id}", d.Users.Get)
		r.Post("/", d.Users.Create)
		r.Put("/{id}", d.Users.Update)
		r.Delete("/{id}", d.Users.Delete)
	})

	// Decks: reads + view increment are public; create/update/delete require
	// an authenticated admin or editor.
	r.Route("/decks", func(r chi.Router) {
		r.Get("/", d.Decks.List)
		// Must be registered before /{id} so "stats" isn't parsed as a deck id.
		r.Get("/stats", d.Decks.Stats)
		r.Get("/{id}", d.Decks.Get)
		r.Post("/{id}/views", d.Decks.IncrementViews)

		r.Group(func(r chi.Router) {
			r.Use(d.Tokens.JWTAuth)
			r.Use(RequireRole("admin", "editor"))
			r.Post("/", d.Decks.Create)
			r.Put("/{id}", d.Decks.Update)
			r.Delete("/{id}", d.Decks.Delete)
		})
	})

	// Taxonomy: the master lists decks are browsed by — categories, industries
	// and source types. Reads are public because the browse UI needs them
	// before anyone signs in; writes are admin only. An editor adding a deck
	// picks from these lists, but adding to them changes the shape of the
	// catalog and the site's own navigation, which is not a per-deck decision.
	if d.Taxonomy != nil {
		r.Route("/taxonomy/{kind}", func(r chi.Router) {
			r.Get("/", d.Taxonomy.List)
			// Before /{slug}, or "unknown" is parsed as a term to look up.
			r.Get("/unknown", d.Taxonomy.Unknown)
			r.Get("/{slug}", d.Taxonomy.Get)

			r.Group(func(r chi.Router) {
				r.Use(d.Tokens.JWTAuth)
				r.Use(RequireRole("admin"))
				r.Post("/", d.Taxonomy.Create)
				r.Put("/{slug}", d.Taxonomy.Update)
				r.Delete("/{slug}", d.Taxonomy.Delete)
			})
		})
	}

	// Uploads: writing requires an authenticated admin/editor; the stored files
	// themselves are served publicly so decks can reference them.
	if d.Uploads != nil {
		r.Group(func(r chi.Router) {
			r.Use(d.Tokens.JWTAuth)
			r.Use(RequireRole("admin", "editor"))
			r.Post("/uploads", d.Uploads.Upload)
		})
	}
	if d.UploadDir != "" {
		fileServer := http.StripPrefix("/uploads/", http.FileServer(http.Dir(d.UploadDir)))
		r.Get("/uploads/*", func(w http.ResponseWriter, r *http.Request) {
			// Uploads are attacker-supplied bytes served from the API's own
			// origin. Content-Type is derived from the extension, so a file
			// named .pdf holding HTML is already labelled application/pdf —
			// but without nosniff a browser may ignore that label, sniff the
			// HTML and execute its scripts against this origin.
			w.Header().Set("X-Content-Type-Options", "nosniff")

			// ?download=<name> saves the file under a readable name instead of
			// the UUID it is stored as. The stored name stays a UUID on
			// purpose — a client-supplied filename in the path could traverse
			// directories or overwrite an existing upload — so the readable
			// name is carried here, where it names a download and nothing else.
			//
			// The header rather than the frontend's `download` attribute,
			// because that attribute is ignored cross-origin, and in
			// development the app and the API are on different ports.
			if name := downloadName(r.URL.Query().Get("download")); name != "" {
				w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	// Favorites ("My Library") — always scoped to the authenticated user, so
	// every route requires a token but no particular role (viewers can favorite).
	// Viewing progress ("Continue watching") — private per-user history, so every
	// route needs a token but no particular role.
	if d.Progress != nil {
		r.Route("/progress", func(r chi.Router) {
			r.Use(d.Tokens.JWTAuth)
			r.Get("/", d.Progress.List)
			r.Put("/{deckId}", d.Progress.Save)
			r.Delete("/{deckId}", d.Progress.Delete)
		})
	}

	if d.Favorites != nil {
		r.Route("/favorites", func(r chi.Router) {
			r.Use(d.Tokens.JWTAuth)
			r.Get("/", d.Favorites.List)
			r.Put("/{deckId}", d.Favorites.Add)
			r.Delete("/{deckId}", d.Favorites.Remove)
		})
	}

	return r
}
