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

# psql may be keg-only (Homebrew libpq). Override if it isn't on PATH, e.g.:
#   make seed-dummy PSQL=/opt/homebrew/opt/libpq/bin/psql
PSQL ?= psql

BINARY := bin/api

.PHONY: help run build tidy test vet hash migrate-up migrate-down migrate-force seed-dummy unseed-dummy docker-up docker-down

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Run the API server.
	go run ./cmd/api

build: ## Build the API binary into bin/.
	@mkdir -p bin
	go build -o $(BINARY) ./cmd/api

tidy: ## Tidy go.mod/go.sum.
	go mod tidy

test: ## Run all tests.
	go test ./...

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

seed-dummy: ## Seed reversible dummy/test data (decks tagged 'sample', users @example.test).
	$(PSQL) "$(DB_DSN)" -f scripts/seed_dummy.sql

unseed-dummy: ## Remove the dummy/test data seeded by seed-dummy.
	$(PSQL) "$(DB_DSN)" -f scripts/unseed_dummy.sql

docker-up: ## Start postgres (and adminer) via docker-compose.
	docker compose up -d

docker-down: ## Stop docker-compose services (keeps the volume).
	docker compose down
