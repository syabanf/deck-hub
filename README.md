# WIT

A Netflix-style catalog for presentation decks. Browse company profiles, iconic
pitch decks, engineering talks and keynotes; play PDFs, Google Slides and video
inline; bookmark what matters and pick up where you left off.

React + Vite frontend, Go + PostgreSQL backend, JSON over HTTP.

---

## Contents

- [Quick start](#quick-start) · [Demo accounts](#demo-accounts)
- [How it fits together](#how-it-fits-together) · [Database](#database)
- [API](#api) — [auth](#authentication) · [errors](#errors) · [paging](#paging) · [endpoints](#endpoints)
- [Uploads](#uploads) · [Testing](#testing) · [Deploying](#deploying)

Deeper references, all kept in sync with the code:

| Document | For |
| --- | --- |
| `/docs` on the running API | Browsing the reference in a page |
| [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) | The contract — client generators, Postman/Insomnia |
| [`backend/docs/API.md`](backend/docs/API.md) | The same reference in Markdown, with runnable curl |
| [`backend/docs/ACCOUNTS.md`](backend/docs/ACCOUNTS.md) | Demo accounts, in Indonesian, for walkthroughs |
| [`backend/README.md`](backend/README.md) | Backend internals: architecture, env vars, make targets |

---

## Quick start

You need **Go 1.21+**, **Node 18+**, and **PostgreSQL 16+** (or Docker).

```bash
# 1. Database
cd backend && make docker-up          # or use your own Postgres

# 2. Config — every variable is pre-filled; only JWT_SECRET needs a real value
cp .env.example .env && $EDITOR .env

# 3. Schema + seed data
make migrate-up

# 4. API on :8080
make run
```

```bash
# 5. Frontend on :5173, in another terminal
cp .env.example .env          # VITE_API_URL, pointing at the API above
npm install && npm run dev
```

### Environment variables

Both `.env.example` files carry every variable the code reads, pre-filled with
the default it already applies — copy, and only `JWT_SECRET` needs changing.
The real `.env` files are gitignored; only the templates are committed.

**Backend** — [`backend/.env.example`](backend/.env.example)

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_HOST` `DB_PORT` | `localhost` `5432` | |
| `DB_USER` `DB_PASSWORD` `DB_NAME` | `wit` `wit` `wit` | |
| `DB_SSLMODE` | `disable` | `require` in production |
| `HTTP_PORT` | `8080` | |
| `JWT_SECRET` | — | **Required.** The server exits without it. `openssl rand -base64 48` |
| `JWT_TTL` | `24h` | Go duration. Longer means a stolen token works longer |
| `CORS_ORIGINS` | dev + preview origins | A wrong value fails silently in the browser, not the log |
| `APP_BASE_URL` | `http://localhost:5173` | Where verification emails point — **not** the API's own address |
| `UPLOAD_DIR` | `./uploads` | Not disposable; mount a volume |
| `MAX_UPLOAD_MB` | `25` | Larger uploads get a 413 |

**Frontend** — [`.env.example`](.env.example)

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8080` | Baked in at **build** time. `/api` in production |

Only `VITE_`-prefixed variables reach the browser, and everything carrying that
prefix is compiled into a public bundle — never put a secret in the frontend
`.env`.

Open <http://localhost:5173> and sign in with any account below. The API
reference is at <http://localhost:8080/docs>.

## Demo accounts

Seeded by migrations `000003` and `000006`. **Local development only** — the
passwords are in plain text in a committed migration.

| Email | Password | Role |
| --- | --- | --- |
| `admin@wit.id` | `admin1234` | Admin |
| `editor@wit.id` | `editor1234` | Editor |
| `viewer@wit.id` | `viewer1234` | Viewer |
| `lead-admin@wit.id` | `wit-admin-1234` | Admin |
| `lead-editor@wit.id` | `wit-editor-1234` | Editor |
| `lead-viewer@wit.id` | `wit-viewer-1234` | Viewer |

| Role | Can do |
| --- | --- |
| `admin` | Everything, including managing users |
| `editor` | Create, edit and delete decks; upload files |
| `viewer` | Browse, and manage their own library |

Anyone can also **register**, which creates an unverified `viewer` and emails a
link. Role is never read from the request body — an unauthenticated caller
choosing their own role would be a straight privilege escalation.

---

## How it fits together

The backend follows Clean Architecture: the dependency rule points **inward**,
and the domain layer has zero framework imports.

```
cmd/api/main.go          composition root — config → pool → repos → usecases → handlers
   │
   ├── delivery/http     chi router, DTOs, JWT middleware, handlers
   ├── usecase           business rules; depends only on domain interfaces
   ├── domain            entities + repository interfaces; no imports
   └── repository/postgres, storage/local, mailer/log
```

The frontend is **backend-primary** — the catalog, users and view counts all
come from the API. Only three things live in the browser: the JWT, a mirror of
viewing progress (synced to the server when signed in), and guests' favourites.

### What is deliberately *not* shared

Two pairs look similar and are kept apart on purpose:

- **`viewCount` vs viewing progress.** The first is a public popularity counter
  anyone can increment, including signed-out visitors. The second is private
  per-user history. Folding them together would either leak someone's history
  into a public number or make that number useless for ranking.
- **Verification vs `status`.** `status` is admin-managed
  (active/invited/suspended); email verification is a separate column. Merging
  them would mean suspending an account also destroys its verification.

---

## Database

Eight migrations, applied with `make migrate-up`.

| Migration | What it adds |
| --- | --- |
| `000001_init` | `users`, `decks`, the seed admin |
| `000002_seed_catalog` | ~23 source-based decks |
| `000003_seed_demo_accounts` | editor + viewer demo accounts |
| `000004_favorites` | "My Library", per user |
| `000005_deck_indexes` | `created_at` sort index + trigram search indexes |
| `000006_seed_team_accounts` | the three `lead-*` accounts |
| `000007_email_verification` | `email_verified_at` + hashed token table |
| `000008_viewing_progress` | per-user resume positions |

Every table referencing `users` or `decks` cascades on delete, so removing
either cleans up after itself.

`000005` is worth knowing about: `created_at` had no index although every list
query sorts by it, and search used a leading-wildcard `ILIKE` that can never use
a btree. At 61k rows, measured with `EXPLAIN (ANALYZE)`:

| Query | Before | After |
| --- | --- | --- |
| `ORDER BY created_at DESC LIMIT 50` | 13.7 ms, seq scan | **0.04 ms**, index scan |
| `title ILIKE '%q%'` | 9.5 ms, seq scan | **0.06 ms**, trigram bitmap |

---

## API

Base URL in development: `http://localhost:8080`.

### Authentication

`POST /auth/login` returns a JWT (HS256, 24h by default — `JWT_TTL`). Send it as
`Authorization: Bearer <token>`.

```bash
TOKEN=$(curl -s localhost:8080/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@wit.id","password":"admin1234"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
```

A wrong password, an unknown email and a suspended account all return the same
401 — telling them apart would confirm which addresses have accounts. An
unverified account is the one exception: it gets code `email_not_verified`,
checked *after* the password, so it still reveals nothing. Clients turn that
into "check your inbox" rather than "wrong password".

### Errors

One envelope everywhere, so clients branch on `code` and never parse prose:

```json
{ "error": { "code": "not_found", "message": "deck not found" } }
```

| `code` | Status | Meaning |
| --- | --- | --- |
| `invalid_input` | 400 | Malformed body, bad UUID, failed validation |
| `unauthorized` | 401 | Missing, malformed, or expired token |
| `email_not_verified` | 401 | Correct password, address not yet confirmed |
| `forbidden` | 403 | Authenticated, but the role isn't allowed |
| `not_found` | 404 | No such resource |
| `conflict` | 409 | Email already registered |
| `internal` | 500 | Unexpected server-side failure |

`message` is written for developers. Render your own copy keyed off `code` — the
frontend does this in [`src/lib/errors.js`](src/lib/errors.js).

### Paging

`GET /decks` is **always paged**. Omitting `limit` applies the default of 50
rather than returning the catalog; the ceiling is 200, and larger values are
clamped rather than rejected. The body stays a plain array; metadata rides in
headers:

| Header | Meaning |
| --- | --- |
| `X-Total-Count` | Rows matching the filter, ignoring paging |
| `X-Limit` | Page size actually applied, after clamping |
| `X-Offset` | Offset echoed back |

They are listed in the CORS `Access-Control-Expose-Headers`; a browser hides
response headers from JavaScript otherwise.

Every ordering is tie-broken by `id`. Without that, rows sharing a sort key can
reorder between pages and a paging client silently skips or repeats them.

### Endpoints

27 operations. Full parameters and status codes in
[`openapi.yaml`](backend/docs/openapi.yaml) or at `/docs`.

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/healthz` | public |
| `GET` | `/docs`, `/openapi.yaml` | public |
| `POST` | `/auth/login` | public |
| `POST` | `/auth/register` · `/auth/verify` · `/auth/resend-verification` | public |
| `GET` | `/decks` · `/decks/{id}` · `/decks/stats` | public |
| `POST` | `/decks/{id}/views` | public |
| `POST` `PUT` `DELETE` | `/decks` · `/decks/{id}` | admin, editor |
| `GET` | `/users` · `/users/{id}` | public |
| `POST` `PUT` `DELETE` | `/users` · `/users/{id}` | admin |
| `GET` `PUT` `DELETE` | `/favorites` · `/favorites/{deckId}` | signed in |
| `GET` `PUT` `DELETE` | `/progress` · `/progress/{deckId}` | signed in |
| `POST` | `/uploads` | admin, editor |
| `GET` | `/uploads/{path}` | public |

`/favorites` and `/progress` are always scoped to the token's user — there is no
way to read anyone else's.

Filters on `GET /decks`: `search`, `category`, `industry`, `sourceType`,
`featured`, `sort` (`newest`/`oldest`/`views`/`title`), `limit`, `offset`, and
`ids` for hydrating a known set without listing the catalog. Search treats `%`
and `_` literally — they are ILIKE wildcards, and passing them through meant a
search for `%` matched everything.

---

## Uploads

`multipart/form-data`, one `file` part, capped at 25 MB (`MAX_UPLOAD_MB`).
Allowed: `.pdf .mp4 .webm .mov .m4v .png .jpg .jpeg .gif .webp`.

```bash
curl -s localhost:8080/uploads -H "Authorization: Bearer $TOKEN" -F file=@deck.pdf
# {"url":"/uploads/8f14e45f-….pdf","name":"8f14e45f-….pdf","size":184320,…}
```

Four things protect this path:

- The stored name is a generated **UUID plus extension**. The client's filename
  never becomes part of the path, so it cannot traverse directories or overwrite
  an existing file.
- Files are served with **`X-Content-Type-Options: nosniff`**. Content-Type comes
  from the extension, so a `.pdf` holding HTML is labelled `application/pdf` —
  without nosniff a browser may ignore that, sniff the HTML and run its scripts
  against the API's own origin.
- **Empty uploads are rejected.** A 0-byte file produces a deck that can never
  render, and the failure would only surface later at playback.
- Traversal on download is a 404.

Persist the returned `url` — it is **server-relative**, so stored decks survive
an origin change. The frontend resolves it against the API base at render time.

---

## Testing

```bash
cd backend
make test        # unit tests
make docs        # spec matches the router — no database needed
make test-e2e    # real HTTP against a real database
make stress      # throughput + latency, doubles as a regression guard
npm run build    # frontend, from the repo root
```

`test/e2e` wires the same dependency graph as `cmd/api/main.go` and drives it
over `httptest` — no mocks. It is opt-in via `E2E_DATABASE_URL` so a plain
`go test ./...` skips it, and it **drops and recreates the schema on every run**:

```bash
createdb wit_test && psql -d wit_test -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
make test-e2e    # targets $(DB_NAME)_test — never point this at a database you care about
```

`make docs` is what keeps the reference honest. It walks the chi router and
compares it to the spec in both directions — an undocumented route fails, so
does documentation for a route that no longer exists, and so does a dangling
`$ref`. It also fails by name if a handler is left nil, because an unmounted
route would otherwise pass the check by being absent.

### Indicative load

50 workers, 3s per scenario, local Postgres on an M-series laptop. All scenarios
0.00% errors; any scenario above 1% fails the build.

| Scenario | RPS | p50 | p99 |
| --- | ---: | --- | --- |
| `GET /healthz` | 110,600 | 0.3 ms | 1.7 ms |
| `GET /decks/{id}` | 48,000 | 1.0 ms | 1.8 ms |
| `GET /decks?category=` | 14,500 | 3.4 ms | 4.8 ms |
| `GET /decks` (full list) | 12,900 | 3.7 ms | 6.7 ms |
| mixed browse (80/15/5) | 14,900 | 3.5 ms | 7.6 ms |
| `POST /decks` | 15,800 | 3.1 ms | 7.2 ms |
| `POST /auth/login` | 159 | 60 ms | 111 ms |

`/auth/login` is ~700× slower than a read because bcrypt is doing its job.
Budget for it and cache the JWT client-side rather than "fixing" it.

At **47k decks**, `GET /decks` with no `?limit` costs the same as `?limit=50` —
0.017 MB per request either way. Before the default page size existed it was
25 MB at 34 req/s; the stress suite now fails if a no-limit response ever
exceeds 1 MB again.

---

## Deploying

The frontend needs `VITE_API_URL` at **build time** — it is baked into the
bundle, not read at runtime. The production deployment sets it to `/api` and
proxies same-origin, which is why the browser never sees a cross-origin call.

```bash
VITE_API_URL=/api npm run build
```

The backend needs `JWT_SECRET` and refuses to start without one. `CORS_ORIGINS`
must list the browser origins allowed to call it. Run `make migrate-up` **before**
deploying a build that depends on a new migration.

Verification emails are printed to the server log by the development mailer, so
the flow works without SMTP credentials. Sending for real means writing another
`domain.Mailer` — nothing above that layer changes.
