package http

import (
	"net/http"
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
	Uploads   *UploadHandler
	Favorites *FavoriteHandler
	Tokens    *TokenManager

	// UploadDir is the directory uploaded files are served from. When empty,
	// the static /uploads/* route is not mounted.
	UploadDir string

	// CORSOrigins are the browser origins allowed to call the API. Empty falls
	// back to the Vite dev origin.
	CORSOrigins []string
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
		AllowedOrigins:   origins,
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-Id"},
		// Paging metadata is unreadable from JS unless it is exposed here.
		ExposedHeaders:   []string{"X-Request-Id", "X-Total-Count", "X-Limit", "X-Offset"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Liveness probe.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth (public). Self-service sign-up is mounted only when a registration
	// handler is supplied, so a deployment can leave it off entirely.
	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", d.Auth.Login)
		if d.Register != nil {
			r.Post("/register", d.Register.Register)
			r.Post("/verify", d.Register.Verify)
			r.Post("/resend-verification", d.Register.Resend)
		}
	})

	// Users: reads are public-ish; mutations require admin.
	r.Route("/users", func(r chi.Router) {
		r.Get("/", d.Users.List)
		r.Get("/{id}", d.Users.Get)

		r.Group(func(r chi.Router) {
			r.Use(d.Tokens.JWTAuth)
			r.Use(RequireRole("admin"))
			r.Post("/", d.Users.Create)
			r.Put("/{id}", d.Users.Update)
			r.Delete("/{id}", d.Users.Delete)
		})
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
		r.Get("/uploads/*", fileServer.ServeHTTP)
	}

	// Favorites ("My Library") — always scoped to the authenticated user, so
	// every route requires a token but no particular role (viewers can favorite).
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
