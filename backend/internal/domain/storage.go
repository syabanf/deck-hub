package domain

import (
	"context"
	"io"
)

// StoredFile describes a file that has been persisted by a FileStorage.
type StoredFile struct {
	// Name is the generated (safe) filename on the backing store.
	Name string
	// Path is the publicly reachable path for the file, e.g. "/uploads/<name>".
	Path string
	// Size is the number of bytes written.
	Size int64
	// ContentType is the MIME type reported by the client.
	ContentType string
}

// FileStorage abstracts where uploaded files live. The local implementation
// writes to a directory on disk; swapping in S3/GCS later only requires a new
// implementation of this interface — nothing above it changes.
type FileStorage interface {
	// Save persists r under a generated name derived from originalName's
	// extension, returning the stored file's metadata.
	Save(ctx context.Context, originalName, contentType string, r io.Reader) (*StoredFile, error)
}
