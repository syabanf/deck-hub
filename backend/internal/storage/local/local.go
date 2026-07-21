// Package local implements domain.FileStorage on the local filesystem.
//
// Files are written to a configured directory under a generated UUID name, so
// a hostile client can't influence the path (no traversal, no collisions), and
// are served back over a public URL prefix.
package local

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/wit/wit-backend/internal/domain"
)

// Storage writes uploads to a directory on local disk.
type Storage struct {
	dir       string
	urlPrefix string
}

// New creates the target directory if needed and returns a Storage.
// urlPrefix is the public path the files are served under, e.g. "/uploads".
func New(dir, urlPrefix string) (*Storage, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("resolve upload dir: %w", err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}
	return &Storage{dir: abs, urlPrefix: strings.TrimSuffix(urlPrefix, "/")}, nil
}

// Dir returns the absolute directory files are written to (used to mount the
// static file server).
func (s *Storage) Dir() string { return s.dir }

// Save streams r to disk under a generated "<uuid><ext>" name.
func (s *Storage) Save(_ context.Context, originalName, contentType string, r io.Reader) (*domain.StoredFile, error) {
	// Only the extension is taken from client input — never the name itself.
	ext := strings.ToLower(filepath.Ext(originalName))
	if len(ext) > 10 {
		ext = ""
	}
	name := uuid.NewString() + ext
	dst := filepath.Join(s.dir, name)

	f, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	n, err := io.Copy(f, r)
	if err != nil {
		// Don't leave a partial file behind.
		os.Remove(dst)
		return nil, fmt.Errorf("write file: %w", err)
	}

	return &domain.StoredFile{
		Name:        name,
		Path:        s.urlPrefix + "/" + name,
		Size:        n,
		ContentType: contentType,
	}, nil
}
