// Package stress load-tests the real HTTP API against a real PostgreSQL
// database and reports throughput + latency percentiles per scenario.
//
// It doubles as a regression guard: every scenario fails the test if the error
// rate exceeds the allowed threshold, so a deadlock, pool exhaustion, or
// timeout regression shows up as a red build rather than a slow graph.
//
// Opt-in (it WIPES the target database):
//
//	make stress
//	# or tune it:
//	STRESS_DATABASE_URL="postgres://wit:wit@localhost:5432/wit_test?sslmode=disable" \
//	STRESS_CONCURRENCY=100 STRESS_DURATION=5s STRESS_DECKS=500 \
//	  go test ./test/stress/... -run TestStress -v
package stress

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
	"github.com/wit/wit-backend/internal/repository/postgres"
	"github.com/wit/wit-backend/internal/storage/local"
	"github.com/wit/wit-backend/internal/usecase"
)

const (
	adminEmail    = "admin@wit.id"
	adminPassword = "admin1234"
	// Anything above this fraction of failed requests fails the scenario.
	maxErrorRate = 0.01
)

var (
	srv         *httptest.Server
	dbPool      *pgxpool.Pool
	adminJWT    string
	sampleDeck  string
	concurrency = envInt("STRESS_CONCURRENCY", 50)
	duration    = envDuration("STRESS_DURATION", 3*time.Second)
	deckCount   = envInt("STRESS_DECKS", 300)

	// One shared client with a wide connection pool: we want to measure the
	// server, not TCP handshake churn.
	client = &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        1000,
			MaxIdleConnsPerHost: 1000,
			IdleConnTimeout:     90 * time.Second,
		},
	}
)

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return def
}

func TestMain(m *testing.M) {
	dsn := os.Getenv("STRESS_DATABASE_URL")
	if dsn == "" {
		fmt.Println("STRESS_DATABASE_URL not set — skipping stress suite")
		os.Exit(0)
	}

	ctx := context.Background()

	// Clean schema, then load it up with a realistic amount of data. Drop
	// favorites first so a leftover FK from an e2e run can't block the reset.
	for _, f := range []string{
		"000004_favorites.down.sql",
		"000001_init.down.sql",
		"000001_init.up.sql",
	} {
		if err := execSQLFile(ctx, dsn, filepath.Join("..", "..", "migrations", f)); err != nil {
			fmt.Printf("migration %s: %v\n", f, err)
			os.Exit(1)
		}
	}
	if err := seedDecks(ctx, dsn, deckCount); err != nil {
		fmt.Printf("seed decks: %v\n", err)
		os.Exit(1)
	}

	pool, err := postgres.NewPool(ctx, dsn)
	if err != nil {
		fmt.Printf("connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()
	dbPool = pool

	uploadDir, err := os.MkdirTemp("", "wit-stress-uploads-*")
	if err != nil {
		fmt.Printf("temp dir: %v\n", err)
		os.Exit(1)
	}
	defer os.RemoveAll(uploadDir)
	store, _ := local.New(uploadDir, "/uploads")

	userUC := usecase.NewUserUsecase(postgres.NewUserRepository(pool))
	deckUC := usecase.NewDeckUsecase(postgres.NewDeckRepository(pool))
	tokens := httpdelivery.NewTokenManager("stress-secret", time.Hour)

	srv = httptest.NewServer(httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:      httpdelivery.NewAuthHandler(userUC, tokens),
		Users:     httpdelivery.NewUserHandler(userUC),
		Decks:     httpdelivery.NewDeckHandler(deckUC),
		Uploads:   httpdelivery.NewUploadHandler(store, 25<<20),
		Tokens:    tokens,
		UploadDir: store.Dir(),
	}))
	defer srv.Close()

	if err := bootstrap(); err != nil {
		fmt.Printf("bootstrap: %v\n", err)
		os.Exit(1)
	}

	os.Exit(m.Run())
}

func execSQLFile(ctx context.Context, dsn, path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return err
	}
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	_, err = conn.Exec(ctx, string(b))
	return err
}

// seedDecks bulk-inserts n decks so list responses have realistic weight.
func seedDecks(ctx context.Context, dsn string, n int) error {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	_, err = conn.Exec(ctx, `
		INSERT INTO decks (title, subtitle, author, year, category, industry, tags,
		                   source_type, source_value, description, featured, view_count)
		SELECT
		  'Stress Deck ' || g,
		  'generated for load testing',
		  'Load Generator',
		  2018 + (g % 8),
		  (ARRAY['company-profile','iconic','design','engineering','strategy','keynotes'])[1 + (g % 6)],
		  (ARRAY['tech','finance','media','mobility','enterprise'])[1 + (g % 5)],
		  ARRAY['stress','load'],
		  (ARRAY['gslides','url','video'])[1 + (g % 3)],
		  'https://example.com/deck/' || g,
		  'A deck generated to give the list endpoint realistic payload weight.',
		  false,
		  (g * 7) % 500
		FROM generate_series(1, $1) g`, n)
	return err
}

// bootstrap grabs a token and a deck id for the scenarios that need them.
func bootstrap() error {
	body, _ := json.Marshal(map[string]string{"email": adminEmail, "password": adminPassword})
	res, err := client.Post(srv.URL+"/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return err
	}
	adminJWT = out.Token

	res2, err := client.Get(srv.URL + "/decks?limit=1")
	if err != nil {
		return err
	}
	defer res2.Body.Close()
	var decks []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(res2.Body).Decode(&decks); err != nil {
		return err
	}
	if len(decks) == 0 {
		return fmt.Errorf("no decks seeded")
	}
	sampleDeck = decks[0].ID
	return nil
}

// ---------- harness ----------

type report struct {
	name      string
	total     int64
	failed    int64
	latencies []time.Duration
	elapsed   time.Duration
	bytes     int64
}

func (r *report) rps() float64 { return float64(r.total) / r.elapsed.Seconds() }

func (r *report) errRate() float64 {
	if r.total == 0 {
		return 1
	}
	return float64(r.failed) / float64(r.total)
}

func (r *report) pct(p float64) time.Duration {
	if len(r.latencies) == 0 {
		return 0
	}
	i := int(p * float64(len(r.latencies)-1))
	return r.latencies[i]
}

// request performs one call; returns latency, bytes read, and whether it failed.
type requestFn func() (status int, n int64, err error)

// run drives `conc` workers against fn for `dur` and collects a report.
func run(name string, conc int, dur time.Duration, fn requestFn) *report {
	var (
		total, failed, nbytes int64
		mu                    sync.Mutex
		all                   []time.Duration
		wg                    sync.WaitGroup
	)
	deadline := time.Now().Add(dur)
	start := time.Now()

	for i := 0; i < conc; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := make([]time.Duration, 0, 1024)
			for time.Now().Before(deadline) {
				t0 := time.Now()
				status, n, err := fn()
				lat := time.Since(t0)
				local = append(local, lat)
				atomic.AddInt64(&total, 1)
				atomic.AddInt64(&nbytes, n)
				if err != nil || status < 200 || status >= 400 {
					atomic.AddInt64(&failed, 1)
				}
			}
			mu.Lock()
			all = append(all, local...)
			mu.Unlock()
		}()
	}
	wg.Wait()

	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	return &report{
		name: name, total: total, failed: failed,
		latencies: all, elapsed: time.Since(start), bytes: nbytes,
	}
}

// drain fully reads and closes the body so the connection can be reused.
func drain(res *http.Response) int64 {
	n, _ := io.Copy(io.Discard, res.Body)
	res.Body.Close()
	return n
}

func get(path string) requestFn {
	return func() (int, int64, error) {
		res, err := client.Get(srv.URL + path)
		if err != nil {
			return 0, 0, err
		}
		return res.StatusCode, drain(res), nil
	}
}

func postJSON(path, token string, body any) requestFn {
	raw, _ := json.Marshal(body)
	return func() (int, int64, error) {
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(raw))
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := client.Do(req)
		if err != nil {
			return 0, 0, err
		}
		return res.StatusCode, drain(res), nil
	}
}

func (r *report) log(t *testing.T) {
	t.Helper()
	t.Logf(
		"%-22s %7d reqs  %8.0f rps  err %5.2f%%  p50 %7s  p90 %7s  p99 %7s  max %7s  %6.1f MB",
		r.name, r.total, r.rps(), r.errRate()*100,
		r.pct(0.50).Round(time.Microsecond*100),
		r.pct(0.90).Round(time.Microsecond*100),
		r.pct(0.99).Round(time.Microsecond*100),
		r.pct(1.0).Round(time.Microsecond*100),
		float64(r.bytes)/(1024*1024),
	)
	if r.errRate() > maxErrorRate {
		t.Errorf("%s: error rate %.2f%% exceeds %.2f%% (%d/%d failed)",
			r.name, r.errRate()*100, maxErrorRate*100, r.failed, r.total)
	}
}

// ---------- scenarios ----------

// countDecks reports the current table size so each phase's numbers are
// interpretable (the create scenario deliberately grows it).
func countDecks(t *testing.T) int {
	t.Helper()
	var n int
	if err := dbPool.QueryRow(context.Background(), "SELECT count(*) FROM decks").Scan(&n); err != nil {
		t.Fatalf("count decks: %v", err)
	}
	return n
}

func TestStress(t *testing.T) {
	t.Logf("config: concurrency=%d duration=%s seeded_decks=%d", concurrency, duration, deckCount)

	// Phases run read-only first, then mutation last, so the baseline numbers
	// aren't skewed by rows an earlier phase inserted.
	t.Run("1-read", func(t *testing.T) {
		t.Logf("table size: %d decks", countDecks(t))
		run("GET /healthz", concurrency, duration, get("/healthz")).log(t)
		run("GET /decks/{id}", concurrency, duration, get("/decks/"+sampleDeck)).log(t)
		run("GET /decks?category=", concurrency, duration, get("/decks?category=engineering")).log(t)
		run("GET /decks (full list)", concurrency, duration, get("/decks")).log(t)
	})

	// Realistic browse traffic: mostly listing, some detail, a few view bumps.
	t.Run("2-mixed", func(t *testing.T) {
		list := get("/decks")
		detail := get("/decks/" + sampleDeck)
		views := postJSON("/decks/"+sampleDeck+"/views", "", nil)
		run("mixed browse (80/15/5)", concurrency, duration, func() (int, int64, error) {
			switch n := rand.Intn(100); {
			case n < 80:
				return list()
			case n < 95:
				return detail()
			default:
				return views()
			}
		}).log(t)
	})

	// bcrypt is deliberately expensive; this measures that cost, so it runs at
	// lower concurrency to avoid simply queueing on CPU.
	t.Run("3-auth", func(t *testing.T) {
		conc := concurrency / 5
		if conc < 1 {
			conc = 1
		}
		run("POST /auth/login (bcrypt)", conc, duration, postJSON("/auth/login", "", map[string]string{
			"email": adminEmail, "password": adminPassword,
		})).log(t)
	})

	t.Run("4-write", func(t *testing.T) {
		// Every worker hammers the same row — worst-case write contention.
		run("POST /decks/{id}/views", concurrency, duration,
			postJSON("/decks/"+sampleDeck+"/views", "", nil)).log(t)

		// This one grows the table by design; it runs last.
		run("POST /decks (create)", concurrency, duration, postJSON("/decks", adminJWT, map[string]any{
			"title": "Stress Created", "category": "mine", "industry": "tech",
			"tags":   []string{"stress"},
			"source": map[string]string{"type": "url", "value": "https://example.com/x"},
		})).log(t)
	})

	// The create phase leaves a large table behind — use it to quantify what an
	// unbounded list costs versus a paged one. GET /decks applies LIMIT only
	// when ?limit is passed, so by default it serialises the entire table.
	t.Run("5-large-table", func(t *testing.T) {
		total := countDecks(t)
		t.Logf("table size: %d decks", total)

		unbounded := run("GET /decks (UNBOUNDED)", concurrency, duration, get("/decks"))
		unbounded.log(t)
		paged := run("GET /decks?limit=50", concurrency, duration, get("/decks?limit=50"))
		paged.log(t)

		perReqMB := func(r *report) float64 {
			if r.total == 0 {
				return 0
			}
			return float64(r.bytes) / float64(r.total) / (1024 * 1024)
		}
		t.Logf("→ at %d decks: unbounded %.1f MB/req @ %.0f rps vs paged %.3f MB/req @ %.0f rps (%.0fx throughput)",
			total, perReqMB(unbounded), unbounded.rps(),
			perReqMB(paged), paged.rps(), paged.rps()/max(unbounded.rps(), 0.001))
	})
}
