# Local development environment

Everything below was verified on this machine on 2026-10-09. Where the setup
differs from what the README assumes, the difference is written down rather
than smoothed over — a surprise found at the tenth command is more expensive
than one read here.

Machine: macOS 27.0 (Darwin 27.0.0), **arm64** (Apple Silicon), 16 GB RAM,
8 cores, 162 GB free on `/`.

This replaces an Intel laptop (macOS Ventura, x86_64), and the repository was
copied across as-is. Anything built for that machine has to be rebuilt here —
see [Node](#node).

## Homebrew

Installed under **`/opt/homebrew`** — the Apple Silicon prefix, not
`/usr/local`. `~/.zprofile` runs `brew shellenv`, so `brew` and everything it
links are on PATH in a new shell. Older notes and scripts that hard-code
`/usr/local/opt/...` point at nothing here.

## Node

`node` on the default PATH is nvm's **v22.23.3**, matching `.nvmrc` (22) and the
container image's `node:22-alpine`. No PATH juggling is needed.

`node_modules` copied from the old machine **does not work**: esbuild and
rollup ship native binaries per platform, and the copy held the `darwin-x64`
ones with no `.bin/` links, so `npm run dev` failed with `vite: command not
found`. Reinstall after any copy between machines:

```bash
npm ci
```

## PostgreSQL

**Postgres.app**, PostgreSQL **15.19**, on the default **port 5432**. It has to
be running before the API starts — open Postgres.app if `go run` reports
"connection refused". `~/.zprofile` also puts its `bin/` on PATH.

`psql` comes from Homebrew `libpq` (18.6), which is keg-only. `~/.zshrc` adds
it to PATH:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

Production runs **postgres:16-alpine**. All 22 migrations apply cleanly on 15,
but it is a gap, and anything that depends on a 16-only behaviour will pass here
and fail there. The Docker stack below runs 16 if that matters.

### Databases this project owns

| Database | Purpose |
| --- | --- |
| `wit` | Development. What `backend/.env` points at |
| `wit_test` | `make test-e2e` and `make stress`. **Dropped and recreated on every run**. Not created yet |
| `wit_staging` | `staging/staging.sh`. Not created yet — see [Staging](#staging) |

Role `wit` / password `wit`, owner of `wit`. Unlike on the old machine it is
**not a superuser** and cannot create databases, so `wit_test` and
`wit_staging` have to be created by the Postgres.app user first:

```bash
createdb -h localhost -O wit wit_test
createdb -h localhost -O wit wit_staging
```

The migrations' `pgcrypto` and `pg_trgm` are trusted extensions, so the
database owner can install them without superuser.

### Other databases on this server — do not touch

The same PostgreSQL instance is shared with another project:

```
wit_commercial   wit_commercial_test
```

`wit_commercial` belongs to the commercial-dashboard project and has its own
backup schedule. The names are close enough to this project's that a mistyped
`DB_NAME` reaches a real database instead of failing — worth reading twice
before running anything that writes.

## Docker

**Docker Desktop** 4.94 (engine 29.8.2, Compose v5.5.1). It is not started at
login: open Docker.app and wait for the whale in the menu bar before running
`docker compose`.

Both compose files validate (`docker compose config -q`), but neither stack has
been brought up on this machine yet. Two clashes to know about first:

- `backend/docker-compose.yml` publishes Postgres on **5432**, which
  Postgres.app already holds. Quit Postgres.app or set `DB_PORT` before
  `make docker-up`.
- The root `docker-compose.yml` publishes the app on **8080**
  (`APP_PORT`), which is the dev API's port. Set `APP_PORT` to something else
  to run it alongside development.

## Staging

`staging/staging.sh` existed because the old machine could not run Docker. It
**does not run here yet**:

- nginx is not installed — `brew install nginx`.
- `wit_staging` does not exist, and the script's own `createdb` fails because
  role `wit` lacks `CREATEDB`. Create it as above.
- Its keg-only `psql` search covers `/usr/local/opt/libpq/bin` but not
  `/opt/homebrew/opt/libpq/bin`; it works only because the interactive shell
  already has the latter on PATH.

With Docker available, the root `docker-compose.yml` is the reference staging
environment and the closer match to production.

## Other tools

All from Homebrew.

| Tool | Version | Used by |
| --- | --- | --- |
| Go | 1.27.2 | backend. `go.mod` asks for 1.25 |
| golang-migrate | v4.20.1 | `make migrate-up` |
| gh | 2.102.0 | pull requests, CI status. Run `gh auth login` before first use |

Git pushes over SSH (`~/.ssh/id_ed25519`), which authenticates as GitHub user
`prasetyo-hub`.

## What runs where

| | Frontend | API | Database |
| --- | --- | --- | --- |
| Development | `:5173` (Vite) | `:8080` | `wit` on `:5432` |
| Staging | `:8081` (nginx) | `:8090` | `wit_staging` — not set up |

```bash
# development — two terminals
cd backend && go run ./cmd/api
npm run dev
```

`.claude/launch.json` has both as `wit` (Vite) and `wit-api` (the API).

## Verified on this setup

- `make migrate-up` — 22/22 migrations, on PostgreSQL 15
- `make seed-demo` — 12 users, 27 decks
- `go build ./...`, `go test ./...` — unit and docs suites pass. The e2e and
  stress suites **skipped themselves** (no `wit_test`), so they are unverified
- `npm test` — 16/16
- Sign-in through the browser at `:5173` as `editor@wit.id`
- Docker: `docker run hello-world`

Not yet verified here: `make test-e2e`, `make stress`, the production build
(`VITE_API_URL=/api npm run build`), `staging/staging.sh`, and either compose
stack.
