package datasource

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Max20050/docuwave/internal/auth"
)

// introspectTimeout is more generous than testConnectionTimeout: reading a
// catalog does real work, unlike a ping.
const introspectTimeout = 15 * time.Second

// SchemaHandlers exposes the stored structure of saved data sources, which is
// what the report builder offers as tables, columns and filterable fields.
type SchemaHandlers struct {
	schemas *SchemaProvider
}

func NewSchemaHandlers(schemas *SchemaProvider) *SchemaHandlers {
	return &SchemaHandlers{schemas: schemas}
}

type schemaResponse struct {
	DataSourceID string `json:"dataSourceId"`
	// FetchedAt tells the user how old the picture they're building against is.
	FetchedAt string `json:"fetchedAt"`
	Schema
}

func deref[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}

// Get handles GET /api/datasources/{id}/schema, returning the structure read
// when the source was connected — or reading it now if that hasn't happened yet.
func (h *SchemaHandlers) Get(w http.ResponseWriter, r *http.Request) {
	h.respond(w, r, func(userID, id string) (Schema, time.Time, error) {
		return h.schemas.Schema(r.Context(), userID, id)
	})
}

// Refresh handles POST /api/datasources/{id}/schema/refresh, re-reading the
// source. Users add tables and columns; a report can only be built out of what
// the stored schema knows about.
func (h *SchemaHandlers) Refresh(w http.ResponseWriter, r *http.Request) {
	h.respond(w, r, func(userID, id string) (Schema, time.Time, error) {
		return h.schemas.Refresh(r.Context(), userID, id)
	})
}

func (h *SchemaHandlers) respond(
	w http.ResponseWriter,
	r *http.Request,
	load func(userID, id string) (Schema, time.Time, error),
) {
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

	schema, fetchedAt, err := load(userID, id)
	if err != nil {
		writeSchemaError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, schemaResponse{
		DataSourceID: id,
		FetchedAt:    fetchedAt.UTC().Format(time.RFC3339),
		Schema:       schema,
	})
}

// writeSchemaError maps a schema failure onto an HTTP response.
func writeSchemaError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrIntrospectFailed) {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("%v", err))
		return
	}
	writeResolveError(w, err)
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
