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

Error responses use a consistent envelope:

```json
{ "error": { "code": "not_found", "message": "resource not found: deck ..." } }
```

| Method | Path                  | Auth                     | Description                |
| ------ | --------------------- | ------------------------ | -------------------------- |
| GET    | `/healthz`            | public                   | Liveness probe             |
| POST   | `/auth/login`         | public                   | Login → JWT + user         |
| GET    | `/users`              | public                   | List users (filterable)    |
| GET    | `/users/{id}`         | public                   | Get a user                 |
| POST   | `/users`              | **admin**                | Create a user              |
| PUT    | `/users/{id}`         | **admin**                | Update a user              |
| DELETE | `/users/{id}`         | **admin**                | Delete a user              |
| GET    | `/decks`              | public                   | List decks (filterable)    |
| GET    | `/decks/{id}`         | public                   | Get a deck                 |
| POST   | `/decks/{id}/views`   | public                   | Increment view count       |
| POST   | `/decks`              | **admin or editor**      | Create a deck              |
| PUT    | `/decks/{id}`         | **admin or editor**      | Update a deck              |
| DELETE | `/decks/{id}`         | **admin or editor**      | Delete a deck              |

Query filters:

- `GET /users?search=&role=&status=&limit=&offset=`
- `GET /decks?search=&category=&industry=&sourceType=&featured=&limit=&offset=`

User responses **never** include the password hash.

### Example curl

Login (grab a token):

```bash
TOKEN=$(curl -s -X POST localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@wit.id","password":"admin1234"}' | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "$TOKEN"
```

List decks (public):

```bash
curl -s localhost:8080/decks
curl -s 'localhost:8080/decks?category=technology&featured=true'
```

Get one deck and bump its view count:

```bash
curl -s localhost:8080/decks/<deck-id>
curl -s -X POST localhost:8080/decks/<deck-id>/views
```

Create a deck (admin/editor):

```bash
curl -s -X POST localhost:8080/decks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Quarterly Strategy",
    "subtitle": "FY25 plan",
    "author": "Strategy Team",
    "year": 2025,
    "category": "business",
    "industry": "finance",
    "tags": ["strategy","planning"],
    "source": { "type": "gslides", "value": "https://docs.google.com/presentation/d/abc" },
    "description": "Company-wide strategy overview.",
    "featured": false
  }'
```

Create a user (admin only):

```bash
curl -s -X POST localhost:8080/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Casey Editor","email":"casey@wit.id","password":"editor1234","role":"editor","status":"active"}'
```

Update a deck (partial; send only changed fields):

```bash
curl -s -X PUT localhost:8080/decks/<deck-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"featured": true}'
```

Delete a deck:

```bash
curl -s -X DELETE localhost:8080/decks/<deck-id> -H "Authorization: Bearer $TOKEN"
```

---

## Development

```bash
make tidy     # go mod tidy
make vet      # go vet ./...
make build    # build bin/api
make test     # go test ./...
make hash PASS=secret   # print a bcrypt hash
```

The CORS handler allows the Vite dev origin `http://localhost:5173`, so the
existing React frontend can call this API directly.
