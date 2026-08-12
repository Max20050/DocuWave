package datasource

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

// mysqlColumnsQuery lists every column of the connected database. column_type
// is preferred over data_type because it carries the full declaration
// (varchar(255), decimal(10,2)), which is more useful downstream.
const mysqlColumnsQuery = `
	SELECT table_name, column_name, column_type
	FROM information_schema.columns
	WHERE table_schema = ?
	ORDER BY table_name, ordinal_position`

type mysqlConnector struct {
	cfg ConnectionConfig
}

func (c *mysqlConnector) open() (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?timeout=5s",
		c.cfg.Username, c.cfg.Password, c.cfg.Host, c.cfg.Port, c.cfg.DBName,
	)
	return sql.Open("mysql", dsn)
}

func (c *mysqlConnector) TestConnection(ctx context.Context) error {
	db, err := c.open()
	if err != nil {
		return err
	}
	defer db.Close()

	return db.PingContext(ctx)
}

func (c *mysqlConnector) Introspect(ctx context.Context) (Schema, error) {
	db, err := c.open()
	if err != nil {
		return Schema{}, err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx, mysqlColumnsQuery, c.cfg.DBName)
	if err != nil {
		return Schema{}, err
	}
	defer rows.Close()

	columns := make([]columnRow, 0)
	for rows.Next() {
		var row columnRow
		if err := rows.Scan(&row.Table, &row.Column, &row.Type); err != nil {
			return Schema{}, err
		}
		columns = append(columns, row)
	}
	if err := rows.Err(); err != nil {
		return Schema{}, err
	}

	return Schema{Tables: groupColumns(columns)}, nil
}
