package report

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Max20050/docuwave/internal/query"
	"github.com/Max20050/docuwave/internal/render"
)

// A report saved before query building has query text but no specification, and
// nothing runs stored text — so it fails before it reaches the data source.
func TestDocumentRejectsALegacyReport(t *testing.T) {
	runner := NewRunner(nil, nil, nil)

	_, err := runner.Document(context.Background(), Report{
		ID:    "r-legacy",
		Query: "SELECT * FROM sales",
	})
	if !errors.Is(err, ErrNotRunnable) {
		t.Fatalf("got %v, want ErrNotRunnable", err)
	}
}

// The formats a report is configured for are what its client agreed to receive,
// so a request for another one is refused before the query runs.
func TestRenderFormatRejectsAnUnconfiguredFormat(t *testing.T) {
	runner := NewRunner(nil, nil, nil)
	rep := Report{
		ID:        "r-1",
		Name:      "Monthly sales",
		QuerySpec: query.Spec{Table: "sales", Fields: []query.Field{{Column: "region"}}},
		Formats:   []render.Format{render.FormatPDF},
	}

	_, err := runner.RenderFormat(context.Background(), rep, render.FormatCSV)
	if !errors.Is(err, render.ErrUnknownFormat) {
		t.Fatalf("got %v, want ErrUnknownFormat", err)
	}
	// The message has to say what the report does offer, because the fix is to
	// ask for one of those or to reconfigure the report.
	if err == nil || !strings.Contains(err.Error(), "pdf") {
		t.Errorf("got %v, want an error naming the formats the report is configured for", err)
	}
}

// The compiled query carries the specification's limit; the connector is capped
// at the same number so a source that ignores a limit can't stream more than
// the report asked for.
func TestRunLimit(t *testing.T) {
	tests := map[string]struct {
		spec query.Spec
		want int
	}{
		"a report with its own limit":  {query.Spec{Limit: 250}, 250},
		"a report that didn't set one": {query.Spec{}, query.DefaultRowLimit},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			if got := runLimit(tt.spec); got != tt.want {
				t.Errorf("got %d, want %d", got, tt.want)
			}
		})
	}
}
