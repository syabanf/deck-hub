package http

import (
	"net/http"

	"github.com/wit/wit-backend/docs"
)

// DocsHandler serves the API reference: a browsable page at /docs, and the raw
// contract at /openapi.yaml for client generators and Postman/Insomnia imports.
type DocsHandler struct{}

func NewDocsHandler() *DocsHandler { return &DocsHandler{} }

// Spec handles GET /openapi.yaml.
func (h *DocsHandler) Spec(w http.ResponseWriter, r *http.Request) {
	// application/yaml is the registered type (RFC 9512). The charset is
	// explicit because the spec contains em-dashes and other non-ASCII.
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(docs.OpenAPISpec)
}

// Page handles GET /docs.
func (h *DocsHandler) Page(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write([]byte(docsPage))
}

// The spec is rendered client-side by Redoc.
//
// The script is pinned with Subresource Integrity, so a swapped or tampered CDN
// file fails to execute rather than running unverified code against this
// origin. Bumping the version means recomputing the hash:
//
//	curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
//
// If the script cannot load at all — offline, or the CDN blocked — the fallback
// below stays on screen and points at the two self-contained alternatives.
const docsPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WIT API reference</title>
  <link rel="icon" href="data:,">
  <style>
    /* Redoc ships a light theme only. Advertising "light dark" let the browser
       paint a dark canvas underneath it, leaving grey text on near-black and
       barely readable. Committing to light keeps the two in agreement. */
    :root { color-scheme: light; }
    body { margin: 0; background: #fff; color: #1a1a1a;
           font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    #fallback { max-width: 44rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; }
    #fallback h1 { font-size: 1.5rem; margin-bottom: .25rem; }
    #fallback code { background: rgba(127,127,127,.18); padding: .15em .4em; border-radius: 4px; font-size: .9em; }
    #fallback .muted { opacity: .7; }
  </style>
</head>
<body>
  <!-- Replaced by Redoc on load; left in place if Redoc never arrives. -->
  <div id="fallback">
    <h1>WIT API reference</h1>
    <p class="muted">Loading the interactive reference…</p>
    <p>
      If this message stays, the renderer could not be fetched — you are offline,
      or the CDN is blocked. The documentation itself is local either way:
    </p>
    <ul>
      <li><a href="/openapi.yaml">/openapi.yaml</a> — the full contract, importable into Postman or Insomnia</li>
      <li><code>backend/docs/API.md</code> — the same reference in Markdown, with runnable curl</li>
    </ul>
  </div>

  <redoc spec-url="/openapi.yaml" hide-download-button></redoc>
  <script
    src="https://cdn.redoc.ly/redoc/v2.1.3/bundles/redoc.standalone.js"
    integrity="sha384-R8e5ippgVo+kphHRsZE026R4rLIN/ORakEnRnOJ3S7BauiXHeD2EnvDpCcPYV4O/"
    crossorigin="anonymous"
    onload="document.getElementById('fallback')?.remove()"></script>
</body>
</html>`
