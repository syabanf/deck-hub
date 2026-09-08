package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

type demoUsecase interface {
	CheckPin(ctx context.Context, pin string) error
	SetPin(ctx context.Context, pin string) error
	List(ctx context.Context, f domain.DemoFilter) ([]*domain.Demo, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Demo, error)
	Create(ctx context.Context, in usecase.DemoInput) (*domain.Demo, error)
	Update(ctx context.Context, id uuid.UUID, in usecase.UpdateDemoInput) (*domain.Demo, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// DemoHandler serves the Demo Center.
type DemoHandler struct {
	uc demoUsecase
}

// NewDemoHandler wires a DemoHandler.
func NewDemoHandler(uc demoUsecase) *DemoHandler {
	return &DemoHandler{uc: uc}
}

// PinHeader carries the shared PIN. A header rather than a query parameter:
// it would otherwise end up in access logs and browser history, which is where
// the gate to a page of credentials should not be written down.
const PinHeader = "X-Demo-Pin"

// requirePin is the gate in front of everything here. Checked on every call
// rather than exchanged for a session: there is no state to keep, and a gate
// with no expiry is a gate that outlives the reason it was opened.
func (h *DemoHandler) requirePin(w http.ResponseWriter, r *http.Request) bool {
	if err := h.uc.CheckPin(r.Context(), r.Header.Get(PinHeader)); err != nil {
		if errors.Is(err, usecase.ErrDemoPin) {
			// Its own code, so the frontend shows the PIN screen instead of
			// treating it as an expired sign-in and logging the person out.
			writeErrorMsg(w, http.StatusUnauthorized, "demo_pin_required", err.Error())
			return false
		}
		writeError(w, err)
		return false
	}
	return true
}

// SetPin handles PUT /demos/pin. Admin only, and write-only: the PIN is stored
// hashed, so it can be replaced and never read back.
func (h *DemoHandler) SetPin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	if err := h.uc.SetPin(r.Context(), req.Pin); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// List handles GET /demos?search=&active=true.
func (h *DemoHandler) List(w http.ResponseWriter, r *http.Request) {
	if !h.requirePin(w, r) {
		return
	}
	q := r.URL.Query()
	demos, err := h.uc.List(r.Context(), domain.DemoFilter{
		Search:     q.Get("search"),
		ActiveOnly: q.Get("active") == "true",
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDemoResponses(demos))
}

// Get handles GET /demos/{id}.
func (h *DemoHandler) Get(w http.ResponseWriter, r *http.Request) {
	if !h.requirePin(w, r) {
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	demo, err := h.uc.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDemoResponse(demo))
}

// Create handles POST /demos.
func (h *DemoHandler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.requirePin(w, r) {
		return
	}
	var req createDemoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	demo, err := h.uc.Create(r.Context(), usecase.DemoInput{
		Name:        req.Name,
		Category:    req.Category,
		Environment: req.Environment,
		Status:      req.Status,
		URL:         req.URL,
		Username:    req.Username,
		Password:    req.Password,
		Notes:       req.Notes,
		SortOrder:   req.SortOrder,
		Active:      req.Active,
		CreatedBy:   creatorFromContext(r.Context()),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDemoResponse(demo))
}

// Update handles PUT /demos/{id}.
func (h *DemoHandler) Update(w http.ResponseWriter, r *http.Request) {
	if !h.requirePin(w, r) {
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	var req updateDemoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	demo, err := h.uc.Update(r.Context(), id, usecase.UpdateDemoInput{
		Name:        req.Name,
		Category:    req.Category,
		Environment: req.Environment,
		Status:      req.Status,
		URL:         req.URL,
		Username:    req.Username,
		Password:    req.Password,
		Notes:       req.Notes,
		SortOrder:   req.SortOrder,
		Active:      req.Active,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDemoResponse(demo))
}

// Delete handles DELETE /demos/{id}.
func (h *DemoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if !h.requirePin(w, r) {
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.uc.Delete(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
