# Local development environment

Everything below was verified on this machine on 2026-09-07. Where the setup
differs from what the README assumes, the difference is written down rather
than smoothed over — a surprise found at the tenth command is more expensive
than one read here.

Machine: macOS Ventura (Darwin 22.6.0), x86_64, 8 GB RAM, 4 cores.

## Node

`node` on the default PATH is **v10.19.0**, which cannot build this project —
Vite 5 needs 18 or newer, and the container image builds on `node:22-alpine`.
nvm has a usable copy:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
```

`.nvmrc` names 22, so `nvm use` in this directory picks the right one when nvm
is loaded in the shell. `staging/staging.sh` finds it on its own; anything else
run by hand needs the line above, or `npm` resolves to v10's and fails inside
its own CLI before your code is ever reached.

## PostgreSQL

Homebrew `postgresql@15`, already running as a service, on **port 5439** — not
5432. Nothing listens on 5432 at all, so the README's defaults produce
"connection refused" rather than a wrong-database mistake.

`psql` is keg-only and not on PATH:

```bash
export PATH="/usr/local/opt/postgresql@15/bin:$PATH"
# or, for one target:
make seed-demo PSQL=/usr/local/opt/postgresql@15/bin/psql
```

Production runs **postgres:16-alpine**. All nine migrations apply cleanly on 15
and the full test suite passes, so the gap has not bitten yet — but it is a gap,
and anything that depends on a 16-only behaviour will pass here and fail there.

### Databases this project owns

| Database | Purpose |
| --- | --- |
| `wit` | Development. What `backend/.env` points at |
| `wit_test` | `make test-e2e` and `make stress`. **Dropped and recreated on every run** |
| `wit_staging` | `staging/staging.sh`. Its own database so staging traffic never lands in `wit` |

Role `wit` / password `wit`, superuser. Fine on a laptop, and the reason
`DB_SSLMODE=disable` is acceptable here and nowhere else.

### Other databases on this server — do not touch

The same PostgreSQL instance is shared with unrelated projects:

```
artotel-qa-design   scbd-habitat   wit_commercial   wit_commercial_test
```

`wit_commercial` in particular belongs to the commercial-dashboard project and
has its own backup schedule. The names are close enough to this project's that
a mistyped `DB_NAME` reaches a real database instead of failing — worth reading
twice before running anything that writes.

## Docker

There is **no Docker daemon** on this machine. The `docker` and
`docker-compose` binaries exist from an earlier install, but nothing is running
behind them, so `docker-compose.yml` cannot be brought up here.

Colima was installed and removed again: the APFS container had 2 GB free, and a
Linux VM plus the four images this stack needs is closer to 6 GB. Check before
trying again — `df -h /`.

`staging/staging.sh` exists because of this. See the header of that file for
what it does and does not reproduce.

## nginx

Homebrew `nginx` 1.31.5, used only by the staging script. It is never started
as a service: the script generates its own configuration under
`staging/.run/` and runs nginx against that, so the Homebrew default in
`/usr/local/etc/nginx/` is left alone.

## Other tools

| Tool | Version | Used by |
| --- | --- | --- |
| Go | 1.27.1 | backend. `go.mod` asks for 1.25 |
| golang-migrate | v4.15.2 | `make migrate-up` |
| gh | 2.100.0 | pull requests, CI status |

Go was upgraded from 1.26.4 to 1.27.1 as a side effect of installing Colima.
The first build afterwards rebuilds the standard library and takes noticeably
longer than usual; that is not a hang.

## What runs where

| | Frontend | API | Database |
| --- | --- | --- | --- |
| Development | `:5173` (Vite) | `:8080` | `wit` |
| Staging | `:8081` (nginx) | `:8090` | `wit_staging` |

Both tiers can run at once, and are meant to — the point of staging is
comparing it against development while both are in front of you.

```bash
# development
cd backend && go run ./cmd/api
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run dev

# staging
./staging/staging.sh up
```

## Verified on this setup

- `make migrate-up` — 9/9 migrations, on PostgreSQL 15
- `make seed-demo` — 12 users, 27 decks
- `go build ./...`, `go test ./...` — unit, docs, e2e and stress suites all pass
- `npm test`, `VITE_API_URL=/api npm run build`
- Sign-in through the browser at both `:5173` and `:8081`
- Through staging's nginx: `/api` proxied, deep links served by `try_files`,
  the pdf.js worker returned as `application/javascript`, and `admin1234`
  refused with 401 because the bootstrap admin is rotated there
