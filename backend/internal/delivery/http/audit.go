package http

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// Audit records every write, from the router rather than from each handler.
//
// A handler that forgets its own audit line leaves a gap nobody notices until
// they go looking — and the gap is exactly where an unusual change would be.
// Doing it here means a route added later is covered by having been added.
//
// Reads are never recorded: they would bury the writes, and the interesting
// question is what changed.
// auditActor is how the actor gets back out to this middleware.
//
// Audit runs before JWTAuth — it has to, or it would only cover authenticated
// routes — and JWTAuth passes its claims on by building a *new* request
// context for the handler. The outer middleware never sees that context, so
// reading the user id from its own is reading it from before anyone was
// identified, and every entry came out anonymous.
//
// A pointer installed on the way in, filled on the way through.
type auditActor struct {
	id    string
	role  string
	email string
}

type auditActorKey struct{}

// noteActor records the identified account for the audit middleware, if one is
// listening. Called by JWTAuth.
func noteActor(ctx context.Context, id, role string) {
	if a, ok := ctx.Value(auditActorKey{}).(*auditActor); ok {
		a.id, a.role = id, role
	}
}

func Audit(repo domain.AuditRepository, lookup func(context.Context, uuid.UUID) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isWrite(r.Method) || repo == nil {
				next.ServeHTTP(w, r)
				return
			}

			actor := &auditActor{}
			r = r.WithContext(context.WithValue(r.Context(), auditActorKey{}, actor))

			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			// Only what actually happened. A refused request is not a change,
			// and recording every failed attempt turns the log into a place
			// where real changes are hard to find.
			if rec.status < 200 || rec.status >= 300 {
				return
			}

			entry := &domain.AuditEntry{
				Action: actionFor(r.Method),
				Route:  r.Method + " " + routePattern(r),
				Status: rec.status,
				IP:     clientIP(r),
			}
			entry.Entity, entry.EntityID = entityFor(r)

			if id, err := uuid.Parse(actor.id); err == nil {
				entry.ActorID = &id
				if lookup != nil {
					entry.ActorEmail = lookup(r.Context(), id)
				}
			}
			entry.ActorRole = actor.role

			// Recorded on the request's own context, which is still alive
			// here. A failure to record must never fail the request: the
			// change already happened, and refusing to admit it would be
			// worse than not writing it down.
			if err := repo.Record(r.Context(), entry); err != nil {
				log.Printf("audit: %v", err)
			}
		})
	}
}

func isWrite(m string) bool {
	switch m {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

func actionFor(m string) string {
	switch m {
	case http.MethodPost:
		return "create"
	case http.MethodDelete:
		return "delete"
	default:
		return "update"
	}
}

// entityFor names what was touched, from the first path segment, and picks out
// whichever URL parameter identifies it. Derived from the route rather than
// from a per-handler label so that nothing has to be kept in step by hand.
func entityFor(r *http.Request) (string, string) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	entity := ""
	if len(parts) > 0 {
		entity = parts[0]
	}
	switch entity {
	case "decks":
		entity = "deck"
	case "users":
		entity = "user"
	case "uploads":
		entity = "upload"
	case "me":
		entity = "profile"
	}

	id := ""
	if rc := chi.RouteContext(r.Context()); rc != nil {
		for _, key := range []string{"id", "slug", "deckId", "kind"} {
			if v := rc.URLParam(key); v != "" {
				id = v
				break
			}
		}
	}
	return entity, id
}

func routePattern(r *http.Request) string {
	if rc := chi.RouteContext(r.Context()); rc != nil {
		if p := rc.RoutePattern(); p != "" {
			return p
		}
	}
	return r.URL.Path
}

// statusRecorder remembers the status so the middleware can tell a change from
// a refusal after the handler has run.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.written {
		s.status = code
		s.written = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	s.written = true
	return s.ResponseWriter.Write(b)
}
