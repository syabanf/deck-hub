// Package docs embeds the API contract so it ships inside the binary.
//
// Serving it from a path would mean the deployed container needed this
// directory copied alongside the executable, and a missing file would only
// surface as a 404 in production. Embedding makes the reference impossible to
// deploy broken, and guarantees the page always describes the binary serving
// it rather than whatever happened to be on disk.
package docs

import _ "embed"

//go:embed openapi.yaml
var OpenAPISpec []byte
