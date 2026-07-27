package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

// registrationUsecase is the narrow interface the registration handler needs.
type registrationUsecase interface {
	Register(ctx context.Context, in usecase.RegisterInput) (*domain.User, error)
	Verify(ctx context.Context, token string) (*domain.User, error)
	Resend(ctx context.Context, email string) error
}

// RegistrationHandler serves self-service sign-up and email verification.
type RegistrationHandler struct {
	uc     registrationUsecase
	tokens *TokenManager
}

func NewRegistrationHandler(uc registrationUsecase, tokens *TokenManager) *RegistrationHandler {
	return &RegistrationHandler{uc: uc, tokens: tokens}
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type verifyRequest struct {
	Token string `json:"token"`
}

type resendRequest struct {
	Email string `json:"email"`
}

// Register handles POST /auth/register.
//
// Returns 201 with the pending user and no token: the account cannot sign in
// until the address is verified, so issuing a JWT here would defeat the point.
func (h *RegistrationHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	// Role is not read from the body at any layer. An unauthenticated caller
	// choosing their own role would be a straight privilege escalation.
	user, err := h.uc.Register(r.Context(), usecase.RegisterInput{
		Name:     req.Name,
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"user": toUserResponse(user),
		"message": "Account created. Check your email for a verification link — " +
			"you can sign in once the address is confirmed.",
	})
}

// Verify handles POST /auth/verify.
//
// On success it signs the user straight in. They have just proven control of
// the address and typed a password minutes ago; making them retype it adds
// friction without adding a check.
func (h *RegistrationHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	user, err := h.uc.Verify(r.Context(), req.Token)
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

// Resend handles POST /auth/resend-verification.
//
// Always 204, whether or not the address is registered — see the usecase for
// why this one is deliberately silent while Register is not.
func (h *RegistrationHandler) Resend(w http.ResponseWriter, r *http.Request) {
	var req resendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	if err := h.uc.Resend(r.Context(), req.Email); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
