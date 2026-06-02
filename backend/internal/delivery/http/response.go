package http

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/wit/wit-backend/internal/domain"
)

// errorBody is the consistent error envelope returned to clients.
type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// writeJSON serialises v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Headers already sent; nothing actionable beyond logging upstream.
		return
	}
}

// writeError maps an error to an HTTP status and writes the standard envelope.
func writeError(w http.ResponseWriter, err error) {
	status, code := statusForError(err)
	writeJSON(w, status, errorBody{Error: errorDetail{Code: code, Message: err.Error()}})
}

// writeErrorMsg writes an explicit status/code/message envelope (for transport
// concerns like malformed JSON that don't map to a domain error).
func writeErrorMsg(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, errorBody{Error: errorDetail{Code: code, Message: msg}})
}

// statusForError maps domain sentinel errors to HTTP status codes + a stable
// machine-readable code string.
func statusForError(err error) (int, string) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "not_found"
	case errors.Is(err, domain.ErrConflict):
		return http.StatusConflict, "conflict"
	case errors.Is(err, domain.ErrInvalidInput):
		return http.StatusBadRequest, "invalid_input"
	case errors.Is(err, domain.ErrUnauthorized):
		return http.StatusUnauthorized, "unauthorized"
	case errors.Is(err, domain.ErrForbidden):
		return http.StatusForbidden, "forbidden"
	default:
		return http.StatusInternalServerError, "internal_error"
	}
}
