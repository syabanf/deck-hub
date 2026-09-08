package http

import (
	"context"
	"encoding/json"
	"net/http"
)

type settingsUsecase interface {
	All(ctx context.Context) (map[string]string, error)
	Update(ctx context.Context, in map[string]string) (map[string]string, error)
}

// SettingsHandler serves the settings map.
type SettingsHandler struct {
	uc settingsUsecase
}

// NewSettingsHandler wires a SettingsHandler.
func NewSettingsHandler(uc settingsUsecase) *SettingsHandler {
	return &SettingsHandler{uc: uc}
}

// Get handles GET /settings. Public: the navigation reads it before anyone has
// signed in, and none of these values are secret.
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	settings, err := h.uc.All(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// Update handles PUT /settings. Admin only, and partial: keys left out keep
// their current value.
func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}
	settings, err := h.uc.Update(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}
