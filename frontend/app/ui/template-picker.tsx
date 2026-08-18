"use client";

import { useState } from "react";
import { CUSTOM_BLOCK_KINDS, type CustomBlock, type CustomBlockKind, type ReportTemplate, type TemplateConfig, type TemplateSlot } from "@/lib/api";

const inputClass = "rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black";
const chipButtonClass =
  "rounded border border-black/[.1] px-2 py-0.5 text-xs transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.15] dark:hover:bg-[#1a1a1a]";
const smallButtonClass =
  "rounded border border-black/[.1] px-3 py-1.5 text-xs transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.15] dark:hover:bg-[#1a1a1a]";

// BUILD_YOUR_OWN_ID is the sentinel the picker uses for the "Build my own
// design" card, which isn't a real template until the user saves a design.
export const BUILD_YOUR_OWN_ID = "__build_your_own__";

// newBlockId gives a fresh block a client-side identity before it's ever
// saved. The server assigns its own stable ID once the design is saved
// (backend/internal/template/blocks.go's PrepareBlocks) — this one only has
// to be unique long enough to key React list items and reorder controls.
function newBlockId(): string {
  return `draft_${Math.random().toString(36).slice(2)}`;
}

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

// CustomTemplateDraft is the block composition a user is building or
// reworking, before or after it's been saved as a real custom template.
export type CustomTemplateDraft = {
  // editingId is the custom template's ID when reworking a saved design from
  // within a report that uses it, or null when composing a brand new one.
  editingId: string | null;
  name: string;
  description: string;
  blocks: CustomBlock[];
  saving: boolean;
  error: string | null;
};

// TemplatePicker lets the user choose the template a report renders through,
// map their query's output columns onto its slots, compose a custom design
// from the block catalog, and archive or restore templates (built-in or
// custom) from a collapsible section — all without leaving the report-
// creation flow.
export function TemplatePicker({
  templates,
  archivedTemplates,
  columns,
  rows,
  templateId,
  config,
  onSelect,
  onConfigChange,
  customDraft,
  onOpenNewCustomTemplate,
  onOpenEditCustomTemplate,
  onCustomDraftChange,
  onSaveCustomTemplate,
  onCancelCustomTemplate,
  onArchive,
  onRestore,
}: {
  templates: ReportTemplate[];
  archivedTemplates: ReportTemplate[];
  columns: string[];
  rows: unknown[][];
  templateId: string;
  config: TemplateConfig;
  onSelect: (templateId: string) => void;
  onConfigChange: (config: TemplateConfig) => void;
  customDraft: CustomTemplateDraft | null;
  onOpenNewCustomTemplate: () => void;
  onOpenEditCustomTemplate: (template: ReportTemplate) => void;
  onCustomDraftChange: (draft: CustomTemplateDraft) => void;
  onSaveCustomTemplate: () => void;
  onCancelCustomTemplate: () => void;
  onArchive: (templateId: string) => void;
  onRestore: (templateId: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const selected = templates.find((template) => template.id === templateId);
  const numeric = numericColumns(columns, rows);
  const buildingNew = customDraft !== null && customDraft.editingId === null;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Template</legend>
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-start gap-3 rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15]"
          >
            <label className="flex flex-1 cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="report-template"
                value={template.id}
                checked={template.id === templateId && customDraft === null}
                onChange={() => onSelect(template.id)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">
                  {template.name}
                  {template.owned && (
                    <span className="ml-2 rounded bg-black/[.06] px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-zinc-600 dark:bg-white/[.1] dark:text-zinc-400">
                      Mine
                    </span>
                  )}
                </span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                  {template.description}
                </span>
              </span>
            </label>
            <span className="flex shrink-0 gap-1">
              {template.owned && (
                <button
                  type="button"
                  onClick={() => onOpenEditCustomTemplate(template)}
                  className={chipButtonClass}
                >
                  Rework design
                </button>
              )}
              <button type="button" onClick={() => onArchive(template.id)} className={chipButtonClass}>
                Archive
              </button>
            </span>
          </div>
        ))}

        <label
          className={`flex cursor-pointer items-start gap-3 rounded border border-dashed px-3 py-2 ${
            buildingNew
              ? "border-black/[.3] dark:border-white/[.4]"
              : "border-black/[.2] dark:border-white/[.25]"
          }`}
        >
          <input
            type="radio"
            name="report-template"
            value={BUILD_YOUR_OWN_ID}
            checked={buildingNew}
            onChange={onOpenNewCustomTemplate}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">Build my own design</span>
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">
              Compose a layout from tables, grouped totals, KPI tiles, and text blocks — save it to
              reuse on future reports.
            </span>
          </span>
        </label>
      </fieldset>

      {customDraft && (
        <CustomTemplateBuilder
          draft={customDraft}
          onChange={onCustomDraftChange}
          onSave={onSaveCustomTemplate}
          onCancel={onCancelCustomTemplate}
        />
      )}

      {!customDraft && selected && (
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

      <div className="flex flex-col gap-2 border-t border-black/[.1] pt-3 dark:border-white/[.15]">
        <button
          type="button"
          onClick={() => setShowArchived((open) => !open)}
          className="self-start text-sm text-zinc-600 underline decoration-dotted hover:text-foreground dark:text-zinc-400"
        >
          {showArchived ? "Hide archived" : "Show archived"}
          {archivedTemplates.length > 0 ? ` (${archivedTemplates.length})` : ""}
        </button>
        {showArchived && (
          <div className="flex flex-col gap-2">
            {archivedTemplates.length === 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">No archived templates.</p>
            )}
            {archivedTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-start gap-3 rounded border border-black/[.1] px-3 py-2 opacity-70 dark:border-white/[.15]"
              >
                <span className="flex-1">
                  <span className="block text-sm font-medium">
                    {template.name}
                    {template.owned && (
                      <span className="ml-2 rounded bg-black/[.06] px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-zinc-600 dark:bg-white/[.1] dark:text-zinc-400">
                        Mine
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                    {template.description}
                  </span>
                </span>
                <button type="button" onClick={() => onRestore(template.id)} className={chipButtonClass}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// CustomTemplateBuilder is the block-composition editor: add/remove/reorder
// blocks with up/down buttons (no drag-and-drop), give each one a title, and
// save the design as a named, reusable template. Column mapping happens
// afterward, through the same slot-driven UI every template uses — saving
// returns the design's declared slots, so the picker's existing mapping
// controls pick it up with no template-specific code.
function CustomTemplateBuilder({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: CustomTemplateDraft;
  onChange: (draft: CustomTemplateDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function setBlocks(blocks: CustomBlock[]) {
    onChange({ ...draft, blocks });
  }

  function addBlock(kind: CustomBlockKind) {
    setBlocks([
      ...draft.blocks,
      { id: newBlockId(), kind, title: "", note: kind === "text" ? "" : undefined },
    ]);
  }
  function updateBlock(index: number, block: CustomBlock) {
    setBlocks(draft.blocks.map((b, i) => (i === index ? block : b)));
  }
  function removeBlock(index: number) {
    setBlocks(draft.blocks.filter((_, i) => i !== index));
  }
  function moveBlock(index: number, by: number) {
    const next = [...draft.blocks];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setBlocks(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-black/[.1] p-3 dark:border-white/[.15]">
      <div className="flex flex-col gap-1">
        <label htmlFor="custom-template-name" className="text-sm font-medium">
          Design name
        </label>
        <input
          id="custom-template-name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Sales overview"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="custom-template-description" className="text-sm font-medium">
          Description (optional)
        </label>
        <input
          id="custom-template-description"
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Blocks</p>
        {draft.blocks.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Add a block to start composing your design.
          </p>
        )}
        {draft.blocks.length > 0 && (
          <ol className="flex flex-col gap-2">
            {draft.blocks.map((block, index) => (
              <li
                key={block.id}
                className="flex flex-col gap-2 rounded border border-black/[.1] p-2 dark:border-white/[.15]"
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-black/[.06] px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-600 dark:bg-white/[.1] dark:text-zinc-400">
                    {CUSTOM_BLOCK_KINDS.find((k) => k.value === block.kind)?.label ?? block.kind}
                  </span>
                  <input
                    value={block.title}
                    onChange={(e) => updateBlock(index, { ...block, title: e.target.value })}
                    placeholder="Block title"
                    aria-label={`Block ${index + 1} title`}
                    className={`${inputClass} flex-1 py-1 text-sm`}
                  />
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => moveBlock(index, -1)}
                      disabled={index === 0}
                      aria-label="Move block up"
                      className={chipButtonClass}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(index, 1)}
                      disabled={index === draft.blocks.length - 1}
                      aria-label="Move block down"
                      className={chipButtonClass}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      aria-label="Remove block"
                      className={chipButtonClass}
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {block.kind === "text" && (
                  <textarea
                    value={block.note ?? ""}
                    onChange={(e) => updateBlock(index, { ...block, note: e.target.value })}
                    placeholder="Note text"
                    rows={2}
                    className={`${inputClass} text-sm`}
                  />
                )}
              </li>
            ))}
          </ol>
        )}

        <AddBlockControl onAdd={addBlock} />
      </div>

      {draft.error && <p className="text-sm text-red-600">{draft.error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={draft.saving || draft.name.trim() === ""}
          className="rounded-full bg-foreground px-4 py-1.5 text-xs text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {draft.saving ? "Saving…" : draft.editingId === null ? "Save design" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className={smallButtonClass}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddBlockControl({ onAdd }: { onAdd: (kind: CustomBlockKind) => void }) {
  const [kind, setKind] = useState<CustomBlockKind>("table");
  return (
    <div className="flex items-center gap-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as CustomBlockKind)}
        aria-label="Block type"
        className={`${inputClass} py-1 text-sm`}
      >
        {CUSTOM_BLOCK_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd(kind)} className={smallButtonClass}>
        Add block
      </button>
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
