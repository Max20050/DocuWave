"use client";

import type { QueryPreview } from "@/lib/api";

// formatCell renders whatever the data source returned. Values arrive as raw
// JSON, so anything that isn't a primitive is shown as its JSON text rather
// than as "[object Object]".
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// QueryPreviewTable shows the first rows a generated query returned, so the
// user can judge the query before saving the report.
export function QueryPreviewTable({ preview }: { preview: QueryPreview }) {
  if (preview.columns.length === 0) {
    return <p className="dw-hint">The query returned no columns.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="dw-card max-h-80 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          {/* The header stays put while a wide result scrolls, so a column
              five screens down still has a name. */}
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {preview.columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  className="border-b border-line px-3 py-2 text-xs font-medium whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="transition-colors hover:bg-surface-2">
                {preview.columns.map((_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="dw-mono border-b border-line px-3 py-1.5 whitespace-nowrap"
                  >
                    {formatCell(row[cellIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dw-hint">
        {preview.rows.length === 0
          ? "The query returned no rows."
          : `${preview.rows.length} row${preview.rows.length === 1 ? "" : "s"}${
              preview.truncated ? " · preview truncated" : ""
            } · ${preview.columns.length} columns`}
      </p>
    </div>
  );
}
