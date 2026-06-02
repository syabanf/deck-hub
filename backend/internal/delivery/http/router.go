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
	Auth   *AuthHandler
	Users  *UserHandler
	Decks  *DeckHandler
	Tokens *TokenManager
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

	// CORS for the Vite dev frontend.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-Id"},
		ExposedHeaders:   []string{"X-Request-Id"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Liveness probe.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth (public).
	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", d.Auth.Login)
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

	return r
}
