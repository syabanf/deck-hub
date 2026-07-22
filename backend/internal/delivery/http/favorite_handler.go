package http

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// favoriteUsecase is the narrow interface the favorite handler depends on.
type favoriteUsecase interface {
	ListDeckIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
	Add(ctx context.Context, userID, deckID uuid.UUID) error
	Remove(ctx context.Context, userID, deckID uuid.UUID) error
}

// FavoriteHandler serves the current user's favorites. Every route runs behind
// JWTAuth, so the user id always comes from the token — never from the client.
type FavoriteHandler struct {
	uc favoriteUsecase
}

// NewFavoriteHandler wires a FavoriteHandler.
func NewFavoriteHandler(uc favoriteUsecase) *FavoriteHandler {
	return &FavoriteHandler{uc: uc}
}

// currentUserID pulls the authenticated user's id out of the request context.
func currentUserID(r *http.Request) (uuid.UUID, error) {
	raw, ok := UserIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, domain.ErrUnauthorized
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, domain.ErrUnauthorized
	}
	return id, nil
}

type favoritesResponse struct {
	DeckIDs []string `json:"deckIds"`
}

// List handles GET /favorites → the current user's favorited deck ids.
func (h *FavoriteHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, err := currentUserID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	ids, err := h.uc.ListDeckIDs(r.Context(), userID)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	writeJSON(w, http.StatusOK, favoritesResponse{DeckIDs: out})
}

// Add handles PUT /favorites/{deckId} (idempotent).
func (h *FavoriteHandler) Add(w http.ResponseWriter, r *http.Request) {
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
	if err := h.uc.Add(r.Context(), userID, deckID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Remove handles DELETE /favorites/{deckId} (idempotent).
func (h *FavoriteHandler) Remove(w http.ResponseWriter, r *http.Request) {
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
	if err := h.uc.Remove(r.Context(), userID, deckID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
