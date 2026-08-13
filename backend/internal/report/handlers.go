package report

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Max20050/docuwave/internal/auth"
	"github.com/Max20050/docuwave/internal/datasource"
	"github.com/Max20050/docuwave/internal/query"
	"github.com/Max20050/docuwave/internal/template"
)

// queryTimeout bounds a query run against the user's own data source.
const queryTimeout = 30 * time.Second

// Handlers exposes HTTP handlers for the templates a report renders through and
// for managing report configurations.
//
// A report's query is never accepted as text. It arrives as a specification,
// which is compiled here against the data source's stored schema — so the only
// SQL that runs is SQL this server assembled.
type Handlers struct {
	store     *Store
	resolver  *datasource.Resolver
	schemas   *datasource.SchemaProvider
	templates *template.Registry
}

func NewHandlers(
	store *Store,
	resolver *datasource.Resolver,
	schemas *datasource.SchemaProvider,
	templates *template.Registry,
) *Handlers {
	return &Handlers{store: store, resolver: resolver, schemas: schemas, templates: templates}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// writeResolveError maps a data source lookup failure onto an HTTP response.
func writeResolveError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, datasource.ErrNotFound):
		writeError(w, http.StatusNotFound, "data source not found")
	case errors.Is(err, datasource.ErrConnectionNotFound):
		writeError(w, http.StatusNotFound, "google sheets connection not found")
	default:
		writeError(w, http.StatusInternalServerError, "failed to prepare data source connection")
	}
}

// writeQueryError maps a failure to build a query onto an HTTP response. A spec
// the schema doesn't support is the user's to fix and says so specifically,
// because the fix is usually to pick a different column or refresh the schema.
func writeQueryError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, query.ErrInvalidSpec), errors.Is(err, query.ErrUnsupportedSource):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, datasource.ErrIntrospectFailed):
		writeError(w, http.StatusBadGateway, err.Error())
	default:
		writeResolveError(w, err)
	}
}

// writeTemplateError maps a template failure onto an HTTP response. A missing
// template or an unusable mapping is the caller's to fix; a render fault is ours.
func writeTemplateError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, template.ErrUnknownTemplate), errors.Is(err, template.ErrInvalidConfig):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "failed to render the template")
	}
}

type reportResponse struct {
	ID             string          `json:"id"`
	DataSourceID   string          `json:"dataSourceId"`
	DataSourceName string          `json:"dataSourceName"`
	Name           string          `json:"name"`
	Prompt         string          `json:"prompt"`
	// Query is the SQL this server compiled from QuerySpec, shown to the user so
	// they can see exactly what their report reads. It is never accepted back.
	Query          string          `json:"query"`
	QuerySpec      query.Spec      `json:"querySpec"`
	TemplateID     string          `json:"templateId"`
	TemplateConfig template.Config `json:"templateConfig"`
	CreatedAt      string          `json:"createdAt"`
	UpdatedAt      string          `json:"updatedAt"`
}

func toResponse(rep Report) reportResponse {
	return reportResponse{
		ID:             rep.ID,
		DataSourceID:   rep.DataSourceID,
		DataSourceName: rep.DataSourceName,
		Name:           rep.Name,
		Prompt:         rep.Prompt,
		Query:          rep.Query,
		QuerySpec:      rep.QuerySpec,
		TemplateID:     rep.TemplateID,
		TemplateConfig: rep.TemplateConfig,
		CreatedAt:      rep.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      rep.UpdatedAt.Format(time.RFC3339),
	}
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
func (h *Handlers) prepare(
	ctx context.Context,
	userID, dataSourceID string,
	spec query.Spec,
) (runnable, error) {
	source, connector, err := h.resolver.Resolve(ctx, userID, dataSourceID)
	if err != nil {
		return runnable{}, err
	}

	dialect, err := query.DialectFor(source.Type)
	if err != nil {
		return runnable{}, err
	}

	schema, _, err := h.schemas.Schema(ctx, userID, dataSourceID)
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

// ListTemplates handles GET /api/report-templates: the templates a report can be
// rendered through, each with the slots the user maps their query output onto.
func (h *Handlers) ListTemplates(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	writeJSON(w, http.StatusOK, h.templates.List())
}

type previewRequest struct {
	DataSourceID string     `json:"dataSourceId"`
	QuerySpec    query.Spec `json:"querySpec"`
}

type previewResponse struct {
	datasource.QueryResult
	// SQL is what the specification compiled to, so the user can see what their
	// report actually reads.
	SQL      string `json:"sql"`
	Language string `json:"language"`
}

// previewLimit keeps a preview to a page of rows without ever showing more than
// the report itself would cover.
func previewLimit(spec query.Spec) int {
	if spec.Limit > 0 && spec.Limit < datasource.PreviewRowLimit {
		return spec.Limit
	}
	return datasource.PreviewRowLimit
}

// Preview handles POST /api/reports/preview: it compiles the specification,
// runs it read-only, and returns the first rows along with the SQL it built, so
// the user can see what the report will contain before saving it.
func (h *Handlers) Preview(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req previewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DataSourceID == "" {
		writeError(w, http.StatusBadRequest, "dataSourceId is required")
		return
	}

	prepared, err := h.prepare(r.Context(), userID, req.DataSourceID, req.QuerySpec)
	if err != nil {
		writeQueryError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	result, err := prepared.run(ctx, previewLimit(req.QuerySpec))
	if err != nil {
		// The query is ours, so a failure here is the source rejecting it —
		// usually an aggregate over a column that doesn't hold numbers. Its own
		// message is the useful one.
		writeError(w, http.StatusBadRequest, fmt.Sprintf("query failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, previewResponse{
		QueryResult: result,
		SQL:         prepared.compiled.Text,
		Language:    prepared.language,
	})
}

type previewTemplateRequest struct {
	DataSourceID   string          `json:"dataSourceId"`
	QuerySpec      query.Spec      `json:"querySpec"`
	TemplateID     string          `json:"templateId"`
	TemplateConfig template.Config `json:"templateConfig"`
}

type previewTemplateResponse struct {
	HTML string `json:"html"`
}

// PreviewTemplate handles POST /api/reports/preview-template: it runs the
// compiled query, renders the chosen template with the rows it returned, and
// hands back the document. The preview is the same rendering path the delivered
// report uses, so what the user approves is what they'll get.
func (h *Handlers) PreviewTemplate(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req previewTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch {
	case req.DataSourceID == "":
		writeError(w, http.StatusBadRequest, "dataSourceId is required")
		return
	case req.TemplateID == "":
		writeError(w, http.StatusBadRequest, "templateId is required")
		return
	}

	prepared, err := h.prepare(r.Context(), userID, req.DataSourceID, req.QuerySpec)
	if err != nil {
		writeQueryError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	result, err := prepared.run(ctx, previewLimit(req.QuerySpec))
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("query failed: %v", err))
		return
	}

	html, err := h.templates.Render(req.TemplateID, template.Data{
		Columns:     result.Columns,
		Rows:        result.Rows,
		GeneratedAt: time.Now(),
	}, req.TemplateConfig)
	if err != nil {
		writeTemplateError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, previewTemplateResponse{HTML: string(html)})
}

type createReportRequest struct {
	Name         string `json:"name"`
	DataSourceID string `json:"dataSourceId"`
	// Prompt is the user's own description of the report. It no longer builds the
	// query; it records intent, and is what a future summary of the report's
	// data would be written against.
	Prompt         string          `json:"prompt"`
	QuerySpec      query.Spec      `json:"querySpec"`
	TemplateID     string          `json:"templateId"`
	TemplateConfig template.Config `json:"templateConfig"`
}

// Create handles POST /api/reports, storing the query specification alongside
// the rest of the report configuration.
func (h *Handlers) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req createReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if field := missingField(req); field != "" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("%s is required", field))
		return
	}

	// The mapping is checked against the template's slots, but not against the
	// query's columns: that would mean running the query to save a report.
	// Rendering re-checks it against the rows it actually gets.
	if err := h.templates.ValidateConfig(req.TemplateID, req.TemplateConfig); err != nil {
		writeTemplateError(w, err)
		return
	}

	// Compiling proves the specification is one this source can answer, and
	// resolving the source along the way proves it belongs to this user. The SQL
	// is stored for the user to read; it's recompiled from the spec on every run,
	// so a relative date window stays relative.
	prepared, err := h.prepare(r.Context(), userID, req.DataSourceID, req.QuerySpec)
	if err != nil {
		writeQueryError(w, err)
		return
	}

	created, err := h.store.Create(r.Context(), Report{
		UserID:         userID,
		DataSourceID:   req.DataSourceID,
		Name:           req.Name,
		Prompt:         req.Prompt,
		Query:          prepared.compiled.Text,
		QuerySpec:      req.QuerySpec,
		TemplateID:     req.TemplateID,
		TemplateConfig: req.TemplateConfig,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save report")
		return
	}

	writeJSON(w, http.StatusCreated, toResponse(created))
}

// missingField names the first required field a request left empty. The query
// specification isn't checked here — compiling it against the schema reports far
// more usefully than "querySpec is required" could.
func missingField(req createReportRequest) string {
	switch {
	case req.Name == "":
		return "name"
	case req.DataSourceID == "":
		return "dataSourceId"
	case req.TemplateID == "":
		return "templateId"
	default:
		return ""
	}
}

// List handles GET /api/reports.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	reports, err := h.store.List(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list reports")
		return
	}

	resp := make([]reportResponse, 0, len(reports))
	for _, rep := range reports {
		resp = append(resp, toResponse(rep))
	}
	writeJSON(w, http.StatusOK, resp)
}

// Delete handles DELETE /api/reports/{id}.
func (h *Handlers) Delete(w http.ResponseWriter, r *http.Request) {
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

	if err := h.store.Delete(r.Context(), userID, id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, http.StatusNotFound, "report not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete report")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
