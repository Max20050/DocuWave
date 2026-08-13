package template

// Tabular prints the query's rows as a table of the columns the user picked, in
// the order they picked them. It is the template that assumes the least about
// the data: any query output can be shown this way.
type Tabular struct{}

func (Tabular) Meta() Meta {
	return Meta{
		ID:          "tabular",
		Name:        "Tabular summary",
		Description: "Every row of your query as a clean table. Choose which columns appear and in what order.",
		Slots: []Slot{
			{
				Key:         "title",
				Label:       "Title",
				Kind:        SlotText,
				Description: "Printed at the top of the report.",
			},
			{
				Key:         "columns",
				Label:       "Table columns",
				Kind:        SlotColumns,
				Description: "The columns to print, in order. Numeric columns are right-aligned automatically.",
				Required:    true,
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

type tabularView struct {
	page
	Columns []column
	Rows    [][]cell
}

var tabularBody = mustDocument(`
{{if .Columns}}
<section>
<table>
<thead><tr>{{range .Columns}}<th class="{{.Class}}">{{.Name}}</th>{{end}}</tr></thead>
<tbody>{{range .Rows}}<tr>{{range .}}<td class="{{.Class}}">{{.Text}}</td>{{end}}</tr>{{end}}</tbody>
</table>
{{if not .Rows}}<p class="empty">The query returned no rows.</p>{{end}}
</section>
{{else}}<p class="empty">No columns are mapped to this template yet.</p>{{end}}
`)

func (t Tabular) Render(data Data, cfg Config) ([]byte, error) {
	columns := data.resolve(cfg.ColumnsFor("columns"))

	rows := make([][]cell, 0, len(data.Rows))
	for _, row := range data.Rows {
		rows = append(rows, rowCells(row, columns))
	}

	return renderDocument(tabularBody, tabularView{
		page: page{
			Title:  cfg.TextFor("title"),
			Footer: footerText(data, cfg.TextFor("note")),
		},
		Columns: columns,
		Rows:    rows,
	})
}
