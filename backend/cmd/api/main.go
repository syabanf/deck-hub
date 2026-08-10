package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/wit/wit-backend/internal/config"
	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
	"github.com/wit/wit-backend/internal/domain"
	logmailer "github.com/wit/wit-backend/internal/mailer/log"
	smtpmailer "github.com/wit/wit-backend/internal/mailer/smtp"
	"github.com/wit/wit-backend/internal/repository/postgres"
	"github.com/wit/wit-backend/internal/storage/local"
	"github.com/wit/wit-backend/internal/usecase"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	// Root context cancelled on SIGINT/SIGTERM for graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// --- Infrastructure: database pool ---
	pool, err := postgres.NewPool(ctx, cfg.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()
	log.Printf("connected to postgres at %s:%s/%s", cfg.DBHost, cfg.DBPort, cfg.DBName)

	// --- Repositories (outer) ---
	userRepo := postgres.NewUserRepository(pool)
	deckRepo := postgres.NewDeckRepository(pool)
	favoriteRepo := postgres.NewFavoriteRepository(pool)
	progressRepo := postgres.NewProgressRepository(pool)

	// --- Usecases (depend only on domain interfaces) ---
	userUC := usecase.NewUserUsecase(userRepo)
	deckUC := usecase.NewDeckUsecase(deckRepo)
	favoriteUC := usecase.NewFavoriteUsecase(favoriteRepo)
	progressUC := usecase.NewProgressUsecase(progressRepo)

	// Take ownership of the seeded admin. Migration 000001 ships a published
	// password so a fresh checkout works; production must not keep it.
	if rotated, err := userUC.EnsureBootstrapAdmin(ctx, cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword); err != nil {
		log.Printf("warning: could not rotate the bootstrap admin password: %v", err)
	} else if rotated {
		log.Printf("bootstrap admin %s: password set from BOOTSTRAP_ADMIN_PASSWORD", cfg.BootstrapAdminEmail)
	}

	// Warn loudly rather than refusing to start: a deployment that cannot sign
	// in is worse than one that is told it is exposed.
	if userUC.UsesSeededPassword(ctx, cfg.BootstrapAdminEmail, "admin1234") {
		log.Printf("SECURITY WARNING: %s still accepts the password published in "+
			"migration 000001. Anyone who can read this repository is an admin. "+
			"Set BOOTSTRAP_ADMIN_PASSWORD and restart.", cfg.BootstrapAdminEmail)
	}

	// Pick the transport. Falling back to the log mailer keeps a fresh checkout
	// working without SMTP credentials, but says so — a production deployment
	// that lands here has a sign-up flow nobody can complete.
	var mailer domain.Mailer = logmailer.New()
	if cfg.SMTPHost != "" {
		mailer = smtpmailer.New(smtpmailer.Config{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUsername,
			Password: cfg.SMTPPassword,
			From:     cfg.SMTPFrom,
		})
		log.Printf("email: sending via %s:%s as %s", cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom)
	} else {
		log.Printf("email: SMTP_HOST not set — verification links go to this log, " +
			"not to recipients. Sign-up cannot be completed by a real user.")
	}

	// Self-service registration. The log mailer prints the verification link to
	// this terminal instead of sending mail, so the flow is exercisable without
	// SMTP credentials; swap in another domain.Mailer to send for real.
	verifyURL := strings.TrimRight(cfg.AppBaseURL, "/") + "/verify"
	registrationUC := usecase.NewRegistrationUsecase(
		userRepo,
		postgres.NewEmailVerificationRepository(pool),
		mailer,
		verifyURL,
	)
	log.Printf("registration open; verification links point at %s", verifyURL)

	// --- Infrastructure: file storage (local disk for now) ---
	fileStore, err := local.New(cfg.UploadDir, "/uploads")
	if err != nil {
		return err
	}
	log.Printf("uploads stored in %s (max %dMB)", fileStore.Dir(), cfg.MaxUploadMB)

	// --- Transport: token manager + handlers ---
	tokens := httpdelivery.NewTokenManager(cfg.JWTSecret, cfg.JWTTTL)
	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:        httpdelivery.NewAuthHandler(userUC, tokens),
		Register:    httpdelivery.NewRegistrationHandler(registrationUC, tokens),
		Users:       httpdelivery.NewUserHandler(userUC),
		Decks:       httpdelivery.NewDeckHandler(deckUC),
		Uploads:     httpdelivery.NewUploadHandler(fileStore, cfg.MaxUploadBytes()),
		Favorites:   httpdelivery.NewFavoriteHandler(favoriteUC),
		Progress:    httpdelivery.NewProgressHandler(progressUC),
		Docs:        httpdelivery.NewDocsHandler(),
		Tokens:      tokens,
		UploadDir:   fileStore.Dir(),
		CORSOrigins: cfg.CORSOrigins,
	})

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Run the server until the context is cancelled.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("HTTP server listening on %s", cfg.Addr())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		log.Println("shutdown signal received")
	}

	// Graceful shutdown with a bounded timeout.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Println("server stopped cleanly")
	return nil
}
