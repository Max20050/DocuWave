"use client";

import type { ReportTemplate, TemplateConfig, TemplateSlot } from "@/lib/api";

const inputClass = "rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black";
const chipButtonClass =
  "rounded border border-black/[.1] px-2 py-0.5 text-xs transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.15] dark:hover:bg-[#1a1a1a]";

// numericColumns reports which of the query's columns hold numbers, using the
// same rule the renderer does: every value present has to read as a number, and
// text a source formatted itself ("1,234.50") still counts.
export function numericColumns(columns: string[], rows: unknown[][]): string[] {
  return columns.filter((_, index) => {
    let found = false;
    for (const row of rows) {
      const value = row[index];
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        const cleaned = value.trim().replace(/^[$€£]/, "").replaceAll(",", "");
        if (cleaned === "") continue;
        if (!Number.isFinite(Number(cleaned))) return false;
      } else if (typeof value !== "number") {
        return false;
      }
      found = true;
    }
    return found;
  });
}

// defaultTemplateConfig fills a freshly picked template in so the preview shows
// a finished report immediately; every choice stays editable.
export function defaultTemplateConfig(
  template: ReportTemplate,
  columns: string[],
  numeric: string[],
  title: string,
): TemplateConfig {
  const config: TemplateConfig = { columns: {}, text: {} };
  const taken = new Set<string>();

  for (const slot of template.slots) {
    if (slot.kind === "text") {
      if (slot.key === "title" && title !== "") {
        config.text = { ...config.text, [slot.key]: title };
      }
      continue;
    }
    if (!slot.required) continue;

    if (slot.kind === "column") {
      // A grouping column is a label, so prefer one that isn't a measure.
      const pick = columns.find((column) => !numeric.includes(column)) ?? columns[0];
      if (pick !== undefined) {
        config.columns = { ...config.columns, [slot.key]: [pick] };
        taken.add(pick);
      }
      continue;
    }

    const pool = slot.numeric && numeric.length > 0 ? numeric : columns;
    config.columns = { ...config.columns, [slot.key]: pool.filter((column) => !taken.has(column)) };
  }

  return config;
}

function withColumns(config: TemplateConfig, key: string, columns: string[]): TemplateConfig {
  return { ...config, columns: { ...config.columns, [key]: columns } };
}

function withText(config: TemplateConfig, key: string, value: string): TemplateConfig {
  return { ...config, text: { ...config.text, [key]: value } };
}

// TemplatePicker lets the user choose the template a report renders through and
// map their query's output columns onto its slots.
export function TemplatePicker({
  templates,
  columns,
  rows,
  templateId,
  config,
  onSelect,
  onConfigChange,
}: {
  templates: ReportTemplate[];
  columns: string[];
  rows: unknown[][];
  templateId: string;
  config: TemplateConfig;
  onSelect: (templateId: string) => void;
  onConfigChange: (config: TemplateConfig) => void;
}) {
  const selected = templates.find((template) => template.id === templateId);
  const numeric = numericColumns(columns, rows);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Template</legend>
        {templates.map((template) => (
          <label
            key={template.id}
            className="flex cursor-pointer items-start gap-3 rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15]"
          >
            <input
              type="radio"
              name="report-template"
              value={template.id}
              checked={template.id === templateId}
              onChange={() => onSelect(template.id)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{template.name}</span>
              <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                {template.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {selected && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium">Field mapping</p>
          {selected.slots.map((slot) => (
            <SlotControl
              key={slot.key}
              slot={slot}
              columns={slot.numeric ? preferred(columns, numeric) : columns}
              config={config}
              onConfigChange={onConfigChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// preferred puts the columns a slot is meant for first, without hiding the rest:
// whether a column holds numbers is a guess from preview rows, not a fact.
function preferred(columns: string[], first: string[]): string[] {
  return [...first, ...columns.filter((column) => !first.includes(column))];
}

function SlotControl({
  slot,
  columns,
  config,
  onConfigChange,
}: {
  slot: TemplateSlot;
  columns: string[];
  config: TemplateConfig;
  onConfigChange: (config: TemplateConfig) => void;
}) {
  const controlId = `slot-${slot.key}`;
  const mapped = config.columns?.[slot.key] ?? [];

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={controlId} className="text-sm font-medium">
        {slot.label}
        {!slot.required && <span className="font-normal text-zinc-500"> · optional</span>}
      </label>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{slot.description}</p>

      {slot.kind === "text" && (
        <input
          id={controlId}
          value={config.text?.[slot.key] ?? ""}
          onChange={(e) => onConfigChange(withText(config, slot.key, e.target.value))}
          className={inputClass}
        />
      )}

      {slot.kind === "column" && (
        <select
          id={controlId}
          value={mapped[0] ?? ""}
          onChange={(e) =>
            onConfigChange(
              withColumns(config, slot.key, e.target.value === "" ? [] : [e.target.value]),
            )
          }
          className={inputClass}
        >
          <option value="">Choose a column…</option>
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      )}

      {slot.kind === "columns" && (
        <ColumnListControl
          controlId={controlId}
          columns={columns}
          mapped={mapped}
          onChange={(next) => onConfigChange(withColumns(config, slot.key, next))}
        />
      )}
    </div>
  );
}

// ColumnListControl maps an ordered list of columns onto one slot: the order
// here is the order they print in, so each mapped column can be moved or removed.
function ColumnListControl({
  controlId,
  columns,
  mapped,
  onChange,
}: {
  controlId: string;
  columns: string[];
  mapped: string[];
  onChange: (columns: string[]) => void;
}) {
  const available = columns.filter((column) => !mapped.includes(column));

  function move(index: number, by: number) {
    const next = [...mapped];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {mapped.length > 0 && (
        <ol className="flex flex-col gap-1">
          {mapped.map((column, index) => (
            <li
              key={column}
              className="flex items-center justify-between gap-2 rounded border border-black/[.1] px-3 py-1.5 dark:border-white/[.15]"
            >
              <span className="font-mono text-xs">{column}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${column} up`}
                  className={chipButtonClass}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === mapped.length - 1}
                  aria-label={`Move ${column} down`}
                  className={chipButtonClass}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(mapped.filter((name) => name !== column))}
                  aria-label={`Remove ${column}`}
                  className={chipButtonClass}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 && (
        <select
          id={controlId}
          value=""
          onChange={(e) => onChange([...mapped, e.target.value])}
          className={inputClass}
        >
          <option value="">Add a column…</option>
          {available.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
