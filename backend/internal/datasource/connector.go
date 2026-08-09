// Package datasource manages user-configured SQL data sources: storing their
// (encrypted) connection details and verifying they're reachable.
package datasource

import (
	"context"
	"fmt"
)

// ConnectionConfig holds the details needed to reach a SQL data source.
type ConnectionConfig struct {
	Host     string
	Port     int
	DBName   string
	Username string
	Password string
}

// Connector verifies that a data source is reachable. Each supported source
// type implements this behind NewConnector, so adding a new type never
// requires changing store/handler logic.
type Connector interface {
	TestConnection(ctx context.Context) error
}

type connectorFactory func(cfg ConnectionConfig) Connector

var connectorRegistry = map[string]connectorFactory{
	"postgres": func(cfg ConnectionConfig) Connector { return &postgresConnector{cfg: cfg} },
	"mysql":    func(cfg ConnectionConfig) Connector { return &mysqlConnector{cfg: cfg} },
}

// SupportedTypes lists the data source type identifiers accepted by NewConnector.
var SupportedTypes = []string{"postgres", "mysql"}

// NewConnector builds a Connector for the given source type.
func NewConnector(sourceType string, cfg ConnectionConfig) (Connector, error) {
	factory, ok := connectorRegistry[sourceType]
	if !ok {
		return nil, fmt.Errorf("unsupported data source type: %s", sourceType)
	}
	return factory(cfg), nil
}
