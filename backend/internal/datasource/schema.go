package datasource

import "strings"

// Schema describes the structure of a data source. SQL sources fill Tables;
// Google Sheets sources fill Fields with the header row of the sheet; REST API
// sources fill both Fields and FieldTypes, the latter with a simple inferred
// type (string/number/boolean/array/object) per field. Query generation reads
// this to know what it's allowed to ask for.
type Schema struct {
	Tables     []Table           `json:"tables,omitempty"`
	Fields     []string          `json:"fields,omitempty"`
	FieldTypes map[string]string `json:"fieldTypes,omitempty"`
}

// Table is a single table (or view) exposed by a SQL data source.
type Table struct {
	Name    string   `json:"name"`
	Columns []Column `json:"columns"`
	// ForeignKeys are this table's own declared foreign keys, read for the
	// report builder to suggest joins with. A Spec's Joins are never derived
	// from these automatically — only whatever the user picks reaches a query.
	ForeignKeys []ForeignKey `json:"foreignKeys,omitempty"`
}

// Column is a single column of a Table, with the source's own type name.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// ForeignKey is one column of a Table that the source's own constraints say
// references a column of another table.
type ForeignKey struct {
	Column           string `json:"column"`
	ReferencedTable  string `json:"referencedTable"`
	ReferencedColumn string `json:"referencedColumn"`
}

// columnRow is one row of a SQL introspection query, before columns are
// grouped under their table.
type columnRow struct {
	Schema string
	Table  string
	Column string
	Type   string
}

// foreignKeyRow is one row of a SQL foreign-key introspection query, before
// rows are matched against the table Introspect already built for them.
type foreignKeyRow struct {
	Schema           string
	Table            string
	Column           string
	ReferencedSchema string
	ReferencedTable  string
	ReferencedColumn string
}

// qualifiedTableName prefixes the schema unless it's absent (MySQL, where the
// connection already names a single database) or the default "public".
func qualifiedTableName(schema, table string) string {
	if schema == "" || schema == "public" {
		return table
	}
	return schema + "." + table
}

// groupColumns folds introspection rows into tables, preserving the order the
// rows arrived in so callers control both table and column ordering.
func groupColumns(rows []columnRow) []Table {
	tables := make([]Table, 0)
	indexByName := make(map[string]int)

	for _, row := range rows {
		name := qualifiedTableName(row.Schema, row.Table)
		idx, ok := indexByName[name]
		if !ok {
			idx = len(tables)
			indexByName[name] = idx
			tables = append(tables, Table{Name: name, Columns: make([]Column, 0)})
		}
		tables[idx].Columns = append(tables[idx].Columns, Column{Name: row.Column, Type: row.Type})
	}

	return tables
}

// attachForeignKeys folds foreign-key rows onto the tables groupColumns
// already built, matching by table name. A row naming a table Introspect
// didn't return any columns for (a constraint on a table outside the schemas
// read) is dropped rather than guessed at.
func attachForeignKeys(tables []Table, rows []foreignKeyRow) []Table {
	indexByName := make(map[string]int, len(tables))
	for i, table := range tables {
		indexByName[table.Name] = i
	}

	for _, row := range rows {
		idx, ok := indexByName[qualifiedTableName(row.Schema, row.Table)]
		if !ok {
			continue
		}
		tables[idx].ForeignKeys = append(tables[idx].ForeignKeys, ForeignKey{
			Column:           row.Column,
			ReferencedTable:  qualifiedTableName(row.ReferencedSchema, row.ReferencedTable),
			ReferencedColumn: row.ReferencedColumn,
		})
	}

	return tables
}

// headerFields turns a sheet's first row into field names, dropping the blank
// trailing cells spreadsheets tend to report past the last real column.
func headerFields(values [][]string) []string {
	fields := make([]string, 0)
	if len(values) == 0 {
		return fields
	}

	for _, cell := range values[0] {
		fields = append(fields, strings.TrimSpace(cell))
	}
	for len(fields) > 0 && fields[len(fields)-1] == "" {
		fields = fields[:len(fields)-1]
	}
	return fields
}
