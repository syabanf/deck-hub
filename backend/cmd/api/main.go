package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/wit/wit-backend/internal/config"
	httpdelivery "github.com/wit/wit-backend/internal/delivery/http"
	"github.com/wit/wit-backend/internal/repository/postgres"
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

	// --- Usecases (depend only on domain interfaces) ---
	userUC := usecase.NewUserUsecase(userRepo)
	deckUC := usecase.NewDeckUsecase(deckRepo)

	// --- Transport: token manager + handlers ---
	tokens := httpdelivery.NewTokenManager(cfg.JWTSecret, cfg.JWTTTL)
	router := httpdelivery.NewRouter(httpdelivery.RouterDeps{
		Auth:   httpdelivery.NewAuthHandler(userUC, tokens),
		Users:  httpdelivery.NewUserHandler(userUC),
		Decks:  httpdelivery.NewDeckHandler(deckUC),
		Tokens: tokens,
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
