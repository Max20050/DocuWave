package template

// KPISummary leads with the headline numbers — each chosen measure totalled
// across the whole query — and optionally prints a supporting table underneath.
// It's the template for a report whose point is a handful of figures rather
// than the rows behind them.
type KPISummary struct{}

func (KPISummary) Meta() Meta {
	return Meta{
		ID:          "kpi-summary",
		Name:        "KPI summary",
		Description: "Headline totals as tiles, with an optional supporting table beneath them.",
		Slots: []Slot{
			{
				Key:         "title",
				Label:       "Title",
				Kind:        SlotText,
				Description: "Printed at the top of the report.",
			},
			{
				Key:         "metrics",
				Label:       "Headline metrics",
				Kind:        SlotColumns,
				Description: "Each column becomes a tile showing its total across every row.",
				Required:    true,
				Numeric:     true,
			},
			{
				Key:         "columns",
				Label:       "Supporting table columns",
				Kind:        SlotColumns,
				Description: "Optional. Columns printed as a table under the tiles.",
			},
			{
				Key:         "note",
				Label:       "Footer note",
				Kind:        SlotText,
				Description: "Optional line printed under the report, next to the row count.",
			},
		},
	}
}

type kpiView struct {
	page
	Tiles   []tile
	Columns []column
	Rows    [][]cell
}

// tile is one headline figure. Its label sits in secondary ink above the value,
// which keeps the number the loudest thing on the page.
type tile struct {
	Label string
	Value string
}

var kpiBody = mustDocument(`
{{if .Tiles}}
<section>
<div class="tiles">{{range .Tiles}}
<div class="tile"><p class="tile-label">{{.Label}}</p><p class="tile-value">{{.Value}}</p></div>{{end}}
</div>
</section>
{{else}}<p class="empty">Map at least one column to a headline metric.</p>{{end}}
{{if .Columns}}
<section>
<h2 class="section-title">Breakdown</h2>
<table>
<thead><tr>{{range .Columns}}<th class="{{.Class}}">{{.Name}}</th>{{end}}</tr></thead>
<tbody>{{range .Rows}}<tr>{{range .}}<td class="{{.Class}}">{{.Text}}</td>{{end}}</tr>{{end}}</tbody>
</table>
{{if not .Rows}}<p class="empty">The query returned no rows.</p>{{end}}
</section>
{{end}}
`)

func (t KPISummary) Render(data Data, cfg Config) ([]byte, error) {
	metrics := data.resolve(cfg.ColumnsFor("metrics"))
	tiles := make([]tile, 0, len(metrics))
	for _, metric := range metrics {
		tiles = append(tiles, tile{Label: metric.Name, Value: formatNumber(sum(data.Rows, metric.Index))})
	}

	columns := data.resolve(cfg.ColumnsFor("columns"))
	rows := make([][]cell, 0, len(data.Rows))
	for _, row := range data.Rows {
		rows = append(rows, rowCells(row, columns))
	}

	return renderDocument(kpiBody, kpiView{
		page: page{
			Title:  cfg.TextFor("title"),
			Footer: footerText(data, cfg.TextFor("note")),
		},
		Tiles:   tiles,
		Columns: columns,
		Rows:    rows,
	})
}
