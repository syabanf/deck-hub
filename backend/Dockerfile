# syntax=docker/dockerfile:1.7

FROM migrate/migrate:v4.18.3 AS migrate

FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.21 AS runtime
RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app

WORKDIR /app
COPY --from=build --chown=app:app /out/api ./api
COPY --from=migrate /usr/local/bin/migrate /usr/local/bin/migrate
COPY --chown=app:app migrations ./migrations

ENV HTTP_PORT=8080 \
    UPLOAD_DIR=/app/uploads
EXPOSE 8080
VOLUME ["/app/uploads"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

USER app
ENTRYPOINT ["/app/api"]
