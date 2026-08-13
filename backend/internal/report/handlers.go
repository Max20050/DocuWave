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
	"github.com/Max20050/docuwave/internal/llm"
	"github.com/Max20050/docuwave/internal/template"
)

const (
	// generateTimeout is generous because it covers introspecting the source
	// and then waiting on the LLM.
	generateTimeout = 90 * time.Second
	// queryTimeout bounds a preview run against the user's own data source.
	queryTimeout = 30 * time.Second
)

// Handlers exposes HTTP handlers for generating queries from natural language,
// for the templates a report can be rendered through, and for managing the
// report configurations built from them.
type Handlers struct {
	store     *Store
	resolver  *datasource.Resolver
	generator *llm.Generator
	templates *template.Registry
}

func NewHandlers(
	store *Store,
	resolver *datasource.Resolver,
	generator *llm.Generator,
	templates *template.Registry,
) *Handlers {
	return &Handlers{store: store, resolver: resolver, generator: generator, templates: templates}
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

type reportResponse struct {
	ID             string          `json:"id"`
	DataSourceID   string          `json:"dataSourceId"`
	DataSourceName string          `json:"dataSourceName"`
	Name           string          `json:"name"`
	Prompt         string          `json:"prompt"`
	Query          string          `json:"query"`
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
		TemplateID:     rep.TemplateID,
		TemplateConfig: rep.TemplateConfig,
		CreatedAt:      rep.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      rep.UpdatedAt.Format(time.RFC3339),
	}
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

type previewTemplateRequest struct {
	DataSourceID   string          `json:"dataSourceId"`
	Query          string          `json:"query"`
	TemplateID     string          `json:"templateId"`
	TemplateConfig template.Config `json:"templateConfig"`
}

type previewTemplateResponse struct {
	HTML string `json:"html"`
}

// PreviewTemplate handles POST /api/reports/preview-template: it runs the query,
// renders the chosen template with the rows it returned, and hands back the
// document. The preview is the same rendering path the delivered report uses, so
// what the user approves is what they'll get.
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
	case req.Query == "":
		writeError(w, http.StatusBadRequest, "query is required")
		return
	case req.TemplateID == "":
		writeError(w, http.StatusBadRequest, "templateId is required")
		return
	}

	_, connector, err := h.resolver.Resolve(r.Context(), userID, req.DataSourceID)
	if err != nil {
		writeResolveError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	result, err := connector.RunQuery(ctx, req.Query, datasource.PreviewRowLimit)
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

type generateQueryRequest struct {
	DataSourceID string `json:"dataSourceId"`
	Prompt       string `json:"prompt"`
}

type generateQueryResponse struct {
	Query   string `json:"query"`
	Dialect string `json:"dialect"`
}

// GenerateQuery handles POST /api/reports/generate-query: it reads the data
// source's schema, hands it to the user's LLM along with their description,
// and returns the query for them to review before saving.
func (h *Handlers) GenerateQuery(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req generateQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DataSourceID == "" {
		writeError(w, http.StatusBadRequest, "dataSourceId is required")
		return
	}
	if req.Prompt == "" {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	_, connector, err := h.resolver.Resolve(r.Context(), userID, req.DataSourceID)
	if err != nil {
		writeResolveError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), generateTimeout)
	defer cancel()

	schema, err := connector.Introspect(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("could not read schema from data source: %v", err))
		return
	}

	dialect := connector.QueryLanguage()
	query, err := h.generator.GenerateQuery(ctx, userID, llm.QueryRequest{
		Dialect: dialect,
		Schema:  schema.Describe(),
		Prompt:  req.Prompt,
	})
	if err != nil {
		writeGenerateError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, generateQueryResponse{Query: query, Dialect: dialect})
}

// writeGenerateError separates "you haven't set this up" from "the provider
// said no", so the user knows whether to fix their settings or retry.
func writeGenerateError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, llm.ErrNotFound):
		writeError(w, http.StatusBadRequest, "no LLM provider configured — add one in settings first")
	case errors.Is(err, llm.ErrEmptyQuery):
		writeError(w, http.StatusBadGateway, "the LLM did not return a query; try rephrasing your description")
	case errors.Is(err, llm.ErrProviderFailed):
		writeError(w, http.StatusBadGateway, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "failed to generate query")
	}
}

type previewRequest struct {
	DataSourceID string `json:"dataSourceId"`
	Query        string `json:"query"`
}

// Preview handles POST /api/reports/preview: it runs the (possibly edited)
// query against the source read-only and returns the first rows, so the user
// can see what the report will contain before saving it.
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
	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}

	_, connector, err := h.resolver.Resolve(r.Context(), userID, req.DataSourceID)
	if err != nil {
		writeResolveError(w, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	result, err := connector.RunQuery(ctx, req.Query, datasource.PreviewRowLimit)
	if err != nil {
		// A rejected query is the user's to fix, not a server fault, so this
		// reports the source's own message back to them.
		writeError(w, http.StatusBadRequest, fmt.Sprintf("query failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, result)
}

type createReportRequest struct {
	Name           string          `json:"name"`
	DataSourceID   string          `json:"dataSourceId"`
	Prompt         string          `json:"prompt"`
	Query          string          `json:"query"`
	TemplateID     string          `json:"templateId"`
	TemplateConfig template.Config `json:"templateConfig"`
}

// Create handles POST /api/reports, storing the reviewed query alongside the
// rest of the report configuration.
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

	// Resolving proves the source exists and belongs to this user before the
	// insert would fail on a foreign key.
	if _, _, err := h.resolver.Resolve(r.Context(), userID, req.DataSourceID); err != nil {
		writeResolveError(w, err)
		return
	}

	created, err := h.store.Create(r.Context(), Report{
		UserID:         userID,
		DataSourceID:   req.DataSourceID,
		Name:           req.Name,
		Prompt:         req.Prompt,
		Query:          req.Query,
		TemplateID:     req.TemplateID,
		TemplateConfig: req.TemplateConfig,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save report")
		return
	}

	writeJSON(w, http.StatusCreated, toResponse(created))
}

func missingField(req createReportRequest) string {
	switch {
	case req.Name == "":
		return "name"
	case req.DataSourceID == "":
		return "dataSourceId"
	case req.Prompt == "":
		return "prompt"
	case req.Query == "":
		return "query"
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
