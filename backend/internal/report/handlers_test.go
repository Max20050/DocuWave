package report

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Max20050/docuwave/internal/auth"
	"github.com/Max20050/docuwave/internal/datasource"
	"github.com/Max20050/docuwave/internal/llm"
	"github.com/Max20050/docuwave/internal/template"
)

func TestHandlersRequireAuthentication(t *testing.T) {
	handlers := NewHandlers(nil, nil, nil, nil)

	cases := map[string]struct {
		handler http.HandlerFunc
		request *http.Request
	}{
		"generate query":   {handlers.GenerateQuery, httptest.NewRequest(http.MethodPost, "/api/reports/generate-query", nil)},
		"preview":          {handlers.Preview, httptest.NewRequest(http.MethodPost, "/api/reports/preview", nil)},
		"list templates":   {handlers.ListTemplates, httptest.NewRequest(http.MethodGet, "/api/report-templates", nil)},
		"preview template": {handlers.PreviewTemplate, httptest.NewRequest(http.MethodPost, "/api/reports/preview-template", nil)},
		"create":           {handlers.Create, httptest.NewRequest(http.MethodPost, "/api/reports", nil)},
		"list":             {handlers.List, httptest.NewRequest(http.MethodGet, "/api/reports", nil)},
		"delete":           {handlers.Delete, httptest.NewRequest(http.MethodDelete, "/api/reports/r-1", nil)},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			tc.handler(recorder, tc.request)

			if recorder.Code != http.StatusUnauthorized {
				t.Errorf("got status %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestMissingField(t *testing.T) {
	complete := createReportRequest{
		Name:         "Monthly sales",
		DataSourceID: "ds-1",
		Prompt:       "sales by region",
		Query:        "SELECT 1",
		TemplateID:   "tabular",
	}
	if got := missingField(complete); got != "" {
		t.Errorf("got %q for a complete request, want no missing field", got)
	}

	tests := map[string]createReportRequest{
		"name":         {DataSourceID: "ds-1", Prompt: "p", Query: "q", TemplateID: "tabular"},
		"dataSourceId": {Name: "n", Prompt: "p", Query: "q", TemplateID: "tabular"},
		"prompt":       {Name: "n", DataSourceID: "ds-1", Query: "q", TemplateID: "tabular"},
		"query":        {Name: "n", DataSourceID: "ds-1", Prompt: "p", TemplateID: "tabular"},
		"templateId":   {Name: "n", DataSourceID: "ds-1", Prompt: "p", Query: "q"},
	}
	for want, req := range tests {
		t.Run(want, func(t *testing.T) {
			if got := missingField(req); got != want {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

// The user needs to know whether to fix their settings, retry, or rewrite
// their description, so each generation failure gets its own status.
func TestWriteGenerateError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantBody   string
	}{
		{
			name:       "no provider configured",
			err:        llm.ErrNotFound,
			wantStatus: http.StatusBadRequest,
			wantBody:   "settings",
		},
		{
			name:       "provider rejected the call",
			err:        fmt.Errorf("%w: rate limited", llm.ErrProviderFailed),
			wantStatus: http.StatusBadGateway,
			wantBody:   "rate limited",
		},
		{
			name:       "provider answered with nothing usable",
			err:        llm.ErrEmptyQuery,
			wantStatus: http.StatusBadGateway,
			wantBody:   "rephrasing",
		},
		{
			name:       "anything else is a server fault",
			err:        errors.New("boom"),
			wantStatus: http.StatusInternalServerError,
			wantBody:   "failed to generate query",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			writeGenerateError(recorder, tt.err)

			if recorder.Code != tt.wantStatus {
				t.Errorf("got status %d, want %d", recorder.Code, tt.wantStatus)
			}
			if !strings.Contains(recorder.Body.String(), tt.wantBody) {
				t.Errorf("body %q does not mention %q", recorder.Body.String(), tt.wantBody)
			}
		})
	}
}

func TestWriteResolveError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
	}{
		{"missing data source", datasource.ErrNotFound, http.StatusNotFound},
		{"missing sheets connection", datasource.ErrConnectionNotFound, http.StatusNotFound},
		{"anything else", errors.New("boom"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			writeResolveError(recorder, tt.err)

			if recorder.Code != tt.wantStatus {
				t.Errorf("got status %d, want %d", recorder.Code, tt.wantStatus)
			}
		})
	}
}

func TestWriteTemplateError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
	}{
		{"template that isn't registered", template.ErrUnknownTemplate, http.StatusBadRequest},
		{"mapping the template can't use", template.ErrInvalidConfig, http.StatusBadRequest},
		{"anything else is a server fault", errors.New("boom"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			writeTemplateError(recorder, tt.err)

			if recorder.Code != tt.wantStatus {
				t.Errorf("got status %d, want %d", recorder.Code, tt.wantStatus)
			}
		})
	}
}

// The UI builds its template picker and its field mapping controls from this
// response, so it has to carry every slot.
func TestListTemplates(t *testing.T) {
	handlers := NewHandlers(nil, nil, nil, template.NewRegistry(template.Starters()...))

	recorder := httptest.NewRecorder()
	handlers.ListTemplates(recorder, authenticatedRequest(t, http.MethodGet, "/api/report-templates", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("got status %d, want %d", recorder.Code, http.StatusOK)
	}

	var metas []template.Meta
	if err := json.NewDecoder(recorder.Body).Decode(&metas); err != nil {
		t.Fatalf("decode returned error: %v", err)
	}
	if len(metas) != len(template.Starters()) {
		t.Fatalf("got %d templates, want %d", len(metas), len(template.Starters()))
	}
	for _, meta := range metas {
		if meta.ID == "" || meta.Name == "" || len(meta.Slots) == 0 {
			t.Errorf("template %+v is not usable by the UI", meta)
		}
	}
}

// The request is checked before the query runs, so a half-filled preview never
// reaches the user's data source.
func TestPreviewTemplateRejectsIncompleteRequests(t *testing.T) {
	handlers := NewHandlers(nil, nil, nil, template.NewRegistry(template.Starters()...))

	tests := map[string]previewTemplateRequest{
		"dataSourceId": {Query: "SELECT 1", TemplateID: "tabular"},
		"query":        {DataSourceID: "ds-1", TemplateID: "tabular"},
		"templateId":   {DataSourceID: "ds-1", Query: "SELECT 1"},
	}

	for field, req := range tests {
		t.Run(field, func(t *testing.T) {
			body, err := json.Marshal(req)
			if err != nil {
				t.Fatalf("marshal returned error: %v", err)
			}

			recorder := httptest.NewRecorder()
			handlers.PreviewTemplate(recorder,
				authenticatedRequest(t, http.MethodPost, "/api/reports/preview-template", bytes.NewReader(body)))

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want %d", recorder.Code, http.StatusBadRequest)
			}
			if !strings.Contains(recorder.Body.String(), field) {
				t.Errorf("body %q does not name the missing field %q", recorder.Body.String(), field)
			}
		})
	}
}

func TestReportResponseJSONShape(t *testing.T) {
	created := time.Date(2026, 8, 12, 9, 30, 0, 0, time.UTC)
	body, err := json.Marshal(toResponse(Report{
		ID:             "r-1",
		DataSourceID:   "ds-1",
		DataSourceName: "Warehouse",
		Name:           "Monthly sales",
		Prompt:         "sum of sales by region",
		Query:          "SELECT region, sum(total) FROM sales GROUP BY region",
		TemplateID:     "grouped-totals",
		TemplateConfig: template.Config{
			Columns: map[string][]string{"group": {"region"}},
			Text:    map[string]string{"title": "Monthly sales"},
		},
		CreatedAt: created,
		UpdatedAt: created,
	}))
	if err != nil {
		t.Fatalf("marshal returned error: %v", err)
	}

	want := `{"id":"r-1","dataSourceId":"ds-1","dataSourceName":"Warehouse","name":"Monthly sales",` +
		`"prompt":"sum of sales by region","query":"SELECT region, sum(total) FROM sales GROUP BY region",` +
		`"templateId":"grouped-totals",` +
		`"templateConfig":{"columns":{"group":["region"]},"text":{"title":"Monthly sales"}},` +
		`"createdAt":"2026-08-12T09:30:00Z","updatedAt":"2026-08-12T09:30:00Z"}`
	if string(body) != want {
		t.Errorf("got %s, want %s", body, want)
	}
}

// authenticatedRequest builds a request carrying a valid session, which is how
// the handlers get a user ID out of the context.
func authenticatedRequest(t *testing.T, method, target string, body io.Reader) *http.Request {
	t.Helper()

	issuer := auth.NewTokenIssuer("test-secret")
	token, err := issuer.IssueToken("u-1")
	if err != nil {
		t.Fatalf("IssueToken returned error: %v", err)
	}

	request := httptest.NewRequest(method, target, body)
	request.Header.Set("Authorization", "Bearer "+token)

	// RequireAuth owns the context key the handlers read, so the way to a request
	// carrying a user ID is through the middleware itself.
	var authenticated *http.Request
	auth.NewHandlers(nil, issuer).RequireAuth(func(_ http.ResponseWriter, r *http.Request) {
		authenticated = r
	})(httptest.NewRecorder(), request)
	if authenticated == nil {
		t.Fatal("RequireAuth rejected a valid session")
	}
	return authenticated
}
