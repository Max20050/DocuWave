package report

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Max20050/docuwave/internal/datasource"
	"github.com/Max20050/docuwave/internal/llm"
)

func TestHandlersRequireAuthentication(t *testing.T) {
	handlers := NewHandlers(nil, nil, nil)

	cases := map[string]struct {
		handler http.HandlerFunc
		request *http.Request
	}{
		"generate query": {handlers.GenerateQuery, httptest.NewRequest(http.MethodPost, "/api/reports/generate-query", nil)},
		"preview":        {handlers.Preview, httptest.NewRequest(http.MethodPost, "/api/reports/preview", nil)},
		"create":         {handlers.Create, httptest.NewRequest(http.MethodPost, "/api/reports", nil)},
		"list":           {handlers.List, httptest.NewRequest(http.MethodGet, "/api/reports", nil)},
		"delete":         {handlers.Delete, httptest.NewRequest(http.MethodDelete, "/api/reports/r-1", nil)},
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
	complete := createReportRequest{Name: "Monthly sales", DataSourceID: "ds-1", Prompt: "sales by region", Query: "SELECT 1"}
	if got := missingField(complete); got != "" {
		t.Errorf("got %q for a complete request, want no missing field", got)
	}

	tests := map[string]createReportRequest{
		"name":         {DataSourceID: "ds-1", Prompt: "p", Query: "q"},
		"dataSourceId": {Name: "n", Prompt: "p", Query: "q"},
		"prompt":       {Name: "n", DataSourceID: "ds-1", Query: "q"},
		"query":        {Name: "n", DataSourceID: "ds-1", Prompt: "p"},
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

func TestReportResponseJSONShape(t *testing.T) {
	created := time.Date(2026, 8, 12, 9, 30, 0, 0, time.UTC)
	body, err := json.Marshal(toResponse(Report{
		ID:             "r-1",
		DataSourceID:   "ds-1",
		DataSourceName: "Warehouse",
		Name:           "Monthly sales",
		Prompt:         "sum of sales by region",
		Query:          "SELECT region, sum(total) FROM sales GROUP BY region",
		CreatedAt:      created,
		UpdatedAt:      created,
	}))
	if err != nil {
		t.Fatalf("marshal returned error: %v", err)
	}

	want := `{"id":"r-1","dataSourceId":"ds-1","dataSourceName":"Warehouse","name":"Monthly sales",` +
		`"prompt":"sum of sales by region","query":"SELECT region, sum(total) FROM sales GROUP BY region",` +
		`"createdAt":"2026-08-12T09:30:00Z","updatedAt":"2026-08-12T09:30:00Z"}`
	if string(body) != want {
		t.Errorf("got %s, want %s", body, want)
	}
}
