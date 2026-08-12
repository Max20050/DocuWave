"use client";

import { useEffect, useState } from "react";
import { getDataSourceSchema, type DataSourceSchema } from "@/lib/api";

// DataSourceSchemaView loads and shows the structure of the selected data
// source: tables and columns for SQL, header fields for Google Sheets.
export function DataSourceSchemaView({
  token,
  dataSourceId,
}: {
  token: string;
  dataSourceId: string;
}) {
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Callers key this component by data source id, so a different source
  // remounts it rather than reusing the previous source's state.
  useEffect(() => {
    let active = true;

    getDataSourceSchema(token, dataSourceId)
      .then((result) => {
        if (active) setSchema(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to read schema");
      });

    return () => {
      active = false;
    };
  }, [token, dataSourceId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!schema) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Reading schema…</p>;
  }

  if (schema.type === "google_sheets") {
    const fields = schema.fields ?? [];
    if (fields.length === 0) {
      return (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This sheet has no header row.
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {fields.map((field, index) => (
          <span
            key={`${field}-${index}`}
            className="rounded bg-black/[.05] px-2 py-1 font-mono text-xs dark:bg-white/[.08]"
          >
            {field || "(unnamed)"}
          </span>
        ))}
      </div>
    );
  }

  if (!schema.tables || schema.tables.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">No tables found.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {schema.tables.map((table) => (
        <div key={table.name}>
          <p className="font-mono text-sm font-medium">{table.name}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {table.columns.map((column) => (
              <li key={column.name} className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {column.name} <span className="text-zinc-500">{column.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
