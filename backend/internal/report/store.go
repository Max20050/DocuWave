// Package report manages saved report configurations: the data source a
// report reads, the natural language description the user wrote, the query
// generated from it, and the template its output is rendered through.
package report

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Max20050/docuwave/internal/template"
)

// ErrNotFound is returned when a report doesn't exist or isn't owned by the requesting user.
var ErrNotFound = errors.New("report not found")

// Report is a row from the reports table.
type Report struct {
	ID             string
	UserID         string
	DataSourceID   string
	DataSourceName string
	Name           string
	Prompt         string
	Query          string
	// TemplateID names the template the report renders through, and
	// TemplateConfig is that template's slot mapping.
	TemplateID     string
	TemplateConfig template.Config
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Store persists and retrieves report configurations from PostgreSQL.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// selectReports reads reports with their data source's name, which is what the
// UI lists them by. The join is inner because the foreign key cascades on
// delete, so a report always has its source.
const selectReports = `
	SELECT r.id, r.user_id, r.data_source_id, d.name, r.name, r.prompt, r.query,
	       r.template_id, r.template_config, r.created_at, r.updated_at
	FROM reports r
	JOIN data_sources d ON d.id = r.data_source_id`

func scanReport(row pgx.Row) (Report, error) {
	var rep Report
	// The slot mapping is JSONB, so it comes back as raw JSON to decode here
	// rather than as a scannable column type.
	var config []byte
	err := row.Scan(&rep.ID, &rep.UserID, &rep.DataSourceID, &rep.DataSourceName,
		&rep.Name, &rep.Prompt, &rep.Query, &rep.TemplateID, &config,
		&rep.CreatedAt, &rep.UpdatedAt)
	if err != nil {
		return Report{}, err
	}
	if len(config) > 0 {
		if err := json.Unmarshal(config, &rep.TemplateConfig); err != nil {
			return Report{}, fmt.Errorf("decode template config: %w", err)
		}
	}
	return rep, nil
}

// Create inserts a new report configuration, returning the saved row.
func (s *Store) Create(ctx context.Context, rep Report) (Report, error) {
	config, err := json.Marshal(rep.TemplateConfig)
	if err != nil {
		return Report{}, fmt.Errorf("encode template config: %w", err)
	}

	var id string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO reports (user_id, data_source_id, name, prompt, query, template_id, template_config)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		rep.UserID, rep.DataSourceID, rep.Name, rep.Prompt, rep.Query, rep.TemplateID, config,
	).Scan(&id)
	if err != nil {
		return Report{}, err
	}
	return s.Get(ctx, rep.UserID, id)
}

// Get returns a report owned by the given user. It returns ErrNotFound if no row matched.
func (s *Store) Get(ctx context.Context, userID, id string) (Report, error) {
	rep, err := scanReport(s.pool.QueryRow(ctx,
		selectReports+` WHERE r.id = $1 AND r.user_id = $2`, id, userID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Report{}, ErrNotFound
		}
		return Report{}, err
	}
	return rep, nil
}

// List returns all reports owned by the given user, most recently created first.
func (s *Store) List(ctx context.Context, userID string) ([]Report, error) {
	rows, err := s.pool.Query(ctx,
		selectReports+` WHERE r.user_id = $1 ORDER BY r.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reports := make([]Report, 0)
	for rows.Next() {
		rep, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		reports = append(reports, rep)
	}
	return reports, rows.Err()
}

// Delete removes a report owned by the given user. It returns ErrNotFound if no row matched.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM reports WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
