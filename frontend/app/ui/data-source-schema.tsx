"use client";

import { useEffect, useState } from "react";
import {
  getDataSourceSchema,
  refreshDataSourceSchema,
  type DataSourceSchema,
  type DataSourceType,
} from "@/lib/api";
import { Disclosure, Note, Skeleton } from "@/app/ui/primitives";
import { Icon } from "@/app/ui/icons";

// DataSourceSchemaView loads and shows the structure of the selected data
// source: tables and columns for SQL, header/detected fields for Google
// Sheets and REST API sources. `type` is passed in rather than read off the
// response, since the caller already knows it and the schema response itself
// doesn't carry the source's type.
export function DataSourceSchemaView({
  token,
  dataSourceId,
  type,
}: {
  token: string;
  dataSourceId: string;
  type: DataSourceType;
}) {
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = () => {
    setRefreshing(true);
    setError(null);
    refreshDataSourceSchema(token, dataSourceId)
      .then(setSchema)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to refresh schema"))
      .finally(() => setRefreshing(false));
  };

  const refreshButton = (
    <button onClick={handleRefresh} disabled={refreshing} className="dw-btn dw-btn-sm dw-btn-quiet">
      <span className={refreshing ? "animate-spin" : ""}>
        <Icon.Refresh size={13} />
      </span>
      {refreshing ? "Detecting…" : "Detect fields"}
    </button>
  );

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Note kind="error">{error}</Note>
        {refreshButton}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (type === "google_sheets" || type === "rest_api") {
    const fields = schema.fields ?? [];
    if (fields.length === 0) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="dw-hint">
            {type === "rest_api" ? "No fields detected yet." : "This sheet has no header row."}
          </p>
          {refreshButton}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-1.5">
          {fields.map((field, index) => {
            const fieldType = schema.fieldTypes?.[field];
            return (
              <span key={`${field}-${index}`} className="dw-chip dw-mono">
                {field || "(unnamed)"}
                {fieldType && <span className="text-faint">{fieldType}</span>}
              </span>
            );
          })}
        </div>
        {refreshButton}
      </div>
    );
  }

  if (!schema.tables || schema.tables.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="dw-hint">No tables found.</p>
        {refreshButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex w-full flex-col">
        {schema.tables.map((table) => (
          <Disclosure
            key={table.name}
            summary={`${table.name}  ·  ${table.columns.length} columns`}
          >
            <div className="flex flex-wrap gap-1.5 pb-2 pl-5">
              {table.columns.map((column) => (
                <span key={column.name} className="dw-chip dw-mono">
                  {column.name}
                  <span className="text-faint">{column.type}</span>
                </span>
              ))}
            </div>
          </Disclosure>
        ))}
      </div>
      {refreshButton}
    </div>
  );
}
