"use client";

import { useEffect, useState } from "react";
import {
  generateReportQuery,
  listReportTemplates,
  previewReportQuery,
  previewReportTemplate,
  type DataSource,
  type QueryPreview,
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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

// ReportBuilder walks the user from a natural language description to a saved
// report: describe it, review the query the LLM wrote, preview the rows it
// returns, pick the template it prints in and map the columns onto that
// template's slots, then save. The query stays editable throughout — the
// model's answer is a starting point, not the final word.
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
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [dialect, setDialect] = useState("");
  const [preview, setPreview] = useState<QueryPreview | null>(null);
  const [name, setName] = useState("");

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({});
  const [layout, setLayout] = useState<string | null>(null);

  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listReportTemplates(token)
      .then(setTemplates)
      .catch((err) => setTemplatesError(errorMessage(err, "Failed to load report templates")));
  }, [token]);

  // A mapping only means something against a known set of columns, so it's
  // rebuilt whenever the preview's columns change.
  function applyTemplate(id: string, columns: string[], rows: unknown[][]) {
    const template = templates.find((candidate) => candidate.id === id);
    setTemplateId(id);
    setTemplateConfig(
      template ? defaultTemplateConfig(template, columns, numericColumns(columns, rows), name) : {},
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

  // A query written against one source means nothing against another.
  function handleSourceChange(id: string) {
    setDataSourceId(id);
    setQuery("");
    setDialect("");
    setPreview(null);
    setGenerateError(null);
    setPreviewError(null);
    setSaveError(null);
    setSaved(false);
    resetTemplateState();
  }

  async function handleGenerate() {
    setGenerateError(null);
    setPreviewError(null);
    setPreview(null);
    setSaved(false);
    setGenerating(true);
    try {
      const generated = await generateReportQuery(token, dataSourceId, prompt);
      setQuery(generated.query);
      setDialect(generated.dialect);
    } catch (err) {
      setGenerateError(errorMessage(err, "Failed to generate a query"));
    } finally {
      setGenerating(false);
    }
  }

  async function handlePreview() {
    setPreviewError(null);
    setPreviewing(true);
    try {
      const result = await previewReportQuery(token, dataSourceId, query);
      setPreview(result);
      setLayout(null);
      // Editing the query can change what the mapping refers to, so the
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
      setLayout(await previewReportTemplate(token, { dataSourceId, query, templateId, templateConfig }));
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
      await onCreate({ name, dataSourceId, prompt, query, templateId, templateConfig });
      setName("");
      setPrompt("");
      setQuery("");
      setDialect("");
      setPreview(null);
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
          What should this report show?
        </label>
        <textarea
          id="report-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Sum of sales by region for last month"
          className={inputClass}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !dataSourceId || prompt.trim() === ""}
          className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {generating ? "Generating…" : "Generate query"}
        </button>
      </div>
      {generateError && <p className="text-sm text-red-600">{generateError}</p>}

      {query !== "" && (
        <div className="flex flex-col gap-4 border-t border-black/[.1] pt-4 dark:border-white/[.15]">
          <div className="flex flex-col gap-1">
            <label htmlFor="report-query" className="text-sm font-medium">
              Generated query{dialect && <span className="font-normal text-zinc-500"> · {dialect}</span>}
            </label>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Review it before saving — you can edit it here.
            </p>
            <textarea
              id="report-query"
              rows={6}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || query.trim() === ""}
              className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              {previewing ? "Running…" : "Run preview"}
            </button>
          </div>
          {previewError && <p className="text-sm text-red-600">{previewError}</p>}
          {preview && <QueryPreviewTable preview={preview} />}

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
              disabled={saving || name.trim() === "" || query.trim() === "" || templateId === ""}
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
