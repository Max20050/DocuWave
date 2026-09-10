"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  listGoogleSheetsSpreadsheets,
  type GoogleSheetsDataSourceInput,
  type GoogleSheetsSpreadsheet,
} from "@/lib/api";
import { Field, Note, Skeleton } from "@/app/ui/primitives";
import { Icon } from "@/app/ui/icons";

// GoogleSheetsPicker lists the spreadsheets the connected account can see and
// has the user click one, rather than hunting through a dropdown. Picking a
// sheet also names the connector, so the common case is one click and save.
export function GoogleSheetsPicker({
  token,
  connectionId,
  onCreate,
}: {
  token: string;
  connectionId: string;
  onCreate: (input: GoogleSheetsDataSourceInput) => Promise<void>;
}) {
  const [sheets, setSheets] = useState<GoogleSheetsSpreadsheet[] | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    listGoogleSheetsSpreadsheets(token, connectionId)
      .then((result) => {
        setSheets(result);
        if (result.length > 0) {
          setSpreadsheetId(result[0].id);
          setName(result[0].name);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to list spreadsheets"));
  }, [token, connectionId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sheet = sheets?.find((s) => s.id === spreadsheetId);
    if (!sheet) return;
    setError(null);
    setPending(true);
    try {
      await onCreate({ name, connectionId, spreadsheetId: sheet.id, spreadsheetName: sheet.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add data source");
    } finally {
      setPending(false);
    }
  }

  if (error && !sheets) return <Note kind="error">{error}</Note>;

  if (!sheets) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (sheets.length === 0) {
    return <Note>No spreadsheets found in the connected Google account.</Note>;
  }

  const visible = sheets.filter((sheet) => sheet.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <Field label="Spreadsheet" hint="The first row of the sheet becomes your column names.">
        {sheets.length > 6 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="dw-field dw-field-sm mb-2"
          />
        )}
        <ul className="dw-card max-h-64 divide-y divide-line overflow-y-auto">
          {visible.map((sheet) => {
            const selected = sheet.id === spreadsheetId;
            return (
              <li key={sheet.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSpreadsheetId(sheet.id);
                    setName(sheet.name);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    selected ? "bg-[var(--accent-soft)] text-accent" : "hover:bg-surface-2"
                  }`}
                >
                  <Icon.Sheet size={15} />
                  <span className="flex-1 truncate">{sheet.name}</span>
                  {selected && <Icon.Check size={14} />}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="dw-hint px-3 py-2.5">No spreadsheet matches that.</li>}
        </ul>
      </Field>

      <Field label="Connector name" htmlFor="sheet-name">
        <input
          id="sheet-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="dw-field"
        />
      </Field>

      {error && <Note kind="error">{error}</Note>}

      <button type="submit" disabled={pending || spreadsheetId === ""} className="dw-btn dw-btn-primary">
        {pending ? "Saving…" : "Save connector"}
      </button>
    </form>
  );
}
