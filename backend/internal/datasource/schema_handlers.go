package datasource

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Max20050/docuwave/internal/auth"
)

// introspectTimeout is more generous than testConnectionTimeout: reading a
// catalog does real work, unlike a ping.
const introspectTimeout = 15 * time.Second

// SchemaHandlers exposes schema introspection for saved data sources.
type SchemaHandlers struct {
	resolver *Resolver
}

func NewSchemaHandlers(resolver *Resolver) *SchemaHandlers {
	return &SchemaHandlers{resolver: resolver}
}

type schemaResponse struct {
	DataSourceID string `json:"dataSourceId"`
	Type         string `json:"type"`
	Schema
}

func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}

// Get handles GET /api/datasources/{id}/schema, inspecting the live source and
// returning its structure: tables and columns for SQL, header fields for Sheets.
func (h *SchemaHandlers) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	ds, connector, err := h.resolver.Resolve(r.Context(), userID, id)
	if err != nil {
		writeResolveError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), introspectTimeout)
	defer cancel()

	schema, err := connector.Introspect(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("could not read schema from data source: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, schemaResponse{DataSourceID: ds.ID, Type: ds.Type, Schema: schema})
}

// writeResolveError maps a Resolver failure onto an HTTP response.
func writeResolveError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "data source not found")
	case errors.Is(err, ErrConnectionNotFound):
		writeError(w, http.StatusNotFound, "google sheets connection not found")
	default:
		writeError(w, http.StatusInternalServerError, "failed to prepare data source connection")
	}
}
