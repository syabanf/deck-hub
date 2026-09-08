package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

type demoUsecase interface {
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

// List handles GET /demos?search=&active=true.
func (h *DemoHandler) List(w http.ResponseWriter, r *http.Request) {
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
	var req createDemoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	demo, err := h.uc.Create(r.Context(), usecase.DemoInput{
		Name:      req.Name,
		Product:   req.Product,
		URL:       req.URL,
		Username:  req.Username,
		Password:  req.Password,
		Notes:     req.Notes,
		SortOrder: req.SortOrder,
		Active:    req.Active,
		CreatedBy: creatorFromContext(r.Context()),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDemoResponse(demo))
}

// Update handles PUT /demos/{id}.
func (h *DemoHandler) Update(w http.ResponseWriter, r *http.Request) {
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
		Name:      req.Name,
		Product:   req.Product,
		URL:       req.URL,
		Username:  req.Username,
		Password:  req.Password,
		Notes:     req.Notes,
		SortOrder: req.SortOrder,
		Active:    req.Active,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDemoResponse(demo))
}

// Delete handles DELETE /demos/{id}.
func (h *DemoHandler) Delete(w http.ResponseWriter, r *http.Request) {
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
