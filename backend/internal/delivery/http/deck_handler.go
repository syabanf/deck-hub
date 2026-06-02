package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

// deckUsecase is the narrow interface the deck handler depends on.
type deckUsecase interface {
	Create(ctx context.Context, in usecase.CreateDeckInput) (*domain.Deck, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Deck, error)
	List(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, error)
	Update(ctx context.Context, id uuid.UUID, in usecase.UpdateDeckInput) (*domain.Deck, error)
	Delete(ctx context.Context, id uuid.UUID) error
	IncrementViews(ctx context.Context, id uuid.UUID) (*domain.Deck, error)
}

// DeckHandler serves deck CRUD endpoints.
type DeckHandler struct {
	uc deckUsecase
}

// NewDeckHandler wires a DeckHandler.
func NewDeckHandler(uc deckUsecase) *DeckHandler {
	return &DeckHandler{uc: uc}
}

// Create handles POST /decks.
func (h *DeckHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createDeckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	deck, err := h.uc.Create(r.Context(), usecase.CreateDeckInput{
		Title:       req.Title,
		Subtitle:    req.Subtitle,
		Author:      req.Author,
		Year:        req.Year,
		Category:    req.Category,
		Industry:    req.Industry,
		Tags:        req.Tags,
		Source:      domain.DeckSource{Type: req.Source.Type, Value: req.Source.Value},
		Description: req.Description,
		Featured:    req.Featured,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toDeckResponse(deck))
}

// List handles GET /decks with optional
// ?search=&category=&industry=&sourceType=&featured=&limit=&offset=.
func (h *DeckHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := domain.DeckFilter{
		Search:     q.Get("search"),
		Category:   q.Get("category"),
		Industry:   q.Get("industry"),
		SourceType: q.Get("sourceType"),
		Limit:      atoiDefault(q.Get("limit"), 0),
		Offset:     atoiDefault(q.Get("offset"), 0),
	}
	if fv := q.Get("featured"); fv != "" {
		b := fv == "true" || fv == "1"
		filter.Featured = &b
	}

	decks, err := h.uc.List(r.Context(), filter)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeckResponses(decks))
}

// Get handles GET /decks/{id}.
func (h *DeckHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	deck, err := h.uc.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeckResponse(deck))
}

// Update handles PUT /decks/{id}.
func (h *DeckHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	var req updateDeckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	in := usecase.UpdateDeckInput{
		Title:       req.Title,
		Subtitle:    req.Subtitle,
		Author:      req.Author,
		Year:        req.Year,
		Category:    req.Category,
		Industry:    req.Industry,
		Tags:        req.Tags,
		Description: req.Description,
		Featured:    req.Featured,
	}
	if req.Source != nil {
		in.Source = &domain.DeckSource{Type: req.Source.Type, Value: req.Source.Value}
	}

	deck, err := h.uc.Update(r.Context(), id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeckResponse(deck))
}

// Delete handles DELETE /decks/{id}.
func (h *DeckHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

// IncrementViews handles POST /decks/{id}/views.
func (h *DeckHandler) IncrementViews(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	deck, err := h.uc.IncrementViews(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDeckResponse(deck))
}
