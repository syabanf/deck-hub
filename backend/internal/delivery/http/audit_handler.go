package http

import (
	"context"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

type auditUsecase interface {
	List(ctx context.Context, f domain.AuditFilter) ([]*domain.AuditEntry, int, error)
}

// AuditHandler serves the activity log.
type AuditHandler struct {
	uc auditUsecase
}

// NewAuditHandler wires an AuditHandler.
func NewAuditHandler(uc auditUsecase) *AuditHandler {
	return &AuditHandler{uc: uc}
}

// List handles GET /audit?entity=&action=&actorId=&limit=&offset=.
//
// Paged the same way /decks is, with the total in a header, because the log is
// the one table that only ever grows.
func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := domain.AuditFilter{
		Entity: q.Get("entity"),
		Action: q.Get("action"),
		Limit:  atoiDefault(q.Get("limit"), 0),
		Offset: atoiDefault(q.Get("offset"), 0),
	}
	if raw := q.Get("actorId"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "actorId must be a uuid")
			return
		}
		f.ActorID = &id
	}

	entries, total, err := h.uc.List(r.Context(), f)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	writeJSON(w, http.StatusOK, entries)
}
