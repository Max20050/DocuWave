package datasource

import (
	"context"
	"fmt"
	"net/url"

	"github.com/jackc/pgx/v5"
)

type postgresConnector struct {
	cfg ConnectionConfig
}

func (c *postgresConnector) TestConnection(ctx context.Context) error {
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=prefer",
		url.QueryEscape(c.cfg.Username), url.QueryEscape(c.cfg.Password),
		c.cfg.Host, c.cfg.Port, c.cfg.DBName,
	)

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)

	return conn.Ping(ctx)
}
