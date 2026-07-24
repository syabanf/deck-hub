package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

// deckUsecase is the narrow interface the deck handler depends on.
type deckUsecase interface {
	Create(ctx context.Context, in usecase.CreateDeckInput) (*domain.Deck, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Deck, error)
	List(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, error)
	ListPage(ctx context.Context, f domain.DeckFilter) ([]*domain.Deck, int, error)
	Stats(ctx context.Context) (*domain.DeckStats, error)
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
		Sort:       domain.ParseDeckSort(q.Get("sort")),
		Limit:      atoiDefault(q.Get("limit"), 0),
		Offset:     atoiDefault(q.Get("offset"), 0),
	}
	if fv := q.Get("featured"); fv != "" {
		b := fv == "true" || fv == "1"
		filter.Featured = &b
	}
	// Has, not Get != "": a client building `?ids=${ids.join(",")}` from an empty
	// array sends `ids=` with no value. Treating that as "filter absent" would
	// answer "give me these zero decks" with the whole first page.
	if q.Has("ids") {
		ids, err := parseUUIDList(q.Get("ids"))
		if err != nil {
			writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "ids must be a comma-separated list of deck ids")
			return
		}
		// An explicit empty result beats silently listing the whole catalog.
		if len(ids) == 0 {
			w.Header().Set("X-Total-Count", "0")
			w.Header().Set("X-Limit", strconv.Itoa(clampedLimit(filter.Limit)))
			w.Header().Set("X-Offset", strconv.Itoa(filter.Offset))
			writeJSON(w, http.StatusOK, []deckResponse{})
			return
		}
		filter.IDs = ids
	}

	decks, total, err := h.uc.ListPage(r.Context(), filter)
	if err != nil {
		writeError(w, err)
		return
	}

	// The body stays a plain array so existing clients keep working; paging
	// metadata rides in headers. X-Total-Count must be in the CORS
	// ExposedHeaders list or the browser hides it from JS.
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	w.Header().Set("X-Limit", strconv.Itoa(clampedLimit(filter.Limit)))
	w.Header().Set("X-Offset", strconv.Itoa(filter.Offset))
	writeJSON(w, http.StatusOK, toDeckResponses(decks))
}

// clampedLimit mirrors the usecase bounds so the header reports the page size
// actually applied, not the one the caller asked for.
func clampedLimit(n int) int {
	if n <= 0 {
		return usecase.DefaultDeckLimit
	}
	if n > usecase.MaxDeckLimit {
		return usecase.MaxDeckLimit
	}
	return n
}

// parseUUIDList turns "a,b,c" into ids, ignoring empty entries so a trailing
// comma isn't an error. It caps the set at MaxDeckLimit: `ids` is a hydration
// helper, not a way around paging.
func parseUUIDList(raw string) ([]uuid.UUID, error) {
	parts := strings.Split(raw, ",")
	out := make([]uuid.UUID, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		id, err := uuid.Parse(p)
		if err != nil {
			return nil, err
		}
		out = append(out, id)
		if len(out) >= usecase.MaxDeckLimit {
			break
		}
	}
	return out, nil
}

// Stats handles GET /decks/stats.
func (h *DeckHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.uc.Stats(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"total":      stats.Total,
		"featured":   stats.Featured,
		"totalViews": stats.TotalViews,
		"byCategory": stats.ByCategory,
		"byIndustry": stats.ByIndustry,
	})
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
