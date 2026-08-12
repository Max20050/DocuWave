package datasource

import (
	"context"
	"fmt"
	"net/url"

	"github.com/jackc/pgx/v5"
)

// postgresColumnsQuery lists every column of every user table, skipping the
// server's own catalogs. Ordering by ordinal_position keeps columns in their
// declared order.
const postgresColumnsQuery = `
	SELECT table_schema, table_name, column_name, data_type
	FROM information_schema.columns
	WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
	ORDER BY table_schema, table_name, ordinal_position`

type postgresConnector struct {
	cfg ConnectionConfig
}

func (c *postgresConnector) dsn() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=prefer",
		url.QueryEscape(c.cfg.Username), url.QueryEscape(c.cfg.Password),
		c.cfg.Host, c.cfg.Port, c.cfg.DBName,
	)
}

func (c *postgresConnector) TestConnection(ctx context.Context) error {
	conn, err := pgx.Connect(ctx, c.dsn())
	if err != nil {
		return err
	}
	defer conn.Close(ctx)

	return conn.Ping(ctx)
}

func (c *postgresConnector) Introspect(ctx context.Context) (Schema, error) {
	conn, err := pgx.Connect(ctx, c.dsn())
	if err != nil {
		return Schema{}, err
	}
	defer conn.Close(ctx)

	rows, err := conn.Query(ctx, postgresColumnsQuery)
	if err != nil {
		return Schema{}, err
	}
	defer rows.Close()

	columns := make([]columnRow, 0)
	for rows.Next() {
		var row columnRow
		if err := rows.Scan(&row.Schema, &row.Table, &row.Column, &row.Type); err != nil {
			return Schema{}, err
		}
		columns = append(columns, row)
	}
	if err := rows.Err(); err != nil {
		return Schema{}, err
	}

	return Schema{Tables: groupColumns(columns)}, nil
}
