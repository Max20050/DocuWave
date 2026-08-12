package datasource

import (
	"context"
	"errors"
)

// Resolver rebuilds a live Connector for an already-saved data source. It
// needs both the SQL and Google Sheets dependencies because a stored source
// may be either kind, and it's shared by everything that has to reach a saved
// source — schema introspection and query execution alike.
type Resolver struct {
	store        *Store
	connections  *SheetsStore
	encryptor    *Encryptor
	sheetsConfig *GoogleSheetsConfig
}

func NewResolver(store *Store, connections *SheetsStore, encryptor *Encryptor, sheetsConfig *GoogleSheetsConfig) *Resolver {
	return &Resolver{
		store:        store,
		connections:  connections,
		encryptor:    encryptor,
		sheetsConfig: sheetsConfig,
	}
}

// Resolve loads a data source owned by the user and returns it alongside a
// Connector for it. It returns ErrNotFound when the user owns no such source.
func (r *Resolver) Resolve(ctx context.Context, userID, dataSourceID string) (DataSource, Connector, error) {
	ds, encryptedPassword, err := r.store.Get(ctx, userID, dataSourceID)
	if err != nil {
		return DataSource{}, nil, err
	}

	connector, err := r.connectorFor(ctx, userID, ds, encryptedPassword)
	if err != nil {
		return DataSource{}, nil, err
	}
	return ds, connector, nil
}

// connectorFor builds a Connector for a loaded data source, decrypting
// whichever credential that source type uses.
func (r *Resolver) connectorFor(ctx context.Context, userID string, ds DataSource, encryptedPassword []byte) (Connector, error) {
	if ds.Type == sheetsSourceType {
		if ds.GoogleConnectionID == nil {
			return nil, errors.New("google sheets data source has no connection")
		}
		token, err := sheetsToken(ctx, r.connections, r.encryptor, userID, *ds.GoogleConnectionID)
		if err != nil {
			return nil, err
		}
		return &googleSheetsConnector{
			oauthConfig:   r.sheetsConfig.oauth,
			token:         token,
			spreadsheetID: deref(ds.SpreadsheetID),
		}, nil
	}

	password, err := r.encryptor.Decrypt(encryptedPassword)
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
