package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration, sourced from environment variables.
type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	HTTPPort  string
	JWTSecret string
	JWTTTL    time.Duration

	// UploadDir is where uploaded files are written (local storage backend).
	UploadDir string
	// MaxUploadMB caps the size of a single upload request.
	MaxUploadMB int
	// CORSOrigins lists the browser origins allowed to call the API.
	CORSOrigins []string
}

// MaxUploadBytes returns the upload cap in bytes.
func (c *Config) MaxUploadBytes() int64 { return int64(c.MaxUploadMB) << 20 }

// Load reads configuration from the environment. It first attempts to load a
// .env file (ignored if absent), then reads each variable, applying sensible
// defaults. It returns an error only for fatal misconfiguration.
func Load() (*Config, error) {
	// Best-effort .env load; absence is not an error.
	_ = godotenv.Load()

	cfg := &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "wit"),
		DBPassword: getEnv("DB_PASSWORD", "wit"),
		DBName:     getEnv("DB_NAME", "wit"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		HTTPPort:   getEnv("HTTP_PORT", "8080"),
		JWTSecret:  getEnv("JWT_SECRET", ""),
		UploadDir:  getEnv("UPLOAD_DIR", "./uploads"),
	}

	// Comma-separated browser origins. Defaults cover the Vite dev server and
	// the production-preview server; set explicitly when deploying the PWA.
	for _, o := range strings.Split(getEnv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, o)
		}
	}

	maxMBRaw := getEnv("MAX_UPLOAD_MB", "25")
	maxMB, err := strconv.Atoi(maxMBRaw)
	if err != nil || maxMB <= 0 {
		return nil, fmt.Errorf("invalid MAX_UPLOAD_MB %q: must be a positive integer", maxMBRaw)
	}
	cfg.MaxUploadMB = maxMB

	ttlRaw := getEnv("JWT_TTL", "24h")
	ttl, err := time.ParseDuration(ttlRaw)
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_TTL %q: %w", ttlRaw, err)
	}
	cfg.JWTTTL = ttl

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET must be set")
	}

	return cfg, nil
}

// DSN builds a PostgreSQL connection string suitable for pgxpool.
func (c *Config) DSN() string {
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.DBUser, c.DBPassword),
		Host:   fmt.Sprintf("%s:%s", c.DBHost, c.DBPort),
		Path:   c.DBName,
	}
	q := u.Query()
	q.Set("sslmode", c.DBSSLMode)
	u.RawQuery = q.Encode()
	return u.String()
}

// Addr returns the HTTP listen address (":PORT").
func (c *Config) Addr() string {
	return ":" + c.HTTPPort
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
