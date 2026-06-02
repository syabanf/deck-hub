package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

// userUsecase is the narrow interface the user handler depends on.
type userUsecase interface {
	Create(ctx context.Context, in usecase.CreateUserInput) (*domain.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	List(ctx context.Context, f domain.UserFilter) ([]*domain.User, error)
	Update(ctx context.Context, id uuid.UUID, in usecase.UpdateUserInput) (*domain.User, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// UserHandler serves user CRUD endpoints.
type UserHandler struct {
	uc userUsecase
}

// NewUserHandler wires a UserHandler.
func NewUserHandler(uc userUsecase) *UserHandler {
	return &UserHandler{uc: uc}
}

// Create handles POST /users.
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	user, err := h.uc.Create(r.Context(), usecase.CreateUserInput{
		Name:     req.Name,
		Email:    req.Email,
		Password: req.Password,
		Role:     domain.Role(req.Role),
		Status:   domain.Status(req.Status),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toUserResponse(user))
}

// List handles GET /users with optional ?search=&role=&status=&limit=&offset=.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := domain.UserFilter{
		Search: q.Get("search"),
		Role:   domain.Role(q.Get("role")),
		Status: domain.Status(q.Get("status")),
		Limit:  atoiDefault(q.Get("limit"), 0),
		Offset: atoiDefault(q.Get("offset"), 0),
	}

	users, err := h.uc.List(r.Context(), filter)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserResponses(users))
}

// Get handles GET /users/{id}.
func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	user, err := h.uc.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserResponse(user))
}

// Update handles PUT /users/{id}.
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, err)
		return
	}
	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	in := usecase.UpdateUserInput{
		Name:     req.Name,
		Email:    req.Email,
		Password: req.Password,
	}
	if req.Role != nil {
		role := domain.Role(*req.Role)
		in.Role = &role
	}
	if req.Status != nil {
		status := domain.Status(*req.Status)
		in.Status = &status
	}

	user, err := h.uc.Update(r.Context(), id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserResponse(user))
}

// Delete handles DELETE /users/{id}.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

// ----- shared param helpers -----

func parseUUIDParam(r *http.Request, name string) (uuid.UUID, error) {
	raw := chi.URLParam(r, name)
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, domain.ErrInvalidInput
	}
	return id, nil
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
