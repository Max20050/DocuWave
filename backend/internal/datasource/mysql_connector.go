package datasource

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

type mysqlConnector struct {
	cfg ConnectionConfig
}

func (c *mysqlConnector) TestConnection(ctx context.Context) error {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?timeout=5s",
		c.cfg.Username, c.cfg.Password, c.cfg.Host, c.cfg.Port, c.cfg.DBName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	return db.PingContext(ctx)
}
