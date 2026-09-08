package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// meUserUsecase and meDeckUsecase are the narrow slices this handler needs.
type meUserUsecase interface {
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	ChangePassword(ctx context.Context, id uuid.UUID, current, next string) error
}

type meDeckUsecase interface {
	CountByCreator(ctx context.Context, userID uuid.UUID) (int, error)
}

// MeHandler serves the signed-in account's own profile.
//
// Separate from /users, which is admin-only and returns everybody. A viewer
// has every right to read and change their own record, and no business reading
// anyone else's — routing that through the admin endpoints would mean either
// opening them up or leaving ordinary accounts unable to change a password.
type MeHandler struct {
	users meUserUsecase
	decks meDeckUsecase
}

// NewMeHandler wires a MeHandler.
func NewMeHandler(users meUserUsecase, decks meDeckUsecase) *MeHandler {
	return &MeHandler{users: users, decks: decks}
}

func meID(r *http.Request) (uuid.UUID, error) {
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

// Get handles GET /me — the account, plus the numbers a profile page shows.
func (h *MeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := meID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	user, err := h.users.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}

	// A failure to count is not a failure to read the profile. The count is
	// reported as zero and the page still loads.
	count, _ := h.decks.CountByCreator(r.Context(), id)

	writeJSON(w, http.StatusOK, meResponse{
		userResponse: toUserResponse(user),
		DeckCount:    count,
	})
}

// ChangePassword handles PUT /me/password.
func (h *MeHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id, err := meID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	if err := h.users.ChangePassword(r.Context(), id, req.CurrentPassword, req.NewPassword); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
