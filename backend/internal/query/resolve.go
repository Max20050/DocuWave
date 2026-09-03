package query

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Max20050/docuwave/internal/datasource"
)

// resolvedColumn is a column proven to exist in the data source's schema.
// Nothing reaches a query without passing through one of these.
type resolvedColumn struct {
	// Name is the column exactly as the schema reports it.
	Name string
	// Type is the source's own type name, empty for sources that don't report
	// types (a spreadsheet header has no declared type).
	Type string
	// Index is the column's position among the source's columns. Sheets
	// addresses columns by position rather than by name.
	Index int
	// Table is the table this column belongs to, empty for sources that have
	// none (Sheets, REST). It's what a compiler qualifies the column with once
	// a spec joins more than one table together.
	Table string
}

// resolvedField is one selected field of the result.
type resolvedField struct {
	column    resolvedColumn
	aggregate Aggregate
	// counting marks a count of rows, which has no column.
	counting bool
	// output is the name this field is returned under, derived here so a
	// template's field mapping sees stable names.
	output string
}

// predicate is one primitive comparison. Relative date windows expand into
// these, so every dialect renders the same small set of operators.
type predicate struct {
	column   resolvedColumn
	operator Operator
	values   []any
}

type resolvedSort struct {
	field      resolvedField
	descending bool
}

// resolvedJoinCondition is one equality proven to reference real columns of
// the tables on either side of it.
type resolvedJoinCondition struct {
	left  resolvedColumn
	right resolvedColumn
}

// resolvedJoin is one more table proven to exist, joined by conditions proven
// to reference real columns of tables already in scope and of itself.
type resolvedJoin struct {
	table    string
	joinType JoinType
	on       []resolvedJoinCondition
}

// resolved is a spec proven against a schema and reduced to what a dialect
// renders. By this point every identifier came from the schema and every value
// has been coerced to the column's type.
type resolved struct {
	table      string
	joins      []resolvedJoin
	fields     []resolvedField
	predicates []predicate
	sorts      []resolvedSort
	limit      int
	// grouped reports whether any field is aggregated, which is what makes the
	// plain fields a GROUP BY.
	grouped bool
}

// outputs lists the result's column names, in order.
func (r resolved) outputs() []string {
	names := make([]string, 0, len(r.fields))
	for _, field := range r.fields {
		names = append(names, field.output)
	}
	return names
}

// groupFields are the non-aggregated fields, which a grouped query groups by.
func (r resolved) groupFields() []resolvedField {
	if !r.grouped {
		return nil
	}
	fields := make([]resolvedField, 0, len(r.fields))
	for _, field := range r.fields {
		if field.aggregate == AggregateNone {
			fields = append(fields, field)
		}
	}
	return fields
}

// resolve checks a spec against the source's schema and reduces it to something
// a dialect can render. Every failure here is the caller's to fix, so they all
// wrap ErrInvalidSpec with the detail needed to fix them.
func resolve(spec Spec, schema datasource.Schema, dialect Dialect, now time.Time) (resolved, error) {
	columns, table, joins, err := columnsFor(spec, schema, dialect)
	if err != nil {
		return resolved{}, err
	}

	out := resolved{table: table, joins: joins}

	if len(spec.Fields) == 0 {
		return resolved{}, fmt.Errorf("%w: select at least one field", ErrInvalidSpec)
	}
	seen := make(map[string]bool, len(spec.Fields))
	for _, field := range spec.Fields {
		resolvedField, err := resolveField(field, columns, table)
		if err != nil {
			return resolved{}, err
		}
		if seen[resolvedField.output] {
			return resolved{}, fmt.Errorf("%w: %s is selected twice", ErrInvalidSpec, resolvedField.output)
		}
		seen[resolvedField.output] = true
		if resolvedField.aggregate != AggregateNone {
			out.grouped = true
		}
		out.fields = append(out.fields, resolvedField)
	}

	for _, filter := range spec.Filters {
		predicates, err := resolveFilter(filter, columns, now)
		if err != nil {
			return resolved{}, err
		}
		out.predicates = append(out.predicates, predicates...)
	}

	for _, sort := range spec.Sorts {
		// Ordering by something the query doesn't select isn't portable — and on
		// a grouped query it isn't answerable — so a sort has to name a field.
		field, ok := selectedField(out.fields, columns, sort.Column, sort.Aggregate)
		if !ok {
			name := sort.Column
			if name == "" {
				name = "row_count"
			}
			return resolved{}, fmt.Errorf("%w: sorting by %s needs it to be one of the selected fields",
				ErrInvalidSpec, name)
		}
		out.sorts = append(out.sorts, resolvedSort{field: field, descending: sort.Descending})
	}

	out.limit, err = resolveLimit(spec.Limit)
	if err != nil {
		return resolved{}, err
	}

	return out, nil
}

// schemaColumns finds a table by name in the schema and returns its columns,
// each tagged with the table they belong to.
func schemaColumns(schema datasource.Schema, tableName string) ([]resolvedColumn, error) {
	for _, table := range schema.Tables {
		if table.Name != tableName {
			continue
		}
		if len(table.Columns) == 0 {
			return nil, fmt.Errorf("%w: table %s has no columns", ErrInvalidSpec, tableName)
		}
		columns := make([]resolvedColumn, 0, len(table.Columns))
		for i, column := range table.Columns {
			columns = append(columns, resolvedColumn{Name: column.Name, Type: column.Type, Index: i, Table: table.Name})
		}
		return columns, nil
	}
	// Naming the table back is safe — it's echoed as text in a JSON error, never
	// compiled — and it's the only way the user knows their schema is stale.
	return nil, fmt.Errorf("%w: %q is not a table in this data source — refresh its schema", ErrInvalidSpec, tableName)
}

func resolveJoinType(t JoinType) (JoinType, error) {
	if t == "" {
		return JoinInner, nil
	}
	if !IsJoinType(t) {
		return "", fmt.Errorf("%w: %q is not a supported join type", ErrInvalidSpec, t)
	}
	return t, nil
}

// columnsFor returns every column a spec may reference — the base table's,
// plus each joined table's — the base table's own name, and the joins proven
// against the schema. A source that exposes a single sheet or a REST resource
// has columns but no table, and allows no joins.
func columnsFor(spec Spec, schema datasource.Schema, dialect Dialect) ([]resolvedColumn, string, []resolvedJoin, error) {
	if dialect == DialectSheets {
		if len(spec.Joins) > 0 {
			return nil, "", nil, fmt.Errorf("%w: this data source has no tables to join", ErrInvalidSpec)
		}
		if len(schema.Fields) == 0 {
			return nil, "", nil, fmt.Errorf("%w: the sheet reported no columns — refresh its schema", ErrInvalidSpec)
		}
		columns := make([]resolvedColumn, 0, len(schema.Fields))
		for i, field := range schema.Fields {
			columns = append(columns, resolvedColumn{Name: field, Index: i})
		}
		return columns, "", nil, nil
	}

	if dialect == DialectREST {
		// A REST source has no table, and its selectable columns are the
		// mapped system-field names the caller (report.Runner.prepare)
		// already reduced schema.Fields to — not the raw api_field names
		// Introspect reports. Index is meaningless here: RunQuery works by
		// field name, not position, unlike Sheets.
		if len(spec.Joins) > 0 {
			return nil, "", nil, fmt.Errorf("%w: this data source has no tables to join", ErrInvalidSpec)
		}
		if len(schema.Fields) == 0 {
			return nil, "", nil, fmt.Errorf("%w: this data source has no mapped fields — map its fields first", ErrInvalidSpec)
		}
		columns := make([]resolvedColumn, 0, len(schema.Fields))
		for i, field := range schema.Fields {
			columns = append(columns, resolvedColumn{Name: field, Index: i})
		}
		return columns, "", nil, nil
	}

	if spec.Table == "" {
		return nil, "", nil, fmt.Errorf("%w: choose a table", ErrInvalidSpec)
	}
	if len(spec.Joins) > MaxJoins {
		return nil, "", nil, fmt.Errorf("%w: a query cannot join more than %d tables", ErrInvalidSpec, MaxJoins)
	}

	columns, err := schemaColumns(schema, spec.Table)
	if err != nil {
		return nil, "", nil, err
	}

	known := map[string]bool{spec.Table: true}
	joins := make([]resolvedJoin, 0, len(spec.Joins))
	for _, j := range spec.Joins {
		if j.Table == "" {
			return nil, "", nil, fmt.Errorf("%w: a join needs a table", ErrInvalidSpec)
		}
		if known[j.Table] {
			return nil, "", nil, fmt.Errorf("%w: %q is already part of this query", ErrInvalidSpec, j.Table)
		}
		joinType, err := resolveJoinType(j.Type)
		if err != nil {
			return nil, "", nil, err
		}
		if len(j.On) == 0 {
			return nil, "", nil, fmt.Errorf("%w: joining %s needs at least one condition", ErrInvalidSpec, j.Table)
		}

		joinColumns, err := schemaColumns(schema, j.Table)
		if err != nil {
			return nil, "", nil, err
		}

		conditions := make([]resolvedJoinCondition, 0, len(j.On))
		for _, cond := range j.On {
			left, err := lookupColumn(columns, cond.Left)
			if err != nil {
				return nil, "", nil, fmt.Errorf("joining %s: %w", j.Table, err)
			}
			right, err := lookupColumn(joinColumns, cond.Right)
			if err != nil {
				return nil, "", nil, fmt.Errorf("joining %s: %w", j.Table, err)
			}
			conditions = append(conditions, resolvedJoinCondition{left: left, right: right})
		}

		joins = append(joins, resolvedJoin{table: j.Table, joinType: joinType, on: conditions})
		known[j.Table] = true
		columns = append(columns, joinColumns...)
	}

	return columns, spec.Table, joins, nil
}

// lookupColumn finds a column by name, which may be bare — resolved against
// every table in scope, so it must be unambiguous there — or qualified as
// "table.column", needed once more than one joined table shares a column
// name. Table names are matched longest-prefix first, since a schema-qualified
// table name (Postgres, outside the default schema) is itself allowed to
// contain a dot.
func lookupColumn(columns []resolvedColumn, ref string) (resolvedColumn, error) {
	if column, ok := lookupQualifiedColumn(columns, ref); ok {
		return column, nil
	}

	var found resolvedColumn
	matches := 0
	tagged := false
	for _, column := range columns {
		if column.Name == ref {
			found = column
			matches++
			tagged = tagged || column.Table != ""
		}
	}
	switch matches {
	case 0:
		return resolvedColumn{}, fmt.Errorf("%w: %q is not a column in this data source — refresh its schema",
			ErrInvalidSpec, ref)
	case 1:
		return found, nil
	default:
		// A source with no tables (Sheets, REST) can only repeat a name the way
		// a spreadsheet header does; a source with tables repeats one only by
		// joining two that both have it, which qualifying resolves.
		if tagged {
			return resolvedColumn{}, fmt.Errorf("%w: %q is in more than one joined table — qualify it as table.column",
				ErrInvalidSpec, ref)
		}
		return resolvedColumn{}, fmt.Errorf("%w: %q appears more than once, so it can't be used", ErrInvalidSpec, ref)
	}
}

// lookupQualifiedColumn tries ref as "table.column" against the tables columns
// belong to, picking the longest table name that prefixes it.
func lookupQualifiedColumn(columns []resolvedColumn, ref string) (resolvedColumn, bool) {
	bestTable := ""
	for _, column := range columns {
		if column.Table == "" || len(column.Table) <= len(bestTable) {
			continue
		}
		if strings.HasPrefix(ref, column.Table+".") {
			bestTable = column.Table
		}
	}
	if bestTable == "" {
		return resolvedColumn{}, false
	}
	name := ref[len(bestTable)+1:]
	for _, column := range columns {
		if column.Table == bestTable && column.Name == name {
			return column, true
		}
	}
	return resolvedColumn{}, false
}

func resolveField(field Field, columns []resolvedColumn, baseTable string) (resolvedField, error) {
	if field.Aggregate != AggregateNone {
		if _, ok := sqlFunction[field.Aggregate]; !ok {
			return resolvedField{}, fmt.Errorf("%w: %q is not a supported aggregate", ErrInvalidSpec, field.Aggregate)
		}
	}

	if field.Column == "" {
		// Counting rows is the one field that needs no column.
		if field.Aggregate != AggregateCount {
			return resolvedField{}, fmt.Errorf("%w: choose a column for the %s field", ErrInvalidSpec,
				fieldAggregateLabel(field.Aggregate))
		}
		return resolvedField{aggregate: AggregateCount, counting: true, output: "row_count"}, nil
	}

	column, err := lookupColumn(columns, field.Column)
	if err != nil {
		return resolvedField{}, err
	}
	return resolvedField{column: column, aggregate: field.Aggregate, output: outputName(column, baseTable, field.Aggregate)}, nil
}

func fieldAggregateLabel(aggregate Aggregate) string {
	if aggregate == AggregateNone {
		return "selected"
	}
	return string(aggregate)
}

// outputName is the name a field is returned under. A column from a joined
// table (anything other than the query's own base table) is prefixed with its
// table, so the same-named column of two tables stays distinct; an aggregate
// is prefixed too, so two measures of one column stay distinct. Either way a
// report's field mapping keeps working across runs.
func outputName(column resolvedColumn, baseTable string, aggregate Aggregate) string {
	name := column.Name
	if column.Table != "" && column.Table != baseTable {
		name = strings.ReplaceAll(column.Table, ".", "_") + "_" + name
	}
	if aggregate == AggregateNone {
		return name
	}
	return string(aggregate) + "_" + name
}

// selectedField finds the selected field a sort names, resolving columnRef the
// same way a Field's own column would be, so a sort can name any selected
// field — including one from a joined table — without repeating its aggregate
// disambiguation logic.
func selectedField(fields []resolvedField, columns []resolvedColumn, columnRef string, aggregate Aggregate) (resolvedField, bool) {
	if columnRef == "" {
		if aggregate != AggregateCount {
			return resolvedField{}, false
		}
		for _, field := range fields {
			if field.counting {
				return field, true
			}
		}
		return resolvedField{}, false
	}

	column, err := lookupColumn(columns, columnRef)
	if err != nil {
		return resolvedField{}, false
	}
	for _, field := range fields {
		if !field.counting && field.aggregate == aggregate &&
			field.column.Table == column.Table && field.column.Name == column.Name {
			return field, true
		}
	}
	return resolvedField{}, false
}

func resolveLimit(limit int) (int, error) {
	switch {
	case limit == 0:
		return DefaultRowLimit, nil
	case limit < 0:
		return 0, fmt.Errorf("%w: the row limit cannot be negative", ErrInvalidSpec)
	case limit > MaxRowLimit:
		return 0, fmt.Errorf("%w: the row limit cannot exceed %d", ErrInvalidSpec, MaxRowLimit)
	default:
		return limit, nil
	}
}

// resolveFilter validates one filter and reduces it to primitive comparisons.
func resolveFilter(filter Filter, columns []resolvedColumn, now time.Time) ([]predicate, error) {
	arity, ok := operatorArities[filter.Operator]
	if !ok {
		return nil, fmt.Errorf("%w: %q is not a supported filter", ErrInvalidSpec, filter.Operator)
	}

	column, err := lookupColumn(columns, filter.Column)
	if err != nil {
		return nil, err
	}

	given := filter.values()
	switch arity {
	case arityNone:
		if len(given) > 0 {
			return nil, fmt.Errorf("%w: the %s filter on %s takes no value", ErrInvalidSpec, filter.Operator, column.Name)
		}
	case arityOne, arityCount:
		if len(given) != 1 {
			return nil, fmt.Errorf("%w: the %s filter on %s needs a value", ErrInvalidSpec, filter.Operator, column.Name)
		}
	case arityMany:
		if len(given) == 0 {
			return nil, fmt.Errorf("%w: the %s filter on %s needs at least one value", ErrInvalidSpec, filter.Operator, column.Name)
		}
	case arityPair:
		if len(given) != 2 {
			return nil, fmt.Errorf("%w: the %s filter on %s needs two values", ErrInvalidSpec, filter.Operator, column.Name)
		}
	}

	switch filter.Operator {
	case OpLastDays, OpThisMonth, OpLastMonth:
		return dateWindow(column, filter.Operator, given, now)
	case OpIsNull, OpIsNotNull:
		return []predicate{{column: column, operator: filter.Operator}}, nil
	}

	values := make([]any, 0, len(given))
	for _, value := range given {
		coerced, err := coerceValue(column, value)
		if err != nil {
			return nil, err
		}
		values = append(values, coerced)
	}
	if filter.Operator == OpContains {
		if _, ok := values[0].(string); !ok {
			return nil, fmt.Errorf("%w: the contains filter on %s needs text", ErrInvalidSpec, column.Name)
		}
	}

	return []predicate{{column: column, operator: filter.Operator, values: values}}, nil
}

// dateWindow turns a relative window into the fixed bounds it means right now,
// so the query itself carries no date arithmetic and every dialect gets the same
// two comparisons. Windows are whole days in UTC.
func dateWindow(column resolvedColumn, operator Operator, given []any, now time.Time) ([]predicate, error) {
	switch familyOf(column.Type) {
	case familyTime, familyUnknown:
	default:
		return nil, fmt.Errorf("%w: the %s filter needs a date column, and %s is %s",
			ErrInvalidSpec, operator, column.Name, column.Type)
	}

	today := now.UTC().Truncate(24 * time.Hour)
	monthStart := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)

	var from, to time.Time
	switch operator {
	case OpLastDays:
		days, err := wholeNumber(given[0])
		if err != nil || days < 1 {
			return nil, fmt.Errorf("%w: the last_days filter on %s needs a whole number of days",
				ErrInvalidSpec, column.Name)
		}
		// Counting today, so "last 7 days" is today plus the six before it.
		from = today.AddDate(0, 0, -(days - 1))
	case OpThisMonth:
		from, to = monthStart, monthStart.AddDate(0, 1, 0)
	case OpLastMonth:
		from, to = monthStart.AddDate(0, -1, 0), monthStart
	}

	predicates := []predicate{{column: column, operator: OpGreaterEqual, values: []any{from}}}
	if !to.IsZero() {
		predicates = append(predicates, predicate{column: column, operator: OpLess, values: []any{to}})
	}
	return predicates, nil
}

func wholeNumber(value any) (int, error) {
	switch typed := value.(type) {
	case float64:
		if typed != float64(int(typed)) {
			return 0, fmt.Errorf("%w: %v is not a whole number", ErrInvalidSpec, typed)
		}
		return int(typed), nil
	case int:
		return typed, nil
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0, fmt.Errorf("%w: %q is not a whole number", ErrInvalidSpec, typed)
		}
		return parsed, nil
	default:
		return 0, fmt.Errorf("%w: %v is not a whole number", ErrInvalidSpec, value)
	}
}

// typeFamily groups a source's own type names into the handful of shapes a
// filter value has to be coerced into.
type typeFamily int

const (
	// familyUnknown is a source that doesn't declare types, such as a
	// spreadsheet header. Values are taken as the JSON types they arrived as.
	familyUnknown typeFamily = iota
	familyText
	familyNumber
	familyBool
	familyTime
)

// familyOf reads a source's declared type name. Type names vary by engine
// ("int4", "bigint unsigned", "timestamp with time zone"), so this matches on
// the part that identifies the family.
func familyOf(sqlType string) typeFamily {
	name := strings.ToLower(strings.TrimSpace(sqlType))
	switch {
	case name == "":
		return familyUnknown
	case strings.Contains(name, "bool"):
		return familyBool
	case strings.Contains(name, "timestamp"), strings.Contains(name, "date"),
		strings.Contains(name, "time"):
		return familyTime
	case strings.Contains(name, "int"), strings.Contains(name, "serial"),
		strings.Contains(name, "numeric"), strings.Contains(name, "decimal"),
		strings.Contains(name, "real"), strings.Contains(name, "double"),
		strings.Contains(name, "float"):
		return familyNumber
	default:
		return familyText
	}
}

// timeLayouts are the shapes a date filter's value may arrive in: a date picker
// sends the first, an API client is likely to send RFC 3339.
var timeLayouts = []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04"}

// coerceValue converts a JSON value into the column's own shape, so a
// comparison reaches the source correctly typed and a bad value is reported
// here rather than as a database error.
func coerceValue(column resolvedColumn, value any) (any, error) {
	if value == nil {
		return nil, fmt.Errorf("%w: the filter on %s has no value — use is_null instead", ErrInvalidSpec, column.Name)
	}

	switch familyOf(column.Type) {
	case familyNumber:
		return numberValue(column, value)
	case familyBool:
		return boolValue(column, value)
	case familyTime:
		return timeValue(column, value)
	case familyText:
		return textValue(value), nil
	default:
		// The source declares no types, so the value stays as it arrived.
		switch value.(type) {
		case string, float64, bool:
			return value, nil
		default:
			return nil, fmt.Errorf("%w: %v can't be used to filter %s", ErrInvalidSpec, value, column.Name)
		}
	}
}

func numberValue(column resolvedColumn, value any) (any, error) {
	switch typed := value.(type) {
	case float64:
		return typed, nil
	case int:
		return float64(typed), nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return nil, fmt.Errorf("%w: %q is not a number, and %s is %s", ErrInvalidSpec, typed, column.Name, column.Type)
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("%w: %v is not a number, and %s is %s", ErrInvalidSpec, value, column.Name, column.Type)
	}
}

func boolValue(column resolvedColumn, value any) (any, error) {
	switch typed := value.(type) {
	case bool:
		return typed, nil
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		if err != nil {
			return nil, fmt.Errorf("%w: %q is not true or false, and %s is %s", ErrInvalidSpec, typed, column.Name, column.Type)
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("%w: %v is not true or false, and %s is %s", ErrInvalidSpec, value, column.Name, column.Type)
	}
}

func timeValue(column resolvedColumn, value any) (any, error) {
	text, ok := value.(string)
	if !ok {
		return nil, fmt.Errorf("%w: %v is not a date, and %s is %s", ErrInvalidSpec, value, column.Name, column.Type)
	}
	text = strings.TrimSpace(text)
	for _, layout := range timeLayouts {
		if parsed, err := time.Parse(layout, text); err == nil {
			return parsed, nil
		}
	}
	return nil, fmt.Errorf("%w: %q is not a date — use YYYY-MM-DD", ErrInvalidSpec, text)
}

// textValue renders a value as the text a character column compares against, so
// filtering a text column with 42 does what the user meant.
func textValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(typed)
	default:
		return fmt.Sprint(value)
	}
}
