package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/Max20050/docuwave/internal/auth"
	"github.com/Max20050/docuwave/internal/datasource"
	"github.com/Max20050/docuwave/internal/llm"
	"github.com/Max20050/docuwave/internal/migrate"
)

func main() {
	_ = godotenv.Load("../../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	encryptionKey := os.Getenv("DATASOURCE_ENCRYPTION_KEY")
	if encryptionKey == "" {
		log.Fatal("DATASOURCE_ENCRYPTION_KEY is required")
	}

	llmEncryptionKey := os.Getenv("LLM_ENCRYPTION_KEY")
	if llmEncryptionKey == "" {
		log.Fatal("LLM_ENCRYPTION_KEY is required")
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("database ping failed: %v", err)
	}
	log.Println("database connection established")

	if err := migrate.Run(context.Background(), pool); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("migrations applied")

	store := auth.NewStore(pool)
	tokenIssuer := auth.NewTokenIssuer(jwtSecret)
	authHandlers := auth.NewHandlers(store, tokenIssuer)

	googleConfig := auth.NewGoogleConfig(
		os.Getenv("GOOGLE_CLIENT_ID"),
		os.Getenv("GOOGLE_CLIENT_SECRET"),
		os.Getenv("GOOGLE_REDIRECT_URL"),
	)
	googleHandlers := auth.NewGoogleHandlers(store, tokenIssuer, googleConfig, frontendURL)

	encryptor, err := datasource.NewEncryptor(encryptionKey)
	if err != nil {
		log.Fatalf("invalid DATASOURCE_ENCRYPTION_KEY: %v", err)
	}
	dsStore := datasource.NewStore(pool)
	dsHandlers := datasource.NewHandlers(dsStore, encryptor)

	sheetsConfig := datasource.NewGoogleSheetsConfig(
		os.Getenv("GOOGLE_CLIENT_ID"),
		os.Getenv("GOOGLE_CLIENT_SECRET"),
		os.Getenv("GOOGLE_SHEETS_REDIRECT_URL"),
	)
	sheetsStore := datasource.NewSheetsStore(pool)
	sheetsHandlers := datasource.NewSheetsHandlers(dsStore, sheetsStore, encryptor, sheetsConfig, tokenIssuer, frontendURL)
	schemaHandlers := datasource.NewSchemaHandlers(dsStore, sheetsStore, encryptor, sheetsConfig)

	llmEncryptor, err := llm.NewEncryptor(llmEncryptionKey)
	if err != nil {
		log.Fatalf("invalid LLM_ENCRYPTION_KEY: %v", err)
	}
	llmStore := llm.NewStore(pool)
	llmHandlers := llm.NewHandlers(llmStore, llmEncryptor)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{"status": "ok"}); err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("POST /api/auth/register", authHandlers.Register)
	mux.HandleFunc("POST /api/auth/login", authHandlers.Login)
	mux.HandleFunc("GET /api/me", authHandlers.RequireAuth(authHandlers.Me))
	mux.HandleFunc("GET /api/auth/google/login", googleHandlers.Login)
	mux.HandleFunc("GET /api/auth/google/callback", googleHandlers.Callback)
	mux.HandleFunc("GET /api/datasources", authHandlers.RequireAuth(dsHandlers.List))
	mux.HandleFunc("POST /api/datasources", authHandlers.RequireAuth(dsHandlers.Create))
	mux.HandleFunc("POST /api/datasources/test", authHandlers.RequireAuth(dsHandlers.TestConnection))
	mux.HandleFunc("DELETE /api/datasources/{id}", authHandlers.RequireAuth(dsHandlers.Delete))
	mux.HandleFunc("GET /api/datasources/{id}/schema", authHandlers.RequireAuth(schemaHandlers.Get))
	mux.HandleFunc("GET /api/datasources/google-sheets/login", sheetsHandlers.Login)
	mux.HandleFunc("GET /api/datasources/google-sheets/callback", sheetsHandlers.Callback)
	mux.HandleFunc("GET /api/datasources/google-sheets/connections/{id}/spreadsheets", authHandlers.RequireAuth(sheetsHandlers.ListSpreadsheets))
	mux.HandleFunc("POST /api/datasources/google-sheets", authHandlers.RequireAuth(sheetsHandlers.Create))
	mux.HandleFunc("GET /api/llm-config", authHandlers.RequireAuth(llmHandlers.Get))
	mux.HandleFunc("PUT /api/llm-config", authHandlers.RequireAuth(llmHandlers.Save))
	mux.HandleFunc("DELETE /api/llm-config", authHandlers.RequireAuth(llmHandlers.Delete))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("FRONTEND_URL")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:3000"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
