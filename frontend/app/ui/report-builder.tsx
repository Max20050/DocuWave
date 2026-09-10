"use client";

import { useEffect, useState } from "react";
import {
  AGGREGATES,
  OPERATORS,
  REPORT_FORMATS,
  archiveReportTemplate,
  createCustomTemplate,
  emptyQuerySpec,
  getDataSourceSchema,
  getFieldMapping,
  getLLMConfig,
  JOIN_TYPES,
  listArchivedReportTemplates,
  listReportTemplates,
  previewReport,
  previewReportTemplate,
  restoreReportTemplate,
  updateCustomTemplate,
  type Aggregate,
  type DataSource,
  type DataSourceSchema,
  type FieldMapping,
  type JoinType,
  type LLMConfig,
  type Operator,
  type OperatorArity,
  type PlaceholderFilter,
  type QueryField,
  type QueryFilter,
  type QueryJoin,
  type QueryPreview,
  type QuerySort,
  type QuerySpec,
  type ReportFormat,
  type ReportInput,
  type ReportTemplate,
  type SchemaColumn,
  type TemplateConfig,
} from "@/lib/api";
import { QueryPreviewTable } from "@/app/ui/query-preview-table";
import { DataSourceFieldMappingPanel } from "@/app/ui/data-source-field-mapping";
import { Icon } from "@/app/ui/icons";
import {
  ChoiceCards,
  CopyButton,
  Disclosure,
  Field,
  Note,
  Skeleton,
  Steps,
} from "@/app/ui/primitives";
import {
  TemplatePicker,
  defaultTemplateConfig,
  numericColumns,
  type CustomTemplateDraft,
} from "@/app/ui/template-picker";

const inputClass = "dw-field";
const smallInputClass = `${inputClass} py-1 text-sm`;
const removeButtonClass =
  "dw-btn dw-btn-sm";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

function hasAISummaryBlock(blocks: { kind: string }[] | undefined): boolean {
  return (blocks ?? []).some((b) => b.kind === "ai-summary");
}

// columnMetaFor reads the columns a data source's schema makes available,
// each with its declared type kept alongside its name for UI that shows a
// type hint (Google Sheets and REST fields have none): a table's own columns
// for SQL sources, the sheet's header fields for Google Sheets (which report
// an empty table), and a REST source's currently-mapped system fields.
//
// For a REST source, the offered columns aren't the raw api_field names
// Introspect reports — they're the distinct our_field (system field) names
// the source's stored mapping currently points at, matching what the backend
// compiles a REST spec's fields against (see report.Runner.mappedRESTSchema).
// `name` stays the raw system-field key FieldPicker/FieldOrderPanel and the
// backend expect in QueryField.column; only the label shown is prettified via
// the mapping response's systemFields catalog.
//
// SQL sources only: joins add each joined table's columns after the base
// table's own, qualified as "table.column" — the base table's stay bare. This
// matches how the backend names a joined field's output column (see
// query.outputName), and how it disambiguates a bare column reference (see
// query.lookupColumn): unqualified always means the base table.
function columnMetaFor(
  schema: DataSourceSchema | null,
  table: string,
  joins: QueryJoin[],
  fieldMapping: FieldMapping | null,
): SchemaColumn[] {
  if (!schema) return [];
  if (schema.type === "google_sheets") return (schema.fields ?? []).map((name) => ({ name, type: "" }));
  if (schema.type === "rest_api") {
    if (!fieldMapping) return [];
    const labelFor = new Map(fieldMapping.systemFields.map((f) => [f.key, f.label]));
    const seen = new Set<string>();
    const columns: SchemaColumn[] = [];
    for (const ourField of Object.values(fieldMapping.mapping)) {
      if (seen.has(ourField)) continue;
      seen.add(ourField);
      columns.push({ name: ourField, type: labelFor.get(ourField) ?? "" });
    }
    return columns;
  }
  const columns = schema.tables?.find((candidate) => candidate.name === table)?.columns ?? [];
  const joined = joins.flatMap((join) => {
    const cols = schema.tables?.find((candidate) => candidate.name === join.table)?.columns ?? [];
    return cols.map((c) => ({ name: `${join.table}.${c.name}`, type: c.type }));
  });
  return [...columns, ...joined];
}

// joinScopeColumns lists the columns available to the left side of one join's
// condition: the base table's own (bare), plus every earlier join's (qualified
// "table.column") — never the join being edited itself, and never a later
// one, matching the backend's own rule that a join's left side can only name
// something already in the query by that point (see query.columnsFor).
function joinScopeColumns(
  schema: DataSourceSchema,
  table: string,
  joins: QueryJoin[],
  uptoIndex: number,
): { value: string; label: string }[] {
  const base = schema.tables?.find((candidate) => candidate.name === table)?.columns ?? [];
  const out = base.map((c) => ({ value: c.name, label: `${table}.${c.name}` }));
  for (let i = 0; i < uptoIndex; i++) {
    const join = joins[i];
    const cols = schema.tables?.find((candidate) => candidate.name === join.table)?.columns ?? [];
    for (const c of cols) out.push({ value: `${join.table}.${c.name}`, label: `${join.table}.${c.name}` });
  }
  return out;
}

// JoinEditor lets the user bring in more tables, each matched to what's
// already in the query by one or more equal-column conditions — the shape a
// report like "sales by rep, and which supplier served them best" needs: join
// sales to suppliers on supplier_id, then pick fields from either table.
function JoinEditor({
  schema,
  table,
  joins,
  onChange,
}: {
  schema: DataSourceSchema;
  table: string;
  joins: QueryJoin[];
  onChange: (joins: QueryJoin[]) => void;
}) {
  const usedTables = new Set([table, ...joins.map((j) => j.table)]);
  const availableTables = (schema.tables ?? []).filter((t) => !usedTables.has(t.name));

  function update(index: number, join: QueryJoin) {
    onChange(joins.map((j, i) => (i === index ? join : j)));
  }
  function remove(index: number) {
    onChange(joins.filter((_, i) => i !== index));
  }
  function add() {
    const next = availableTables[0];
    if (!next) return;
    onChange([...joins, { table: next.name, type: "inner", on: [{ left: "", right: "" }] }]);
  }

  if (!table) return null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">Joins</legend>
      <p className="text-sm text-muted">
        Bring in columns from other tables, matched by equal columns — e.g. join suppliers to
        sales on supplier_id to see which supplier serves each rep best.
      </p>
      {joins.map((join, index) => {
        // Re-picking a table the user already joined (via the dropdown below)
        // would silently merge two joins into one; excluding tables used by
        // *other* joins from this one's own options, while still listing this
        // join's current table, keeps the dropdown honest without losing the
        // selection.
        const tableOptions = [
          join.table,
          ...availableTables.map((t) => t.name).filter((name) => name !== join.table),
        ];
        const scopeColumns = joinScopeColumns(schema, table, joins, index);
        const joinTableColumns = schema.tables?.find((t) => t.name === join.table)?.columns ?? [];
        return (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-md border border-line p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={join.type ?? "inner"}
                onChange={(e) => update(index, { ...join, type: e.target.value as JoinType })}
                className={smallInputClass}
              >
                {JOIN_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-sm">join</span>
              <select
                value={join.table}
                onChange={(e) => update(index, { ...join, table: e.target.value, on: [{ left: "", right: "" }] })}
                className={smallInputClass}
              >
                {tableOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => remove(index)} className={removeButtonClass}>
                Remove
              </button>
            </div>
            {join.on.map((cond, condIndex) => (
              <div key={condIndex} className="flex flex-wrap items-center gap-2 pl-2 text-sm">
                <span className="text-xs text-faint dark:text-faint">on</span>
                <select
                  value={cond.left}
                  onChange={(e) => {
                    const on = join.on.map((c, i) => (i === condIndex ? { ...c, left: e.target.value } : c));
                    update(index, { ...join, on });
                  }}
                  className={smallInputClass}
                >
                  <option value="">column…</option>
                  {scopeColumns.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span>=</span>
                <select
                  value={cond.right}
                  onChange={(e) => {
                    const on = join.on.map((c, i) => (i === condIndex ? { ...c, right: e.target.value } : c));
                    update(index, { ...join, on });
                  }}
                  className={smallInputClass}
                >
                  <option value="">column…</option>
                  {joinTableColumns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {join.on.length > 1 && (
                  <button
                    type="button"
                    onClick={() => update(index, { ...join, on: join.on.filter((_, i) => i !== condIndex) })}
                    className={removeButtonClass}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div>
              <button
                type="button"
                onClick={() => update(index, { ...join, on: [...join.on, { left: "", right: "" }] })}
                className={removeButtonClass}
              >
                Add condition
              </button>
            </div>
          </div>
        );
      })}
      <div>
        <button type="button" onClick={add} disabled={availableTables.length === 0} className={removeButtonClass}>
          Add join
        </button>
      </div>
    </fieldset>
  );
}

function operatorArity(operator: Operator): OperatorArity {
  return OPERATORS.find((candidate) => candidate.value === operator)?.arity ?? "one";
}

// FormatPicker chooses the files the report is delivered as. A report needs at
// least one, so the last one checked can't be unchecked — the save button would
// only refuse it a step later.
function FormatPicker({
  formats,
  onChange,
}: {
  formats: ReportFormat[];
  onChange: (formats: ReportFormat[]) => void;
}) {
  function toggle(format: ReportFormat, checked: boolean) {
    onChange(
      checked
        ? REPORT_FORMATS.map((option) => option.value).filter(
            (value) => value === format || formats.includes(value),
          )
        : formats.filter((value) => value !== format),
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Output formats</legend>
      <p className="text-sm text-muted">
        Every format you pick is generated each time the report runs.
      </p>
      {REPORT_FORMATS.map((option) => {
        const checked = formats.includes(option.value);
        return (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={checked && formats.length === 1}
              onChange={(e) => toggle(option.value, e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{option.label}</span>{" "}
              <span className="text-muted">{option.description}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// columnBadge shortens a schema column's declared type down to the same kind
// of one-glyph hint the field picker shows next to each checkbox.
function columnBadge(type: string | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (/int|numeric|decimal|float|double|serial/.test(t)) return "123";
  if (/date|time/.test(t)) return "\u{1F4C5}";
  if (/bool/.test(t)) return "✓";
  return "A";
}

// FieldPicker lists every column a table (or sheet) offers as a checkbox: on
// for columns already in the query's field list, off otherwise. Toggling adds
// or removes the column from that list without disturbing the position of the
// fields that stay — reordering is FieldOrderPanel's job, not this one's.
function FieldPicker({
  tableLabel,
  columns,
  fields,
  onChange,
}: {
  tableLabel: string;
  columns: SchemaColumn[];
  fields: QueryField[];
  onChange: (fields: QueryField[]) => void;
}) {
  function toggle(column: string, checked: boolean) {
    if (checked) {
      if (fields.some((f) => f.column === column)) return;
      onChange([...fields, { column, aggregate: "" }]);
    } else {
      onChange(fields.filter((f) => f.column !== column));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Choose what to include</h3>
        <p className="text-sm text-muted">
          Pick the columns you want in the report.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-faint dark:text-faint">
          Fields available in: {tableLabel}
        </p>
        <div className="flex flex-col divide-y divide-line rounded-md border border-line">
          {columns.map((column) => {
            const checked = fields.some((f) => f.column === column.name);
            return (
              <label
                key={column.name}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(column.name, e.target.checked)}
                />
                <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded bg-surface-2 text-[10px] font-medium bg-surface-2">
                  {columnBadge(column.type)}
                </span>
                <span className="font-medium">{column.name}</span>
                {column.type && (
                  <span className="text-xs text-faint dark:text-faint">{column.type}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// FieldOrderPanel is the "your report" side of field selection: the columns
// already picked, in the order they'll appear, reorderable by native
// drag-and-drop and each still able to carry an aggregate.
function FieldOrderPanel({
  fields,
  onChange,
}: {
  fields: QueryField[];
  onChange: (fields: QueryField[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function update(index: number, field: QueryField) {
    onChange(fields.map((f, i) => (i === index ? field : f)));
  }
  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Your report</h3>
          <p className="text-sm text-muted">Drag to reorder.</p>
        </div>
        {fields.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-danger hover:underline">
            Clear all
          </button>
        )}
      </div>
      {fields.length === 0 ? (
        <p className="rounded border border-dashed border-line px-3 py-6 text-center text-sm text-faint dark:text-faint">
          Check fields on the left to add them here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li
              key={`${field.column}-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveTo(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-2 ${
 dragIndex === index ? "opacity-50" : ""
 }`}
            >
              <span className="cursor-grab select-none text-faint" aria-hidden>
                ⋮⋮
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {field.aggregate === "count" ? "(all rows)" : field.column}
              </span>
              <select
                value={field.aggregate ?? ""}
                onChange={(e) => {
                  const aggregate = e.target.value as Aggregate;
                  update(index, {
                    ...field,
                    aggregate,
                    column: aggregate === "count" ? "" : field.column,
                  });
                }}
                className={smallInputClass}
              >
                {AGGREGATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => remove(index)} className={removeButtonClass}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// filterValueInputs renders the value control(s) a filter's operator needs:
// none, one, two (between), or a comma-separated list (in).
function FilterValueInputs({ filter, onChange }: { filter: QueryFilter; onChange: (filter: QueryFilter) => void }) {
  const arity = operatorArity(filter.operator);
  if (arity === "none") return null;
  if (arity === "pair") {
    const values = Array.isArray(filter.values) ? filter.values : ["", ""];
    return (
      <>
        <input
          value={String(values[0] ?? "")}
          onChange={(e) => onChange({ ...filter, values: [e.target.value, values[1] ?? ""] })}
          className={smallInputClass}
          placeholder="from"
        />
        <input
          value={String(values[1] ?? "")}
          onChange={(e) => onChange({ ...filter, values: [values[0] ?? "", e.target.value] })}
          className={smallInputClass}
          placeholder="to"
        />
      </>
    );
  }
  if (arity === "many") {
    const text = Array.isArray(filter.values) ? filter.values.join(", ") : "";
    return (
      <input
        value={text}
        onChange={(e) =>
          onChange({
            ...filter,
            values: e.target.value.split(",").map((v) => v.trim()).filter((v) => v !== ""),
          })
        }
        className={smallInputClass}
        placeholder="a, b, c"
      />
    );
  }
  if (arity === "count") {
    return (
      <input
        type="number"
        min={1}
        value={typeof filter.value === "number" ? filter.value : ""}
        onChange={(e) => onChange({ ...filter, value: Number(e.target.value) })}
        className={smallInputClass}
        placeholder="days"
      />
    );
  }
  return (
    <input
      value={typeof filter.value === "string" || typeof filter.value === "number" ? String(filter.value) : ""}
      onChange={(e) => onChange({ ...filter, value: e.target.value })}
      className={smallInputClass}
      placeholder="value"
    />
  );
}

// FilterEditor builds the Filters part of a query specification.
function FilterEditor({
  columns,
  filters,
  onChange,
}: {
  columns: string[];
  filters: QueryFilter[];
  onChange: (filters: QueryFilter[]) => void;
}) {
  function update(index: number, filter: QueryFilter) {
    onChange(filters.map((f, i) => (i === index ? filter : f)));
  }
  function remove(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...filters, { column: columns[0] ?? "", operator: "eq" }]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Filters</legend>
      {filters.map((filter, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select
            value={filter.column}
            onChange={(e) => update(index, { ...filter, column: e.target.value })}
            className={smallInputClass}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <select
            value={filter.operator}
            onChange={(e) => update(index, { ...filter, operator: e.target.value as Operator })}
            className={smallInputClass}
          >
            {OPERATORS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FilterValueInputs filter={filter} onChange={(next) => update(index, next)} />
          <button type="button" onClick={() => remove(index)} className={removeButtonClass}>
            Remove
          </button>
        </div>
      ))}
      <div>
        <button type="button" onClick={add} disabled={columns.length === 0} className={removeButtonClass}>
          Add filter
        </button>
      </div>
    </fieldset>
  );
}

// SortEditor builds the Sorts part of a query specification.
function SortEditor({
  columns,
  sorts,
  onChange,
}: {
  columns: string[];
  sorts: QuerySort[];
  onChange: (sorts: QuerySort[]) => void;
}) {
  function update(index: number, sort: QuerySort) {
    onChange(sorts.map((s, i) => (i === index ? sort : s)));
  }
  function remove(index: number) {
    onChange(sorts.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...sorts, { column: columns[0] ?? "", descending: false }]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Sort</legend>
      {sorts.map((sort, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={sort.column}
            onChange={(e) => update(index, { ...sort, column: e.target.value })}
            className={smallInputClass}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={sort.descending ?? false}
              onChange={(e) => update(index, { ...sort, descending: e.target.checked })}
            />
            Descending
          </label>
          <button type="button" onClick={() => remove(index)} className={removeButtonClass}>
            Remove
          </button>
        </div>
      ))}
      <div>
        <button type="button" onClick={add} disabled={columns.length === 0} className={removeButtonClass}>
          Add sort
        </button>
      </div>
    </fieldset>
  );
}

const RECIPIENT_FIELD_SUGGESTIONS = ["email", "name"];

// PlaceholderFilterEditor builds a report's Inputs: filters whose value isn't
// typed now, but is resolved from the recipient the report is eventually sent
// to. They don't affect preview — the server keeps them out of query
// compilation until a future delivery step resolves them.
function PlaceholderFilterEditor({
  columns,
  filters,
  onChange,
}: {
  columns: string[];
  filters: PlaceholderFilter[];
  onChange: (filters: PlaceholderFilter[]) => void;
}) {
  function update(index: number, filter: PlaceholderFilter) {
    onChange(filters.map((f, i) => (i === index ? filter : f)));
  }
  function remove(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...filters, { column: columns[0] ?? "", operator: "eq", recipientField: "" }]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Inputs</legend>
      <p className="text-sm text-muted">
        Filters filled in from the recipient a report is sent to, once that&apos;s set up — not from a
        value you type now.
      </p>
      {filters.map((filter, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select
            value={filter.column}
            onChange={(e) => update(index, { ...filter, column: e.target.value })}
            className={smallInputClass}
          >
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <select
            value={filter.operator}
            onChange={(e) => update(index, { ...filter, operator: e.target.value as Operator })}
            className={smallInputClass}
          >
            {OPERATORS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={filter.recipientField}
            onChange={(e) => update(index, { ...filter, recipientField: e.target.value })}
            list="recipient-field-suggestions"
            placeholder="recipient field (e.g. region)"
            className={smallInputClass}
          />
          <button type="button" onClick={() => remove(index)} className={removeButtonClass}>
            Remove
          </button>
        </div>
      ))}
      <datalist id="recipient-field-suggestions">
        {RECIPIENT_FIELD_SUGGESTIONS.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>
      <div>
        <button type="button" onClick={add} disabled={columns.length === 0} className={removeButtonClass}>
          Add input
        </button>
      </div>
    </fieldset>
  );
}

// The rail down the left of the builder. Each hint says what that stage is
// for, so the shape of the whole task is readable before any of it is done —
// the shared Steps component in app/ui/primitives.tsx draws it and enforces
// that a locked step can't be jumped to.
const STEPS = [
  { n: 1, label: "Source", hint: "Where the rows come from" },
  { n: 2, label: "Data", hint: "Which rows, and which columns" },
  { n: 3, label: "Design", hint: "How the page looks" },
  { n: 4, label: "Publish", hint: "Name it and pick formats" },
];

// The one-line instruction shown above each stage's controls.
const STEP_LEAD: Record<number, string> = {
  1: "Pick the connector this report reads from. For a database, choose the table too.",
  2: "Choose the columns you want, narrow the rows, then run a preview to see what comes back.",
  3: "Pick a layout and map your columns onto it. You can render a preview before committing.",
  4: "Give the report a name and choose which file formats it can be generated in.",
};

// TablePicker replaces the table <select>. A database can easily have fifty
// tables, and a dropdown shows one at a time with no idea how wide any of
// them is; this lists them with their column count and filters as you type.
function TablePicker({
  tables,
  value,
  onChange,
}: {
  tables: { name: string; columns: SchemaColumn[] }[];
  value: string;
  onChange: (table: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = tables.filter((table) => table.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      {tables.length > 8 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tables…"
          className="dw-field dw-field-sm"
        />
      )}
      <ul className="dw-card max-h-56 divide-y divide-line overflow-y-auto">
        {visible.map((table) => {
          const selected = table.name === value;
          return (
            <li key={table.name}>
              <button
                type="button"
                onClick={() => onChange(table.name)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  selected ? "bg-[var(--accent-soft)] text-accent" : "hover:bg-surface-2"
                }`}
              >
                <span className="dw-mono flex-1 truncate">{table.name}</span>
                <span className="dw-hint shrink-0 tabular-nums">{table.columns.length} cols</span>
                {selected && <Icon.Check size={14} />}
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="dw-hint px-3 py-2">No table matches that.</li>}
      </ul>
    </div>
  );
}

// ReportBuilder walks the user from a data source to a saved report: pick the
// table and the fields/filters/sort that make up its query specification,
// preview the rows it returns, pick the template it prints in and map the
// columns onto that template's slots, then save. The specification is what's
// stored and recompiled on every run — no query text ever leaves the browser.
export function ReportBuilder({
  token,
  sources,
  onCreate,
}: {
  token: string;
  sources: DataSource[];
  onCreate: (input: ReportInput) => Promise<void>;
}) {
  const [dataSourceId, setDataSourceId] = useState(sources[0]?.id ?? "");
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  // fieldMapping is only meaningful (and only fetched) for a rest_api source:
  // it's what turns raw api_field names into the system-field columns the
  // Data step offers, per columnMetaFor.
  const [fieldMapping, setFieldMapping] = useState<FieldMapping | null>(null);
  const [fieldMappingError, setFieldMappingError] = useState<string | null>(null);
  const [spec, setSpec] = useState<QuerySpec>(emptyQuerySpec());
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<QueryPreview | null>(null);
  const [name, setName] = useState("");

  // A report is a PDF unless the user says otherwise, which is what a report
  // was before it could be anything else.
  const [formats, setFormats] = useState<ReportFormat[]>(["pdf"]);

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [archivedTemplates, setArchivedTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({});
  const [layout, setLayout] = useState<string | null>(null);
  // customDraft holds the block composition the user is building or
  // reworking; it's null the rest of the time, when the picker shows the
  // normal template list and field mapping.
  const [customDraft, setCustomDraft] = useState<CustomTemplateDraft | null>(null);

  // llmConfig is loaded once to warn about ai-summary blocks before save
  // rather than letting the request fail — null means "none configured",
  // not "still loading" (loading and none look the same to this warning).
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);

  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);

  // currentStep drives which of the wizard's four stages is on screen. It's
  // clamped below whenever maxUnlocked drops behind it — e.g. changing the
  // data source invalidates everything downstream of step 1.
  const [currentStep, setCurrentStep] = useState(1);

  // loadTemplates reloads both listings — the picker's default cards and its
  // "Show archived" section — so a save, archive, or restore is reflected
  // immediately without a page refresh.
  async function loadTemplates() {
    const [active, archived] = await Promise.all([
      listReportTemplates(token),
      listArchivedReportTemplates(token),
    ]);
    setTemplates(active);
    setArchivedTemplates(archived);
  }

  useEffect(() => {
    Promise.all([listReportTemplates(token), listArchivedReportTemplates(token)])
      .then(([active, archived]) => {
        setTemplates(active);
        setArchivedTemplates(archived);
      })
      .catch((err) => setTemplatesError(errorMessage(err, "Failed to load report templates")));
  }, [token]);

  useEffect(() => {
    getLLMConfig(token)
      .then(setLlmConfig)
      .catch(() => setLlmConfig(null));
  }, [token]);

  useEffect(() => {
    if (!dataSourceId) return;
    let active = true;
    getDataSourceSchema(token, dataSourceId)
      .then((result) => {
        if (active) setSchema(result);
      })
      .catch((err) => {
        if (active) setSchemaError(errorMessage(err, "Failed to read the data source's schema"));
      });
    return () => {
      active = false;
    };
  }, [token, dataSourceId]);

  // The field mapping is only relevant once the schema confirms this is a
  // rest_api source — fetching it earlier would race the schema fetch and
  // fetching it for other source types would be wasted work. handleSourceChange
  // already clears fieldMapping on every source change, so there's nothing to
  // reset here when the type turns out not to be rest_api.
  useEffect(() => {
    if (!dataSourceId || schema?.type !== "rest_api") return;
    let active = true;
    getFieldMapping(token, dataSourceId)
      .then((result) => {
        if (active) setFieldMapping(result);
      })
      .catch((err) => {
        if (active) setFieldMappingError(errorMessage(err, "Failed to load the field mapping"));
      });
    return () => {
      active = false;
    };
  }, [token, dataSourceId, schema?.type]);

  const columnMeta = columnMetaFor(schema, spec.table ?? "", spec.joins ?? [], fieldMapping);
  const columns = columnMeta.map((c) => c.name);

  // needsAIProvider blocks saving before the request would fail: whichever
  // template is in play — the design being composed, or an already-saved one
  // just picked — is checked for an ai-summary block, which needs its owner
  // to have an LLM provider configured.
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const blocksInUse = customDraft ? customDraft.blocks : selectedTemplate?.blocks;
  const needsAIProvider = llmConfig === null && hasAISummaryBlock(blocksInUse);

  // Each step's validity gates the next: a table must be chosen before
  // querying it, a preview must succeed before picking a template, and a
  // template must be picked before publishing. maxUnlocked is the furthest
  // step reachable given what's true right now.
  const step1Valid =
    schema !== null &&
    (schema.type === "google_sheets" || schema.type === "rest_api" || (spec.table ?? "") !== "");
  const step2Valid = step1Valid && preview !== null;
  const step3Valid = step2Valid && templateId !== "";
  const maxUnlocked = step3Valid ? 4 : step2Valid ? 3 : step1Valid ? 2 : 1;

  // currentStep can point past maxUnlocked right after something upstream
  // changes (e.g. picking a new data source invalidates the preview) and the
  // render that reflects it hasn't happened yet. Deriving the displayed step
  // here, rather than syncing it back into state via an effect, keeps that
  // window from ever being rendered.
  const step = Math.min(currentStep, maxUnlocked);

  // A mapping only means something against a known set of columns, so it's
  // rebuilt whenever the preview's columns change.
  function applyTemplate(id: string, previewColumns: string[], rows: unknown[][]) {
    const template = templates.find((candidate) => candidate.id === id);
    setTemplateId(id);
    setTemplateConfig(
      template
        ? defaultTemplateConfig(template, previewColumns, numericColumns(previewColumns, rows), name)
        : {},
    );
    setLayout(null);
    setLayoutError(null);
    setCustomDraft(null);
  }

  function resetTemplateState() {
    setTemplateId("");
    setTemplateConfig({});
    setLayout(null);
    setLayoutError(null);
    setCustomDraft(null);
  }

  function openNewCustomTemplate() {
    setCustomDraft({ editingId: null, name: "", description: "", blocks: [], saving: false, error: null });
  }

  function openEditCustomTemplate(template: ReportTemplate) {
    setCustomDraft({
      editingId: template.id,
      name: template.name,
      description: template.description,
      blocks: template.blocks ?? [],
      saving: false,
      error: null,
    });
  }

  // saveCustomTemplate persists the design being built or reworked, then hands
  // off to the same slot-mapping flow every template goes through — saving
  // returns the design's declared slots, so nothing template-specific is
  // needed to pick those up.
  async function saveCustomTemplate() {
    if (!customDraft) return;
    setCustomDraft({ ...customDraft, saving: true, error: null });
    try {
      const input = { name: customDraft.name, description: customDraft.description, blocks: customDraft.blocks };
      const saved = customDraft.editingId === null
        ? await createCustomTemplate(token, input)
        : await updateCustomTemplate(token, customDraft.editingId, input);

      await loadTemplates();
      setCustomDraft(null);
      // Built directly from the save response rather than through
      // applyTemplate: the just-awaited loadTemplates() hasn't re-rendered
      // this closure's `templates` yet, so looking the new template up there
      // would still miss it.
      const previewColumns = preview?.columns ?? [];
      const previewRows = preview?.rows ?? [];
      setTemplateId(saved.id);
      setTemplateConfig(
        defaultTemplateConfig(
          { id: saved.id, name: saved.name, description: saved.description, slots: saved.slots, owned: true, archived: false },
          previewColumns,
          numericColumns(previewColumns, previewRows),
          name,
        ),
      );
      setLayout(null);
      setLayoutError(null);
    } catch (err) {
      setCustomDraft({ ...customDraft, saving: false, error: errorMessage(err, "Failed to save the design") });
    }
  }

  async function handleArchive(id: string) {
    setTemplatesError(null);
    try {
      await archiveReportTemplate(token, id);
      if (id === templateId) resetTemplateState();
      await loadTemplates();
    } catch (err) {
      setTemplatesError(errorMessage(err, "Failed to archive the template"));
    }
  }

  async function handleRestore(id: string) {
    setTemplatesError(null);
    try {
      await restoreReportTemplate(token, id);
      await loadTemplates();
    } catch (err) {
      setTemplatesError(errorMessage(err, "Failed to restore the template"));
    }
  }

  // A specification built against one source means nothing against another.
  // The schema is reset here, at the change itself, rather than in the effect
  // that fetches the new one — dataSourceId only ever changes through this
  // function, so the effect doesn't need to (and, as a set-state-in-effect
  // call, shouldn't) reset it again on the render that follows.
  function handleSourceChange(id: string) {
    setDataSourceId(id);
    setSchema(null);
    setSchemaError(null);
    setFieldMapping(null);
    setFieldMappingError(null);
    setSpec(emptyQuerySpec());
    setPreview(null);
    setPreviewError(null);
    setSaveError(null);
    setSaved(false);
    resetTemplateState();
  }

  async function handlePreview() {
    setPreviewError(null);
    setPreviewing(true);
    try {
      const result = await previewReport(token, dataSourceId, spec);
      setPreview(result);
      setLayout(null);
      // Changing the spec can change what the mapping refers to, so the
      // template is re-applied unless the columns came back identical.
      if (templateId === "" || preview === null || !sameColumns(preview.columns, result.columns)) {
        applyTemplate(templateId === "" ? (templates[0]?.id ?? "") : templateId,
          result.columns, result.rows);
      }
    } catch (err) {
      setPreview(null);
      setPreviewError(errorMessage(err, "Failed to run the query"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handlePreviewLayout() {
    setLayoutError(null);
    setRendering(true);
    try {
      setLayout(await previewReportTemplate(token, { dataSourceId, querySpec: spec, templateId, templateConfig }));
    } catch (err) {
      setLayout(null);
      setLayoutError(errorMessage(err, "Failed to render the template"));
    } finally {
      setRendering(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onCreate({ name, dataSourceId, prompt, querySpec: spec, templateId, templateConfig, formats });
      setName("");
      setPrompt("");
      setSpec(emptyQuerySpec());
      setPreview(null);
      setFormats(["pdf"]);
      resetTemplateState();
      setSaved(true);
      setCurrentStep(1);
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save the report"));
    } finally {
      setSaving(false);
    }
  }

  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted">
        Connect a data source before creating a report.
      </p>
    );
  }

  const canPreview =
    spec.fields.length > 0 &&
    (schema?.type === "google_sheets" || schema?.type === "rest_api" || (spec.table ?? "") !== "");

  const isSQL = schema !== null && schema.type !== "google_sheets" && schema.type !== "rest_api";

  return (
    <div className="grid w-full gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Steps steps={STEPS} current={step} maxUnlocked={maxUnlocked} onSelect={setCurrentStep} />
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        {saved && <Note kind="ok">Report saved. Start another one below, or head back to the list.</Note>}

        <p className="dw-hint border-l-2 border-accent pl-3">{STEP_LEAD[step]}</p>

      {step === 1 && (
        <div className="dw-in flex flex-col gap-5">
          <Field label="Data source" hint="Which connector this report reads its rows from.">
            <ChoiceCards
              columns={2}
              value={dataSourceId}
              onChange={handleSourceChange}
              options={sources.map((source) => ({
                value: source.id,
                label: source.name,
                description: source.type.replace("_", " "),
              }))}
            />
          </Field>

          {schemaError && <Note kind="error">{schemaError}</Note>}

          {schema === null && !schemaError && (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {isSQL && (
            <Field label="Table" hint="The report's starting table. You can join others onto it below.">
              <TablePicker
                tables={schema.tables ?? []}
                value={spec.table ?? ""}
                onChange={(table) => setSpec({ ...emptyQuerySpec(), table })}
              />
            </Field>
          )}

          <Field
            label="Description"
            htmlFor="report-prompt"
            optional
            hint="A note to yourself about what this report answers. It shows in the list."
          >
            <textarea
              id="report-prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Sum of sales by region for last month"
              className={inputClass}
            />
          </Field>

          {schema && schema.type !== "google_sheets" && schema.type !== "rest_api" && (spec.table ?? "") !== "" && (
            <JoinEditor
              schema={schema}
              table={spec.table ?? ""}
              joins={spec.joins ?? []}
              onChange={(joins) => setSpec({ ...spec, joins })}
            />
          )}
        </div>
      )}

      {step === 2 && schema && (
        <div className="flex flex-col gap-4">
          {schema.type === "rest_api" && (
            <div className="flex flex-col gap-2 rounded-md border border-line p-4">
              <div>
                <h3 className="text-sm font-medium">Map API fields to system fields</h3>
                <p className="text-sm text-muted">
                  Connect this source&apos;s detected fields to DocuWave&apos;s system fields — only mapped
                  fields can be picked below.
                </p>
              </div>
              <DataSourceFieldMappingPanel
                key={dataSourceId}
                token={token}
                dataSourceId={dataSourceId}
                onMappingChange={(mapping) =>
                  setFieldMapping((prev) => (prev ? { ...prev, mapping } : prev))
                }
              />
              {fieldMappingError && <p className="text-sm text-danger">{fieldMappingError}</p>}
            </div>
          )}

          {columns.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FieldPicker
                  tableLabel={
                    schema.type === "google_sheets"
                      ? "sheet"
                      : [spec.table, ...(spec.joins ?? []).map((j) => j.table)].filter(Boolean).join(", ")
                  }
                  columns={columnMeta}
                  fields={spec.fields}
                  onChange={(fields) => setSpec({ ...spec, fields })}
                />
                <FieldOrderPanel fields={spec.fields} onChange={(fields) => setSpec({ ...spec, fields })} />
              </div>
              <FilterEditor
                columns={columns}
                filters={spec.filters ?? []}
                onChange={(filters) => setSpec({ ...spec, filters })}
              />
              <SortEditor columns={columns} sorts={spec.sorts ?? []} onChange={(sorts) => setSpec({ ...spec, sorts })} />
              <PlaceholderFilterEditor
                columns={columns}
                filters={spec.placeholderFilters ?? []}
                onChange={(placeholderFilters) => setSpec({ ...spec, placeholderFilters })}
              />
              <div className="flex flex-col gap-1">
                <label htmlFor="report-limit" className="text-sm font-medium">
                  Row limit
                </label>
                <input
                  id="report-limit"
                  type="number"
                  min={1}
                  value={spec.limit ?? ""}
                  onChange={(e) => setSpec({ ...spec, limit: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="1000 (default)"
                  className={`${inputClass} w-40`}
                />
              </div>
            </>
          )}

          {/* Running the preview is what unlocks the rest of the wizard, so
              it gets its own strip rather than being one more button. */}
          <div className="dw-card flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="dw-h2">Run a preview</p>
              <p className="dw-hint mt-0.5">
                {canPreview
                  ? "Fetches the first rows so you can check the result before designing the layout."
                  : "Pick at least one column above first."}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !canPreview}
              className="dw-btn dw-btn-primary"
            >
              {previewing ? (
                <span className="animate-spin">
                  <Icon.Refresh size={13} />
                </span>
              ) : (
                <Icon.Play size={13} />
              )}
              {previewing ? "Running…" : preview ? "Run again" : "Run preview"}
            </button>
          </div>

          {previewError && <Note kind="error">{previewError}</Note>}
          {preview && (
            <div className="dw-in flex flex-col gap-2">
              <QueryPreviewTable preview={preview} />
              <Disclosure summary="Compiled query" right={<CopyButton value={preview.sql} />}>
                <pre className="dw-well dw-mono overflow-x-auto px-3 py-2 whitespace-pre-wrap">
                  {preview.sql}
                </pre>
              </Disclosure>
            </div>
          )}
        </div>
      )}

      {step === 3 && schema && (
        <div className="dw-in flex flex-col gap-4">
          {templatesError && <Note kind="error">{templatesError}</Note>}

          {preview && (
            <TemplatePicker
              templates={templates}
              archivedTemplates={archivedTemplates}
              columns={preview.columns}
              rows={preview.rows}
              templateId={templateId}
              config={templateConfig}
              onSelect={(id) => applyTemplate(id, preview.columns, preview.rows)}
              onConfigChange={setTemplateConfig}
              customDraft={customDraft}
              onOpenNewCustomTemplate={openNewCustomTemplate}
              onOpenEditCustomTemplate={openEditCustomTemplate}
              onCustomDraftChange={setCustomDraft}
              onSaveCustomTemplate={saveCustomTemplate}
              onCancelCustomTemplate={() => setCustomDraft(null)}
              onArchive={handleArchive}
              onRestore={handleRestore}
              token={token}
              schema={schema}
              dataSourceId={dataSourceId}
              querySpec={spec}
            />
          )}

          {needsAIProvider && (
            <Note kind="warn">
              This template uses an AI summary block, which needs an AI provider. Add a key in
              Settings before saving this report.
            </Note>
          )}

          <div className="dw-card flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="dw-h2">See the finished page</p>
              <p className="dw-hint mt-0.5">Renders the real layout with the rows you previewed.</p>
            </div>
            <button
              type="button"
              onClick={handlePreviewLayout}
              disabled={rendering || templateId === ""}
              className="dw-btn"
            >
              {rendering ? (
                <span className="animate-spin">
                  <Icon.Refresh size={13} />
                </span>
              ) : (
                <Icon.Play size={13} />
              )}
              {rendering ? "Rendering…" : "Preview layout"}
            </button>
          </div>

          {layoutError && <Note kind="error">{layoutError}</Note>}
          {layout !== null && (
            <iframe
              title="Report layout preview"
              srcDoc={layout}
              // The document is the user's own data rendered by the server;
              // an empty sandbox keeps it from doing anything but display.
              sandbox=""
              className="dw-in h-[30rem] w-full rounded-md border border-line bg-white"
            />
          )}
        </div>
      )}

      {step === 4 && (
        <div className="dw-in flex flex-col gap-5">
          <Field label="Report name" htmlFor="report-name" hint="How it appears in your report list.">
            <input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Monthly sales by region"
              className={inputClass}
            />
          </Field>

          <FormatPicker formats={formats} onChange={setFormats} />

          {/* A last read-back of what's about to be saved, so publishing
              isn't a leap of faith three steps after the choices were made. */}
          <div className="dw-well flex flex-col gap-1.5 px-4 py-3">
            <p className="dw-eyebrow">Summary</p>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Source</dt>
              <dd className="truncate">{sources.find((s) => s.id === dataSourceId)?.name}</dd>
              <dt className="text-muted">Columns</dt>
              <dd>{spec.fields.length}</dd>
              <dt className="text-muted">Preview rows</dt>
              <dd className="tabular-nums">{preview?.rows.length ?? 0}</dd>
              <dt className="text-muted">Layout</dt>
              <dd className="truncate">{templates.find((t) => t.id === templateId)?.name ?? "—"}</dd>
            </dl>
          </div>

          {saveError && <Note kind="error">{saveError}</Note>}
        </div>
      )}

      {/* The footer stays put while a step scrolls, so the way forward is
          always in the same place. */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-bg py-3">
        <button
          type="button"
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="dw-btn"
        >
          <Icon.ArrowLeft size={14} />
          Back
        </button>

        {step < 4 ? (
          <div className="flex items-center gap-3">
            {step >= maxUnlocked && (
              <span className="dw-hint hidden sm:block">
                {step === 1
                  ? "Choose a table to continue"
                  : step === 2
                    ? "Run a preview to continue"
                    : "Pick a layout to continue"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
              disabled={step >= maxUnlocked}
              className="dw-btn dw-btn-primary"
            >
              Next
              <Icon.ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              name.trim() === "" ||
              preview === null ||
              templateId === "" ||
              formats.length === 0 ||
              needsAIProvider
            }
            className="dw-btn dw-btn-primary"
          >
            {saving ? "Saving…" : "Save report"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
