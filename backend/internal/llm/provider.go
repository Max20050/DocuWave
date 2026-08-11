// Package llm manages user-configured LLM providers: storing their
// (encrypted) API keys and generating queries against the selected provider.
package llm

import (
	"context"
	"fmt"
)

// Provider generates a query from a data source schema and a natural language prompt.
// Each supported LLM provider implements this behind NewProvider, so adding a new
// provider never requires changing store/handler logic.
type Provider interface {
	GenerateQuery(ctx context.Context, schema string, prompt string) (string, error)
}

type providerFactory func(apiKey string) Provider

var providerRegistry = map[string]providerFactory{
	"claude": func(apiKey string) Provider { return &claudeProvider{apiKey: apiKey} },
	"openai": func(apiKey string) Provider { return &openAIProvider{apiKey: apiKey} },
}

// SupportedProviders lists the provider identifiers accepted by NewProvider.
var SupportedProviders = []string{"claude", "openai"}

// NewProvider builds a Provider for the given provider type.
func NewProvider(providerType string, apiKey string) (Provider, error) {
	factory, ok := providerRegistry[providerType]
	if !ok {
		return nil, fmt.Errorf("unsupported LLM provider: %s", providerType)
	}
	return factory(apiKey), nil
}
