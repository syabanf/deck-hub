# WIT Backend

Production-quality Go + PostgreSQL backend for **WIT**, a Netflix-style
presentation/deck catalog. Built with **Clean Architecture** so business rules
stay independent of frameworks and the database.

Module: `github.com/wit/wit-backend` · Go 1.21 · chi · pgx/v5 · JWT · bcrypt

---

## Architecture

The dependency rule points **inward**: outer layers may import inner layers, but
never the reverse. The domain layer has zero framework imports.

```
                ┌─────────────────────────────────────────────┐
                │                cmd/api/main.go                │
                │   composition root: config → pool → repos →   │
                │        usecases → handlers → chi server       │
                └───────────────────────┬─────────────────────┘
                                        │ wires everything
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                                ▼
┌───────────────────┐        ┌────────────────────┐         ┌──────────────────────┐
│  delivery/http     │        │  repository/postgres│         │      config           │
│  (transport)       │        │  (infrastructure)   │         │  env → Config + DSN   │
│  chi router, DTOs, │        │  pgx implementations│         └──────────────────────┘
│  JWT middleware,   │        │  of domain repos    │
│  handlers          │        └─────────┬──────────┘
└─────────┬─────────┘                   │ implements
          │ depends on                  │
          │ narrow usecase              ▼
          │ interfaces        ┌────────────────────┐
          └──────────────────▶│      usecase        │
                              │  application rules  │
                              │  (bcrypt, validation│
                              │   auth, CRUD)       │
                              └─────────┬──────────┘
                                        │ depends on
                                        ▼
                              ┌────────────────────┐
                              │       domain        │
                              │  entities + repo    │
                              │  INTERFACES + errors│
                              │  (no framework deps)│
                              └────────────────────┘
```

Key boundaries:

- **domain** — `User`, `Deck` entities, repository **interfaces**, and sentinel
  errors (`ErrNotFound`, `ErrConflict`, `ErrInvalidInput`, `ErrUnauthorized`).
  No imports of chi/pgx/http.
- **usecase** — application business rules. Depends only on domain interfaces.
  Hashes passwords (bcrypt), validates input, enforces email uniqueness,
  authenticates users. Unit-tested with an in-memory fake repo (no DB).
- **repository/postgres** — pgx implementations of the domain interfaces. Maps
  `pgx.ErrNoRows → ErrNotFound` and unique-violation `23505 → ErrConflict`.
- **delivery/http** — chi router, DTOs, JWT auth/role middleware, handlers.
  Handlers depend on **narrow interfaces declared in this package**, never on
  `repository/postgres` or pgx.

Directory layout:

```
backend/
├── cmd/
│   ├── api/main.go        # composition root + graceful shutdown
│   └── hashpw/main.go     # helper: print a bcrypt hash for a password
├── internal/
│   ├── domain/            # entities, repo interfaces, errors
│   ├── usecase/           # business rules (+ unit tests)
│   ├── repository/postgres/
│   ├── delivery/http/     # router, handlers, middleware, dto, response
│   └── config/
├── migrations/            # golang-migrate up/down SQL
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

---

## Prerequisites

- **Go 1.21+**
- **Docker** (for the local PostgreSQL via docker-compose), or your own Postgres 16
- **[golang-migrate CLI](https://github.com/golang-migrate/migrate)** for the
  `make migrate-*` targets:
  ```bash
  brew install golang-migrate
  # or: go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
  ```

---

## Environment setup

```bash
cp .env.example .env
# edit .env — at minimum set a real JWT_SECRET
```

`JWT_SECRET` is **required**; the server refuses to start without it. All other
vars have sensible defaults (see `.env.example`).

| Variable      | Default     | Notes                                  |
| ------------- | ----------- | -------------------------------------- |
| `DB_HOST`     | `localhost` |                                        |
| `DB_PORT`     | `5432`      |                                        |
| `DB_USER`     | `wit`       |                                        |
| `DB_PASSWORD` | `wit`       |                                        |
| `DB_NAME`     | `wit`       |                                        |
| `DB_SSLMODE`  | `disable`   | `require` in production                 |
| `HTTP_PORT`   | `8080`      |                                        |
| `JWT_SECRET`  | _(none)_    | **required**                            |
| `JWT_TTL`     | `24h`       | Go duration (`15m`, `24h`, …)           |

---

## Run it

### 1. Start PostgreSQL

```bash
make docker-up        # postgres:16-alpine + adminer (http://localhost:8081)
```

### 2. Apply migrations (creates tables + seeds data)

```bash
make migrate-up
```

This creates the `users` and `decks` tables and seeds **one admin user** plus
four sample decks.

> **Seed admin credentials**
> - **email:** `admin@wit.id`
> - **password:** `admin1234`
>
> The seed stores a bcrypt hash of `admin1234`. If login fails because the
> shipped hash doesn't match in your environment, regenerate it:
> ```bash
> make hash PASS=admin1234        # prints a fresh bcrypt hash
> ```
> Paste the output into the `INSERT INTO users (...)` statement in
> `migrations/000001_init.up.sql` (keep the single quotes), then re-run
> `make migrate-down && make migrate-up`.

### 3. Run the API

```bash
make run              # go run ./cmd/api
# → HTTP server listening on :8080
```

Health check:

```bash
curl -s localhost:8080/healthz
# {"status":"ok"}
```

---

## API

Base URL: `http://localhost:8080`

Full reference — every endpoint, parameter, status code and curl example:

| Document | For |
| -------- | --- |
| [`docs/API.md`](docs/API.md) | Reading. Grouped by resource, with runnable examples. |
| [`docs/openapi.yaml`](docs/openapi.yaml) | Tooling. OpenAPI 3.0 — client generation, Postman/Insomnia import, doc viewers. |

The spec is not on the honour system: `test/docs` walks the chi router and fails
the build if a mounted route is undocumented, if the spec describes a route that
no longer exists, or if a `$ref` dangles.

```bash
make docs
```

A table of routes used to live here too. It drifted — it was missing
`/decks/stats` and all of `/favorites` — so it now lives in one place that CI
keeps honest.

### The two things worth knowing up front

**Errors** use one envelope, so clients branch on `code` rather than parsing prose:

```json
{ "error": { "code": "not_found", "message": "resource not found: deck ..." } }
```

**`GET /decks` is always paged.** Omitting `limit` applies the default of 50
instead of returning the catalog; the ceiling is 200. Totals come back in
`X-Total-Count`, with `X-Limit` and `X-Offset` alongside.

### Example curl

Login (grab a token):

```bash
TOKEN=$(curl -s -X POST localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@wit.id","password":"admin1234"}' | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "$TOKEN"
```

## File uploads

Uploads are stored on the **local filesystem** for now. The handler depends on
the `domain.FileStorage` interface, so swapping in S3/GCS later means adding one
implementation — nothing above it changes.

| Variable        | Default     | Notes                                   |
| --------------- | ----------- | --------------------------------------- |
| `UPLOAD_DIR`    | `./uploads` | Where files are written and served from |
| `MAX_UPLOAD_MB` | `25`        | Max size of a single upload             |

Files are saved under a generated `<uuid><ext>` name — the client's filename is
never used for the path — and only these extensions are accepted: `.pdf`,
`.mp4`, `.webm`, `.mov`, `.m4v`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`.

```bash
# Upload (returns a server-relative path)
curl -s -X POST localhost:8080/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@deck.pdf"
# {"url":"/uploads/3d2e107d-….pdf","name":"3d2e107d-….pdf","size":193,"contentType":"application/pdf"}

# Then reference it from a deck
curl -s -X POST localhost:8080/decks -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"My Deck","category":"mine","source":{"type":"pdf","value":"/uploads/3d2e107d-….pdf"}}'
```

The frontend stores the **relative** path and resolves it against the API origin
at render time, so the same rows work across environments.

---

## Development

```bash
make tidy     # go mod tidy
make vet      # go vet ./...
make build    # build bin/api
make test     # unit tests
make test-e2e # end-to-end tests (see below)
make hash PASS=secret   # print a bcrypt hash
```

### End-to-end tests

`test/e2e` drives the **real HTTP API against a real PostgreSQL database** — no
mocks. It wires the same dependency graph as `cmd/api/main.go`, serves it over
`httptest`, and exercises auth, the deck and user lifecycles, role guards,
validation, and uploads (including that a stored file is downloadable
byte-for-byte and that path traversal is blocked).

The suite is opt-in via `E2E_DATABASE_URL`, so a plain `go test ./...` skips it:

```bash
# One-time: a database the suite is allowed to wipe on every run.
createdb wit_test && psql -d wit_test -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'

make test-e2e            # uses $(DB_NAME)_test
# or point it anywhere:
E2E_DATABASE_URL="postgres://wit:wit@localhost:5432/wit_test?sslmode=disable" \
  go test ./test/e2e/... -count=1 -v
```

> The suite **drops and recreates** the schema from `migrations/000001_*` on
> every run — never point it at a database you care about.

### Stress / load tests

`test/stress` drives the same real stack under concurrent load and reports
throughput plus latency percentiles per scenario. It is also a regression
guard: any scenario whose error rate exceeds 1% fails the test, so pool
exhaustion, deadlocks, or timeouts surface as a red build.

```bash
make stress                                    # 50 workers, 3s/scenario, 300 decks
make stress CONCURRENCY=200 DURATION=10s DECKS=5000
```

Phases run read-only first and mutations last, so baseline numbers aren't
skewed by rows an earlier phase inserted. Indicative results on an M-series
laptop (10 cores, local Postgres, 50 workers):

| Scenario                  |     RPS | p50    | p99    |
| ------------------------- | ------: | ------ | ------ |
| `GET /healthz`            | 110,000 | 0.3 ms | 1.7 ms |
| `GET /decks/{id}`         |  41,700 | 1.1 ms | 2.3 ms |
| `GET /decks?category=`    |  17,500 | 2.8 ms | 5.3 ms |
| `GET /decks` (304 decks)  |   4,970 | 9.3 ms | 23 ms  |
| mixed browse (80/15/5)    |   6,000 | 7.9 ms | 15 ms  |
| `POST /decks/{id}/views`  |  11,800 | 3.7 ms | 13 ms  |
| `POST /decks`             |  25,900 | 1.7 ms | 6.5 ms |
| `POST /auth/login`        |     155 | 62 ms  | 88 ms  |

`/auth/login` is intentionally ~400× slower than a read — that's bcrypt doing
its job. Budget for it (and cache the JWT client-side) rather than "fixing" it.

**Known scaling limit.** `GET /decks` applies `LIMIT` only when `?limit` is
passed, so by default it serialises the whole table. The `5-large-table` phase
quantifies this at ~78k decks:

| Request              |  RPS | p50    | Payload    |
| -------------------- | ---: | ------ | ---------- |
| `GET /decks`         |   27 | 1.66 s | 26.8 MB    |
| `GET /decks?limit=50`|  941 | 50 ms  | 0.017 MB   |

That's a **35× throughput difference**. Fine at today's catalog size (the
frontend fetches once and filters client-side), but a default page size — plus
frontend pagination — is required before the catalog grows large.

The CORS handler allows the Vite dev origin `http://localhost:5173`, so the
existing React frontend can call this API directly.
