package report

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/Max20050/docuwave/internal/datasource"
	"github.com/Max20050/docuwave/internal/query"
	"github.com/Max20050/docuwave/internal/render"
	"github.com/Max20050/docuwave/internal/template"
)

// queryTimeout bounds a query run against the user's own data source.
const queryTimeout = 30 * time.Second

// ErrNotRunnable is returned for a report saved before query building replaced
// LLM-written SQL. Its query text is kept for the user to read, but nothing
// runs a stored query as text, so the report has to be rebuilt.
var ErrNotRunnable = errors.New("this report predates query building and has to be rebuilt")

// ErrQueryFailed means the data source didn't answer the report's query. The
// query is this server's own, so the source's message is the useful one and is
// wrapped in.
var ErrQueryFailed = errors.New("the data source could not answer this report's query")

// Runner is the report pipeline, end to end: compile the stored specification
// against the data source's schema, run it, project the template's document,
// and render the files the report is configured for.
//
// Every path that produces a report goes through here — the preview while a
// report is being built, the download in the app, and the scheduled and
// on-demand deliveries that come next — so what a user approves in the preview
// is what lands in their inbox.
type Runner struct {
	resolver  *datasource.Resolver
	schemas   *datasource.SchemaProvider
	templates *template.Registry
}

func NewRunner(
	resolver *datasource.Resolver,
	schemas *datasource.SchemaProvider,
	templates *template.Registry,
) *Runner {
	return &Runner{resolver: resolver, schemas: schemas, templates: templates}
}

// runnable is a compiled query with everything needed to run it.
type runnable struct {
	connector datasource.Connector
	compiled  query.Compiled
	// language names the query language, for labelling the SQL in the UI.
	language string
}

// prepare resolves a data source, loads the schema read when it was connected,
// and compiles the specification against it. Every query in this package is
// built here and nowhere else.
func (r *Runner) prepare(
	ctx context.Context,
	userID, dataSourceID string,
	spec query.Spec,
) (runnable, error) {
	source, connector, err := r.resolver.Resolve(ctx, userID, dataSourceID)
	if err != nil {
		return runnable{}, err
	}

	dialect, err := query.DialectFor(source.Type)
	if err != nil {
		return runnable{}, err
	}

	schema, _, err := r.schemas.Schema(ctx, userID, dataSourceID)
	if err != nil {
		return runnable{}, err
	}

	compiled, err := query.Compile(spec, schema, dialect, time.Now())
	if err != nil {
		return runnable{}, err
	}

	return runnable{connector: connector, compiled: compiled, language: connector.QueryLanguage()}, nil
}

// run executes a prepared query.
func (r runnable) run(ctx context.Context, limit int) (datasource.QueryResult, error) {
	return r.connector.RunQuery(ctx, r.compiled.Text, r.compiled.Args, limit)
}

// runLimit is how many rows a report run reads. The compiled query carries the
// specification's limit already; this is the connector's own cap, set to the
// same number so a source that ignores a limit still can't stream more than the
// report asked for.
func runLimit(spec query.Spec) int {
	if spec.Limit > 0 {
		return spec.Limit
	}
	return query.DefaultRowLimit
}

// Document runs a report's query and projects the document its template prints.
// It's the half of the pipeline every output format shares.
func (r *Runner) Document(ctx context.Context, rep Report) (template.Doc, error) {
	if rep.QuerySpec.IsZero() {
		return template.Doc{}, ErrNotRunnable
	}

	prepared, err := r.prepare(ctx, rep.UserID, rep.DataSourceID, rep.QuerySpec)
	if err != nil {
		log.Printf("report %s: preparing its query failed: %v", rep.ID, err)
		return template.Doc{}, err
	}

	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	result, err := prepared.run(queryCtx, runLimit(rep.QuerySpec))
	if err != nil {
		// A report is rendered long after it was configured, unattended, so a
		// failure here is logged as well as returned: the schedule that hit it
		// won't be watching.
		log.Printf("report %s: query failed: %v", rep.ID, err)
		return template.Doc{}, fmt.Errorf("%w: %v", ErrQueryFailed, err)
	}

	doc, err := r.templates.Document(rep.TemplateID, template.Data{
		Columns:     result.Columns,
		Rows:        result.Rows,
		GeneratedAt: time.Now(),
	}, rep.TemplateConfig)
	if err != nil {
		log.Printf("report %s: template %s failed: %v", rep.ID, rep.TemplateID, err)
		return template.Doc{}, err
	}
	return doc, nil
}

// Render produces every file a report is configured for, in memory, ready for
// the delivery layer to attach.
func (r *Runner) Render(ctx context.Context, rep Report) ([]render.Artifact, error) {
	doc, err := r.Document(ctx, rep)
	if err != nil {
		return nil, err
	}

	artifacts, err := render.RenderAll(doc, rep.Formats, rep.Name)
	if err != nil {
		log.Printf("report %s: rendering failed: %v", rep.ID, err)
		return nil, err
	}
	return artifacts, nil
}

// RenderFormat produces one of the report's files. The format has to be one the
// report is configured for: the configuration is what a client agreed to
// receive, and it's also what the preview and the schedule act on.
func (r *Runner) RenderFormat(
	ctx context.Context,
	rep Report,
	format render.Format,
) (render.Artifact, error) {
	if !render.Includes(rep.Formats, format) {
		return render.Artifact{}, fmt.Errorf("%w: this report is not configured for %s, only %v",
			render.ErrUnknownFormat, format, render.Strings(rep.Formats))
	}

	doc, err := r.Document(ctx, rep)
	if err != nil {
		return render.Artifact{}, err
	}

	artifact, err := render.Render(doc, format, rep.Name)
	if err != nil {
		log.Printf("report %s: rendering %s failed: %v", rep.ID, format, err)
		return render.Artifact{}, err
	}
	return artifact, nil
}
