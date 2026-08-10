package http

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Rate limiting for the authentication routes.
//
// Login is deliberately expensive — bcrypt costs ~60ms of CPU per attempt, and
// the load tests measure it at ~159 req/s against everything else's tens of
// thousands. That makes /auth two things at once: the obvious place to guess
// passwords, and the cheapest way to exhaust the server's CPU.
//
// Two independent buckets, because they stop different attacks:
//
//   - per IP: one client working through a list of accounts
//   - per account: a botnet working through passwords for one account
//
// Either alone leaves a hole. Per-IP misses distributed attempts against a
// single admin; per-account misses one host spraying one password across every
// address it found. A request must have budget in both.
//
// Deliberately in-process. A shared store (Redis) is the right answer for
// several replicas, but adding a dependency to ship a limiter would be the
// wrong trade — a per-instance limit still divides an attacker's throughput by
// the number of replicas, which is far better than none.

// visitor is one bucket: a token allowance that refills over time.
type visitor struct {
	tokens   float64
	lastSeen time.Time
}

// RateLimiter is a token-bucket limiter keyed by an arbitrary string.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor

	burst  float64       // tokens available at rest
	refill float64       // tokens restored per second
	ttl    time.Duration // idle time before a bucket is forgotten
}

// NewRateLimiter allows `burst` requests immediately, then one more every
// `per / burst`. A bucket idle for longer than 10× the window is dropped, so
// memory tracks active clients rather than everyone who ever called.
func NewRateLimiter(burst int, per time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		burst:    float64(burst),
		refill:   float64(burst) / per.Seconds(),
		ttl:      per * 10,
	}
	go rl.reap()
	return rl
}

// Allow reports whether the key has budget, spending a token if so.
func (rl *RateLimiter) Allow(key string) bool {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, ok := rl.visitors[key]
	if !ok {
		rl.visitors[key] = &visitor{tokens: rl.burst - 1, lastSeen: now}
		return true
	}

	// Refill for the time elapsed, capped at the burst size — an idle client
	// gets a full allowance back, never more.
	v.tokens += now.Sub(v.lastSeen).Seconds() * rl.refill
	if v.tokens > rl.burst {
		v.tokens = rl.burst
	}
	v.lastSeen = now

	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

// reap drops idle buckets so the map cannot grow without bound. Without it,
// every distinct IP that ever hit /auth would be retained for the process's
// lifetime — a slow memory leak an attacker controls the size of.
func (rl *RateLimiter) reap() {
	for range time.Tick(time.Minute) {
		cutoff := time.Now().Add(-rl.ttl)
		rl.mu.Lock()
		for k, v := range rl.visitors {
			if v.lastSeen.Before(cutoff) {
				delete(rl.visitors, k)
			}
		}
		rl.mu.Unlock()
	}
}

// clientIP resolves the caller's address.
//
// chi's RealIP middleware has already applied X-Forwarded-For when one was
// present, so RemoteAddr is the right source here. Reading the header again
// would let any client forge a fresh identity per request and skip the limit
// entirely.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RateLimit rejects requests once a client exhausts its allowance.
//
// `keyFor` derives the bucket. Returning "" skips the check, which is how the
// per-account limiter ignores requests carrying no readable email.
func RateLimit(rl *RateLimiter, keyFor func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFor(r)
			if key == "" || rl.Allow(key) {
				next.ServeHTTP(w, r)
				return
			}
			// Retry-After is advisory but honest: it tells a well-behaved client
			// when to come back instead of leaving it to guess.
			w.Header().Set("Retry-After", "60")
			writeErrorMsg(w, http.StatusTooManyRequests, "rate_limited",
				"too many attempts — wait a minute and try again")
		})
	}
}

// ByIP keys on the caller's address.
func ByIP(r *http.Request) string { return "ip:" + clientIP(r) }

// ByEmail keys on the email in the request body, so attempts against one
// account are capped no matter how many addresses they come from.
//
// The body is read and restored, because the handler still needs it. Only the
// first 4 KB is inspected: an auth body is a few hundred bytes, and reading an
// unbounded one here would hand an attacker a memory amplifier.
func ByEmail(r *http.Request) string {
	email := peekEmail(r)
	if email == "" {
		// No readable email — let the per-IP limiter handle it rather than
		// bucketing every malformed request together, which would let one
		// client's garbage lock out everyone else's.
		return ""
	}
	return "email:" + strings.ToLower(email)
}

// peekEmail reads the "email" field without consuming the body.
//
// The handler decodes the same body afterwards, so whatever is read here must
// be put back. Anything unparseable returns "" and simply skips the per-account
// bucket — this is a rate-limit key, not validation.
func peekEmail(r *http.Request) string {
	if r.Body == nil {
		return ""
	}

	const maxPeek = 4 << 10
	buf, err := io.ReadAll(io.LimitReader(r.Body, maxPeek))
	if err != nil {
		return ""
	}
	// Restore the body for the handler. Anything beyond maxPeek is stitched back
	// on unread, so a large body still reaches the handler intact.
	r.Body = io.NopCloser(io.MultiReader(bytes.NewReader(buf), r.Body))

	var probe struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(buf, &probe); err != nil {
		return ""
	}
	return strings.TrimSpace(probe.Email)
}
