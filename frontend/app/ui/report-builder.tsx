"use client";

import { useState } from "react";
import {
  generateReportQuery,
  previewReportQuery,
  type DataSource,
  type QueryPreview,
  type ReportInput,
} from "@/lib/api";
import { QueryPreviewTable } from "@/app/ui/query-preview-table";

const inputClass = "rounded border border-black/[.1] px-3 py-2 dark:border-white/[.15] dark:bg-black";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ReportBuilder walks the user from a natural language description to a saved
// report: describe it, review the query the LLM wrote, preview the rows it
// returns, then save. The query stays editable throughout — the model's answer
// is a starting point, not the final word.
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

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

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
      setPreview(await previewReportQuery(token, dataSourceId, query));
    } catch (err) {
      setPreview(null);
      setPreviewError(errorMessage(err, "Failed to run the query"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onCreate({ name, dataSourceId, prompt, query });
      setName("");
      setPrompt("");
      setQuery("");
      setDialect("");
      setPreview(null);
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
              disabled={saving || name.trim() === "" || query.trim() === ""}
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
