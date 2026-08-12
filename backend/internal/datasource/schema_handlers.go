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

// SchemaHandlers exposes schema introspection for saved data sources. It needs
// both the SQL and Google Sheets dependencies because a stored source may be
// either kind.
type SchemaHandlers struct {
	store        *Store
	connections  *SheetsStore
	encryptor    *Encryptor
	sheetsConfig *GoogleSheetsConfig
}

func NewSchemaHandlers(store *Store, connections *SheetsStore, encryptor *Encryptor, sheetsConfig *GoogleSheetsConfig) *SchemaHandlers {
	return &SchemaHandlers{
		store:        store,
		connections:  connections,
		encryptor:    encryptor,
		sheetsConfig: sheetsConfig,
	}
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

	ds, encryptedPassword, err := h.store.Get(r.Context(), userID, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, http.StatusNotFound, "data source not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load data source")
		return
	}

	connector, err := h.connectorFor(r.Context(), userID, ds, encryptedPassword)
	if err != nil {
		if errors.Is(err, ErrConnectionNotFound) {
			writeConnectionError(w, err)
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to prepare data source connection")
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

// connectorFor rebuilds a Connector for an already-saved data source,
// decrypting whichever credential that source type uses.
func (h *SchemaHandlers) connectorFor(ctx context.Context, userID string, ds DataSource, encryptedPassword []byte) (Connector, error) {
	if ds.Type == sheetsSourceType {
		if ds.GoogleConnectionID == nil {
			return nil, errors.New("google sheets data source has no connection")
		}
		token, err := sheetsToken(ctx, h.connections, h.encryptor, userID, *ds.GoogleConnectionID)
		if err != nil {
			return nil, err
		}
		return &googleSheetsConnector{
			oauthConfig:   h.sheetsConfig.oauth,
			token:         token,
			spreadsheetID: deref(ds.SpreadsheetID),
		}, nil
	}

	password, err := h.encryptor.Decrypt(encryptedPassword)
	if err != nil {
		return nil, err
	}
	return NewConnector(ds.Type, ConnectionConfig{
		Host:     deref(ds.Host),
		Port:     deref(ds.Port),
		DBName:   deref(ds.DBName),
		Username: deref(ds.Username),
		Password: password,
	})
}
