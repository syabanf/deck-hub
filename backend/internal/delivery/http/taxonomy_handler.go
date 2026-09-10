package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/wit/wit-backend/internal/domain"
	"github.com/wit/wit-backend/internal/usecase"
)

// taxonomyUsecase is the narrow interface the taxonomy handler depends on.
type taxonomyUsecase interface {
	List(ctx context.Context, kind domain.TaxonomyKind, activeOnly bool) ([]*domain.TaxonomyTerm, error)
	Get(ctx context.Context, kind domain.TaxonomyKind, slug string) (*domain.TaxonomyTerm, error)
	Unknown(ctx context.Context, kind domain.TaxonomyKind) ([]domain.UnknownTaxonomyValue, error)
	Create(ctx context.Context, kind domain.TaxonomyKind, slug string, in usecase.TermInput) (*domain.TaxonomyTerm, error)
	Update(ctx context.Context, kind domain.TaxonomyKind, slug string, in usecase.TermInput) (*domain.TaxonomyTerm, error)
	Delete(ctx context.Context, kind domain.TaxonomyKind, slug string) error
}

// TaxonomyHandler serves the master lists: categories, industries and source
// types. One handler for all three — they differ in their contents, not in
// anything a request does to them.
type TaxonomyHandler struct {
	uc taxonomyUsecase
}

// NewTaxonomyHandler wires a TaxonomyHandler.
func NewTaxonomyHandler(uc taxonomyUsecase) *TaxonomyHandler {
	return &TaxonomyHandler{uc: uc}
}

// kindParam resolves {kind} from the path. An unknown kind is a 404: the URL
// names a collection that does not exist, which is different from asking a
// real collection a bad question.
func kindParam(r *http.Request) (domain.TaxonomyKind, error) {
	return domain.ParseTaxonomyKind(chi.URLParam(r, "kind"))
}

// List handles GET /taxonomy/{kind}?active=true.
//
// Retired terms are included by default. The browse UI passes active=true;
// the admin screen must see everything, or retiring a term would hide the only
// control that could bring it back.
func (h *TaxonomyHandler) List(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	terms, err := h.uc.List(r.Context(), kind, r.URL.Query().Get("active") == "true")
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTermResponses(terms))
}

// Unknown handles GET /taxonomy/{kind}/unknown — values decks use that no term
// defines. Registered before /{slug} so "unknown" is not read as a slug.
func (h *TaxonomyHandler) Unknown(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	values, err := h.uc.Unknown(r.Context(), kind)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, values)
}

// Get handles GET /taxonomy/{kind}/{slug}.
func (h *TaxonomyHandler) Get(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	term, err := h.uc.Get(r.Context(), kind, chi.URLParam(r, "slug"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTermResponse(term))
}

// Create handles POST /taxonomy/{kind}.
func (h *TaxonomyHandler) Create(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var req createTermRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	term, err := h.uc.Create(r.Context(), kind, req.Slug, usecase.TermInput{
		Title:       req.Title,
		Description: req.Description,
		SortOrder:   req.SortOrder,
		Active:      req.Active,
		Accent:      req.Accent,
		Secondary:   req.Secondary,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTermResponse(term))
}

// Update handles PUT /taxonomy/{kind}/{slug}.
func (h *TaxonomyHandler) Update(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var req updateTermRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "malformed JSON body")
		return
	}

	term, err := h.uc.Update(r.Context(), kind, chi.URLParam(r, "slug"), usecase.TermInput{
		Title:       req.Title,
		Description: req.Description,
		SortOrder:   req.SortOrder,
		Active:      req.Active,
		Accent:      req.Accent,
		Secondary:   req.Secondary,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toTermResponse(term))
}

// Delete handles DELETE /taxonomy/{kind}/{slug}. Refused with 409 while decks
// still refer to the term.
func (h *TaxonomyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	kind, err := kindParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.uc.Delete(r.Context(), kind, chi.URLParam(r, "slug")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
