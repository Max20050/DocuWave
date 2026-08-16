"use client";

import { useEffect, useState } from "react";
import {
  AGGREGATES,
  OPERATORS,
  REPORT_FORMATS,
  emptyQuerySpec,
  getDataSourceSchema,
  listReportTemplates,
  previewReport,
  previewReportTemplate,
  type Aggregate,
  type DataSource,
  type DataSourceSchema,
  type Operator,
  type OperatorArity,
  type PlaceholderFilter,
  type QueryField,
  type QueryFilter,
  type QueryPreview,
  type QuerySort,
  type QuerySpec,
  type ReportFormat,
  type ReportInput,
  type ReportTemplate,
  type TemplateConfig,
} from "@/lib/api";
import { QueryPreviewTable } from "@/app/ui/query-preview-table";
import {
  TemplatePicker,
  defaultTemplateConfig,
  numericColumns,
} from "@/app/ui/template-picker";

const inputClass = "rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black";
const smallInputClass = `${inputClass} py-1 text-sm`;
const removeButtonClass =
  "rounded border border-black/[.1] px-2 py-1 text-xs transition-colors hover:bg-black/[.04] dark:border-white/[.15] dark:hover:bg-[#1a1a1a]";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

// columnsFor reads the columns a data source's schema makes available: a
// table's own columns for SQL sources, the sheet's header fields for Google
// Sheets, which report an empty table.
function columnsFor(schema: DataSourceSchema | null, table: string): string[] {
  if (!schema) return [];
  if (schema.type === "google_sheets") return schema.fields ?? [];
  return schema.tables?.find((candidate) => candidate.name === table)?.columns.map((c) => c.name) ?? [];
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
              <span className="text-zinc-600 dark:text-zinc-400">{option.description}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// FieldEditor builds the Fields part of a query specification: which columns
// come back, optionally aggregated.
function FieldEditor({
  columns,
  fields,
  onChange,
}: {
  columns: string[];
  fields: QueryField[];
  onChange: (fields: QueryField[]) => void;
}) {
  function update(index: number, field: QueryField) {
    onChange(fields.map((f, i) => (i === index ? field : f)));
  }
  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...fields, { column: columns[0] ?? "", aggregate: "" }]);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Fields</legend>
      {fields.map((field, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={field.aggregate === "count" ? "" : field.column}
            onChange={(e) => update(index, { ...field, column: e.target.value })}
            disabled={field.aggregate === "count"}
            className={smallInputClass}
          >
            {field.aggregate === "count" && <option value="">(all rows)</option>}
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <select
            value={field.aggregate ?? ""}
            onChange={(e) => {
              const aggregate = e.target.value as Aggregate;
              update(index, {
                ...field,
                aggregate,
                column: aggregate === "count" ? "" : field.column || columns[0] || "",
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
        </div>
      ))}
      <div>
        <button type="button" onClick={add} disabled={columns.length === 0} className={removeButtonClass}>
          Add field
        </button>
      </div>
    </fieldset>
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
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Filters filled in from the recipient a report is sent to, once that's set up — not from a
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
  const [spec, setSpec] = useState<QuerySpec>(emptyQuerySpec());
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<QueryPreview | null>(null);
  const [name, setName] = useState("");

  // A report is a PDF unless the user says otherwise, which is what a report
  // was before it could be anything else.
  const [formats, setFormats] = useState<ReportFormat[]>(["pdf"]);

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({});
  const [layout, setLayout] = useState<string | null>(null);

  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listReportTemplates(token)
      .then(setTemplates)
      .catch((err) => setTemplatesError(errorMessage(err, "Failed to load report templates")));
  }, [token]);

  useEffect(() => {
    if (!dataSourceId) return;
    let active = true;
    setSchema(null);
    setSchemaError(null);
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

  const columns = columnsFor(schema, spec.table ?? "");

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
  }

  function resetTemplateState() {
    setTemplateId("");
    setTemplateConfig({});
    setLayout(null);
    setLayoutError(null);
  }

  // A specification built against one source means nothing against another.
  function handleSourceChange(id: string) {
    setDataSourceId(id);
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
    } catch (err) {
      setSaveError(errorMessage(err, "Failed to save the report"));
    } finally {
      setSaving(false);
    }
  }

  if (sources.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Connect a data source before creating a report.
      </p>
    );
  }

  const canPreview = spec.fields.length > 0 && (schema?.type === "google_sheets" || (spec.table ?? "") !== "");

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="report-source" className="text-sm font-medium">
          Data source
        </label>
        <select
          id="report-source"
          value={dataSourceId}
          onChange={(e) => handleSourceChange(e.target.value)}
          className={inputClass}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="report-prompt" className="text-sm font-medium">
          Description (optional)
        </label>
        <textarea
          id="report-prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Sum of sales by region for last month"
          className={inputClass}
        />
      </div>

      {schemaError && <p className="text-sm text-red-600">{schemaError}</p>}

      {schema && (
        <div className="flex flex-col gap-4 border-t border-black/[.1] pt-4 dark:border-white/[.15]">
          {schema.type !== "google_sheets" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="report-table" className="text-sm font-medium">
                Table
              </label>
              <select
                id="report-table"
                value={spec.table ?? ""}
                onChange={(e) => setSpec({ ...emptyQuerySpec(), table: e.target.value })}
                className={inputClass}
              >
                <option value="">Select a table…</option>
                {(schema.tables ?? []).map((table) => (
                  <option key={table.name} value={table.name}>
                    {table.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {columns.length > 0 && (
            <>
              <FieldEditor columns={columns} fields={spec.fields} onChange={(fields) => setSpec({ ...spec, fields })} />
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

          <div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !canPreview}
              className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {previewing ? "Running…" : "Run preview"}
            </button>
          </div>
          {previewError && <p className="text-sm text-red-600">{previewError}</p>}
          {preview && (
            <>
              <QueryPreviewTable preview={preview} />
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{preview.sql}</p>
            </>
          )}

          {templatesError && <p className="text-sm text-red-600">{templatesError}</p>}

          {preview === null ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Run the preview to choose a template and map its fields.
            </p>
          ) : (
            <div className="flex flex-col gap-4 border-t border-black/[.1] pt-4 dark:border-white/[.15]">
              <TemplatePicker
                templates={templates}
                columns={preview.columns}
                rows={preview.rows}
                templateId={templateId}
                config={templateConfig}
                onSelect={(id) => applyTemplate(id, preview.columns, preview.rows)}
                onConfigChange={setTemplateConfig}
              />

              <div>
                <button
                  type="button"
                  onClick={handlePreviewLayout}
                  disabled={rendering || templateId === ""}
                  className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  {rendering ? "Rendering…" : "Preview layout"}
                </button>
              </div>
              {layoutError && <p className="text-sm text-red-600">{layoutError}</p>}
              {layout !== null && (
                <iframe
                  title="Report layout preview"
                  srcDoc={layout}
                  // The document is the user's own data rendered by the server;
                  // an empty sandbox keeps it from doing anything but display.
                  sandbox=""
                  className="h-96 w-full rounded border border-black/[.1] dark:border-white/[.15]"
                />
              )}
            </div>
          )}

          <FormatPicker formats={formats} onChange={setFormats} />

          <div className="flex flex-col gap-1">
            <label htmlFor="report-name" className="text-sm font-medium">
              Report name
            </label>
            <input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                name.trim() === "" ||
                preview === null ||
                templateId === "" ||
                formats.length === 0
              }
              className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {saving ? "Saving…" : "Save report"}
            </button>
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>
      )}
      {saved && <p className="text-sm text-green-600">Report saved</p>}
    </div>
  );
}
