package http

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/wit/wit-backend/internal/domain"
)

// allowedUploadExts is the extension allowlist for uploads: deck PDFs, video
// demos, and cover images. Anything else is rejected outright.
var allowedUploadExts = map[string]struct{}{
	".pdf":  {},
	".mp4":  {},
	".webm": {},
	".mov":  {},
	".m4v":  {},
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".gif":  {},
	".webp": {},
}

// UploadHandler serves file uploads backed by a domain.FileStorage.
type UploadHandler struct {
	store    domain.FileStorage
	maxBytes int64
}

// NewUploadHandler wires an UploadHandler with a max request size in bytes.
func NewUploadHandler(store domain.FileStorage, maxBytes int64) *UploadHandler {
	return &UploadHandler{store: store, maxBytes: maxBytes}
}

// uploadResponse is what the client gets back — a public path it can store as
// a deck's source value.
type uploadResponse struct {
	URL         string `json:"url"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

// Upload handles POST /uploads (multipart/form-data, field name "file").
func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	// Cap the whole request body so a huge upload can't exhaust memory/disk.
	r.Body = http.MaxBytesReader(w, r.Body, h.maxBytes)

	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeErrorMsg(w, http.StatusRequestEntityTooLarge, "invalid_input",
			"file is too large or the multipart body is malformed")
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	file, header, err := r.FormFile("file")
	if err != nil {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input",
			`expected a multipart field named "file"`)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if _, ok := allowedUploadExts[ext]; !ok {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input",
			"unsupported file type: "+ext)
		return
	}
	// A zero-byte upload is always a mistake — a truncated transfer or an empty
	// file picked by accident. Accepting it produces a deck that can never
	// render, and the failure would only surface later at playback.
	if header.Size == 0 {
		writeErrorMsg(w, http.StatusBadRequest, "invalid_input", "the uploaded file is empty")
		return
	}
	if header.Size > h.maxBytes {
		writeErrorMsg(w, http.StatusRequestEntityTooLarge, "invalid_input",
			"file exceeds the maximum upload size")
		return
	}

	saved, err := h.store.Save(r.Context(), header.Filename, header.Header.Get("Content-Type"), file)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, uploadResponse{
		URL:         saved.Path,
		Name:        saved.Name,
		Size:        saved.Size,
		ContentType: saved.ContentType,
	})
}
