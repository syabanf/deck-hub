package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

type apiKeyUsecase interface {
	Generate(ctx context.Context, name string, createdBy *uuid.UUID) (*domain.APIKey, string, error)
	List(ctx context.Context) ([]*domain.APIKey, error)
	Revoke(ctx context.Context, id uuid.UUID) error
}

type roleUsecase interface {
	List(ctx context.Context) ([]usecase.Role, error)
}

// APIKeyHandler serves the admin screen that issues keys, and the one endpoint
// those keys open.
type APIKeyHandler struct {
	keys  apiKeyUsecase
	roles roleUsecase
}

// NewAPIKeyHandler wires an APIKeyHandler.
func NewAPIKeyHandler(keys apiKeyUsecase, roles roleUsecase) *APIKeyHandler {
	return &APIKeyHandler{keys: keys, roles: roles}
}

// Roles handles GET /roles — the external endpoint.
//
// Behind an API key, and returning no personal data at all: the three roles,
// what each may do, and how many accounts hold them. See RoleUsecase for why
// it is shaped that way.
func (h *APIKeyHandler) Roles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.roles.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"roles": roles})
}

// List handles GET /api-keys. Admin only.
func (h *APIKeyHandler) List(w http.ResponseWriter, r *http.Request) {
	keys, err := h.keys.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

// Create handles POST /api-keys. Admin only.
//
// The response carries the plaintext key, and it is the only time it ever
// will: nothing stores it, and no later read can produce it.
func (h *APIKeyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	key, plaintext, err := h.keys.Generate(r.Context(), req.Name, creatorFromContext(r.Context()))
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"key": key,
		// Named so nobody has to guess whether it can be fetched again.
		"plaintextShownOnce": plaintext,
	})
}

// Revoke handles DELETE /api-keys/{id}. Admin only.
//
// The row survives; only the key stops working. Deleting the record would
// erase who issued it and when, at the moment somebody most wants to know.
func (h *APIKeyHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.keys.Revoke(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
