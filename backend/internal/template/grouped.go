package template

import (
	"strconv"
)

// GroupedTotals collapses the query's rows into one line per distinct value of
// the grouping column, totalling the chosen measures within each group and
// again across the whole report. Groups print in the order they first appear in
// the query output, so a query's own ORDER BY still decides the arrangement.
type GroupedTotals struct{}

func (GroupedTotals) Meta() Meta {
	return Meta{
		ID:          "grouped-totals",
		Name:        "Grouped summary with totals",
		Description: "One row per group with the measures you pick totalled per group and overall.",
		Slots: []Slot{
			{
				Key:         "title",
				Label:       "Title",
				Kind:        SlotText,
				Description: "Printed at the top of the report.",
			},
			{
				Key:         "group",
				Label:       "Group rows by",
				Kind:        SlotColumn,
				Description: "The column whose distinct values become the report's rows.",
				Required:    true,
			},
			{
				Key:         "metrics",
				Label:       "Columns to total",
				Kind:        SlotColumns,
				Description: "Numeric columns summed within each group and across the report.",
				Required:    true,
				Numeric:     true,
			},
			{
				Key:         "note",
				Label:       "Footer note",
				Kind:        SlotText,
				Description: "Optional line printed under the table, next to the row count.",
			},
		},
	}
}

type groupedView struct {
	page
	GroupLabel string
	Metrics    []column
	Groups     []groupedRow
	Totals     []cell
	TotalRows  string
}

type groupedRow struct {
	Label  string
	Rows   string
	Totals []cell
}

var groupedBody = mustDocument(`
{{if and .GroupLabel .Metrics}}
<section>
<table>
<thead><tr>
<th>{{.GroupLabel}}</th>
<th class="num">Rows</th>
{{range .Metrics}}<th class="num">{{.Name}}</th>{{end}}
</tr></thead>
<tbody>{{range .Groups}}<tr>
<td>{{.Label}}</td>
<td class="num">{{.Rows}}</td>
{{range .Totals}}<td class="{{.Class}}">{{.Text}}</td>{{end}}
</tr>{{end}}</tbody>
{{if .Groups}}<tfoot><tr>
<td>Total</td>
<td class="num">{{.TotalRows}}</td>
{{range .Totals}}<td class="{{.Class}}">{{.Text}}</td>{{end}}
</tr></tfoot>{{end}}
</table>
{{if not .Groups}}<p class="empty">The query returned no rows.</p>{{end}}
</section>
{{else}}<p class="empty">Map a grouping column and at least one column to total.</p>{{end}}
`)

func (t GroupedTotals) Render(data Data, cfg Config) ([]byte, error) {
	view := groupedView{
		page:      page{Title: cfg.TextFor("title")},
		TotalRows: groupThousands(strconv.Itoa(len(data.Rows))),
	}

	groupColumns := data.resolve([]string{cfg.ColumnFor("group")})
	metrics := data.resolve(cfg.ColumnsFor("metrics"))
	if len(groupColumns) == 0 || len(metrics) == 0 {
		view.Footer = footerText(data, cfg.TextFor("note"))
		return renderDocument(groupedBody, view)
	}

	group := groupColumns[0]
	view.GroupLabel = group.Name
	view.Metrics = metrics
	view.Subtitle = "Grouped by " + group.Name
	view.Footer = footerText(data, cfg.TextFor("note"))

	// Rows are bucketed by their printed group value, keeping first-appearance
	// order: the query decided the arrangement, and this shouldn't re-sort it.
	order := make([]string, 0)
	buckets := make(map[string][][]any)
	for _, row := range data.Rows {
		label := formatValue(valueAt(row, group.Index))
		if _, seen := buckets[label]; !seen {
			order = append(order, label)
		}
		buckets[label] = append(buckets[label], row)
	}

	for _, label := range order {
		rows := buckets[label]
		totals := make([]cell, 0, len(metrics))
		for _, metric := range metrics {
			totals = append(totals, numericCell(sum(rows, metric.Index)))
		}
		view.Groups = append(view.Groups, groupedRow{
			Label:  label,
			Rows:   groupThousands(strconv.Itoa(len(rows))),
			Totals: totals,
		})
	}

	for _, metric := range metrics {
		view.Totals = append(view.Totals, numericCell(sum(data.Rows, metric.Index)))
	}

	return renderDocument(groupedBody, view)
}
