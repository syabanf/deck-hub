package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

type progressUsecase interface {
	List(ctx context.Context, userID uuid.UUID) ([]*domain.ViewingProgress, error)
	Save(ctx context.Context, userID, deckID uuid.UUID, currentSlide, totalSlides int) error
	Delete(ctx context.Context, userID, deckID uuid.UUID) error
}

// ProgressHandler serves per-user resume positions ("Continue watching").
type ProgressHandler struct {
	uc progressUsecase
}

func NewProgressHandler(uc progressUsecase) *ProgressHandler {
	return &ProgressHandler{uc: uc}
}

// List handles GET /progress.
func (h *ProgressHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, err := currentUserID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	rows, err := h.uc.List(r.Context(), userID)
	if err != nil {
		writeError(w, err)
		return
	}
	// Always an array, never null — a client mapping over the result should not
	// have to special-case an empty history.
	if rows == nil {
		rows = []*domain.ViewingProgress{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rows})
}

type saveProgressRequest struct {
	CurrentSlide int `json:"currentSlide"`
	TotalSlides  int `json:"totalSlides"`
}

// Save handles PUT /progress/{deckId}.
func (h *ProgressHandler) Save(w http.ResponseWriter, r *http.Request) {
	userID, err := currentUserID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	deckID, err := parseUUIDParam(r, "deckId")
	if err != nil {
		writeError(w, err)
		return
	}

	var req saveProgressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	if err := h.uc.Save(r.Context(), userID, deckID, req.CurrentSlide, req.TotalSlides); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete handles DELETE /progress/{deckId}.
func (h *ProgressHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, err := currentUserID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	deckID, err := parseUUIDParam(r, "deckId")
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.uc.Delete(r.Context(), userID, deckID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
