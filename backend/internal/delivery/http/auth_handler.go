package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/wit/wit-backend/internal/domain"
)

// authUsecase is the narrow interface the auth handler needs. Declaring it here
// (in the delivery layer) keeps the handler decoupled from the concrete usecase.
type authUsecase interface {
	Authenticate(ctx context.Context, email, password string) (*domain.User, error)
}

// AuthHandler serves authentication endpoints.
type AuthHandler struct {
	uc     authUsecase
	tokens *TokenManager
}

// NewAuthHandler wires an AuthHandler.
func NewAuthHandler(uc authUsecase, tokens *TokenManager) *AuthHandler {
	return &AuthHandler{uc: uc, tokens: tokens}
}

// Login handles POST /auth/login. It verifies the bcrypt password and returns a
// signed JWT plus the user (never the password hash).
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	if req.Email == "" || req.Password == "" {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "email and password are required")
		return
	}

	user, err := h.uc.Authenticate(r.Context(), req.Email, req.Password)
	if err != nil {
		writeError(w, err)
		return
	}

	token, err := h.tokens.Generate(user)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{
		Token: token,
		User:  toUserResponse(user),
	})
}
