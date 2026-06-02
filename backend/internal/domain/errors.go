package domain

import "errors"

// Sentinel errors for the domain. Outer layers (repositories, usecases,
// delivery) wrap these with %w so callers can match with errors.Is and map
// them to transport-specific responses (e.g. HTTP status codes).
var (
	// ErrNotFound indicates a requested entity does not exist.
	ErrNotFound = errors.New("resource not found")
	// ErrConflict indicates a uniqueness or state conflict (e.g. duplicate email).
	ErrConflict = errors.New("resource conflict")
	// ErrInvalidInput indicates the caller supplied invalid data.
	ErrInvalidInput = errors.New("invalid input")
	// ErrUnauthorized indicates failed or missing authentication (HTTP 401).
	ErrUnauthorized = errors.New("unauthorized")
	// ErrForbidden indicates the caller is authenticated but lacks permission
	// for the requested action (HTTP 403).
	ErrForbidden = errors.New("forbidden")
)
