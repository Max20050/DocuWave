package llm

import (
	"context"
	"errors"
	"fmt"
)

// ErrProviderFailed wraps anything the provider's API rejected — a bad key, a
// rate limit, an outage — so callers can tell it apart from a local failure.
var ErrProviderFailed = errors.New("LLM provider request failed")

// ErrEmptyQuery is returned when the provider answered, but with nothing that
// looks like a query.
var ErrEmptyQuery = errors.New("the LLM returned an empty query")

// QueryRequest describes the query to generate: the dialect the data source
// speaks, its schema as text, and what the user asked for in their own words.
type QueryRequest struct {
	Dialect string
	Schema  string
	Prompt  string
}

// Generator turns a natural language request into a runnable query using the
// calling user's own configured provider and API key.
type Generator struct {
	store     *Store
	encryptor *Encryptor
}

func NewGenerator(store *Store, encryptor *Encryptor) *Generator {
	return &Generator{store: store, encryptor: encryptor}
}

// GenerateQuery returns a query for the given request. It returns ErrNotFound
// when the user has configured no provider, and ErrProviderFailed when the
// provider's API rejected the call.
func (g *Generator) GenerateQuery(ctx context.Context, userID string, req QueryRequest) (string, error) {
	cfg, encryptedAPIKey, err := g.store.GetWithKey(ctx, userID)
	if err != nil {
		return "", err
	}

	apiKey, err := g.encryptor.Decrypt(encryptedAPIKey)
	if err != nil {
		return "", fmt.Errorf("decrypt API key: %w", err)
	}

	provider, err := NewProvider(cfg.Provider, apiKey)
	if err != nil {
		return "", err
	}

	raw, err := provider.GenerateQuery(ctx, req.Schema, buildQueryPrompt(req.Dialect, req.Prompt))
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrProviderFailed, err)
	}

	query := sanitizeQuery(raw)
	if query == "" {
		return "", ErrEmptyQuery
	}
	return query, nil
}
