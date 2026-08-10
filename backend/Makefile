# WIT backend Makefile
#
# Most targets read DB_* / HTTP_* / JWT_* from the environment or a local .env
# file. The migrate-* targets shell out to the golang-migrate CLI:
#   https://github.com/golang-migrate/migrate

# Load .env if present so DB_* vars are available to migrate-* targets.
ifneq (,$(wildcard ./.env))
include .env
export
endif

# Defaults (overridable via environment or .env).
DB_HOST     ?= localhost
DB_PORT     ?= 5432
DB_USER     ?= wit
DB_PASSWORD ?= wit
DB_NAME     ?= wit
DB_SSLMODE  ?= disable

# DSN used by the golang-migrate CLI and psql.
DB_DSN := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=$(DB_SSLMODE)

# Separate database for the e2e suite — it is wiped on every run.
E2E_DB_NAME ?= $(DB_NAME)_test
E2E_DSN     := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(E2E_DB_NAME)?sslmode=$(DB_SSLMODE)

# psql may be keg-only (Homebrew libpq). Override if it isn't on PATH, e.g.:
#   make seed-dummy PSQL=/opt/homebrew/opt/libpq/bin/psql
PSQL ?= psql

BINARY := bin/api

.PHONY: help run build tidy test test-e2e stress docs seed-demo vet hash migrate-up migrate-down migrate-force seed-dummy unseed-dummy docker-up docker-down

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Run the API server.
	go run ./cmd/api

build: ## Build the API binary into bin/.
	@mkdir -p bin
	go build -o $(BINARY) ./cmd/api

tidy: ## Tidy go.mod/go.sum.
	go mod tidy

test: ## Run unit tests (e2e suite skips itself without E2E_DATABASE_URL).
	go test ./...

test-e2e: ## Run end-to-end tests against a real DB. WIPES $(E2E_DB_NAME).
	E2E_DATABASE_URL="$(E2E_DSN)" go test ./test/e2e/... -count=1 -v

docs: ## Check docs/openapi.yaml still matches the mounted routes. No DB needed.
	go test ./test/docs/... -count=1

stress: ## Load-test the API (throughput + latency percentiles). WIPES $(E2E_DB_NAME).
	STRESS_DATABASE_URL="$(E2E_DSN)" \
	STRESS_CONCURRENCY=$(or $(CONCURRENCY),50) \
	STRESS_DURATION=$(or $(DURATION),3s) \
	STRESS_DECKS=$(or $(DECKS),300) \
	  go test ./test/stress/... -run TestStress -count=1 -v -timeout 10m

vet: ## Run go vet.
	go vet ./...

hash: ## Print a bcrypt hash. Usage: make hash PASS=admin1234
	@test -n "$(PASS)" || (echo "usage: make hash PASS=<plaintext>" && exit 1)
	@go run ./cmd/hashpw "$(PASS)"

migrate-up: ## Apply all up migrations (requires golang-migrate CLI).
	migrate -path migrations -database "$(DB_DSN)" up

migrate-down: ## Roll back the last migration (requires golang-migrate CLI).
	migrate -path migrations -database "$(DB_DSN)" down 1

migrate-force: ## Force the schema_migrations version. Usage: make migrate-force V=1
	migrate -path migrations -database "$(DB_DSN)" force $(V)

seed-demo: ## Re-insert the demo accounts (editor/viewer/lead-*). LOCAL DEVELOPMENT ONLY.
	@echo "Seeding demo accounts into $(DB_NAME) — never run this against production."
	$(PSQL) "$(DB_DSN)" -f migrations/000003_seed_demo_accounts.up.sql
	$(PSQL) "$(DB_DSN)" -f migrations/000006_seed_team_accounts.up.sql
	@# Those migrations predate 000007, so they leave email_verified_at NULL and
	@# every seeded account is refused at login as unverified. Nobody can click a
	@# link for an address that does not exist, so mark them proven here.
	$(PSQL) "$(DB_DSN)" -c "UPDATE users SET email_verified_at = now() \
	  WHERE email_verified_at IS NULL \
	    AND lower(email) IN ('editor@wit.id','viewer@wit.id','lead-admin@wit.id','lead-editor@wit.id','lead-viewer@wit.id');"
	@echo "Demo accounts ready — see README for the passwords."

seed-dummy: ## Seed reversible dummy/test data (decks tagged 'sample', users @example.test).
	$(PSQL) "$(DB_DSN)" -f scripts/seed_dummy.sql

unseed-dummy: ## Remove the dummy/test data seeded by seed-dummy.
	$(PSQL) "$(DB_DSN)" -f scripts/unseed_dummy.sql

docker-up: ## Start postgres (and adminer) via docker-compose.
	docker compose up -d

docker-down: ## Stop docker-compose services (keeps the volume).
	docker compose down
