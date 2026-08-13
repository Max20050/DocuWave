export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function register(email: string, password: string): Promise<{ token: string }> {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<{ token: string }> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function authFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    throw new ApiError(401, "session expired");
  }
  return response;
}

export type DataSourceType = "postgres" | "mysql" | "google_sheets";

export type DataSource = {
  id: string;
  name: string;
  type: DataSourceType;
  host?: string;
  port?: number;
  dbName?: string;
  username?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  createdAt: string;
};

export type DataSourceInput = {
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  dbName: string;
  username: string;
  password: string;
};

export type GoogleSheetsSpreadsheet = {
  id: string;
  name: string;
};

export type GoogleSheetsDataSourceInput = {
  name: string;
  connectionId: string;
  spreadsheetId: string;
  spreadsheetName: string;
};

export async function listDataSources(token: string): Promise<DataSource[]> {
  const response = await authFetch("/api/datasources", token);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function testDataSource(token: string, input: DataSourceInput): Promise<void> {
  const response = await authFetch("/api/datasources/test", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
}

export async function createDataSource(token: string, input: DataSourceInput): Promise<DataSource> {
  const response = await authFetch("/api/datasources", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function deleteDataSource(token: string, id: string): Promise<void> {
  const response = await authFetch(`/api/datasources/${id}`, token, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
}

export type SchemaColumn = {
  name: string;
  type: string;
};

export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
};

// SQL sources report `tables`; Google Sheets sources report `fields` (the header row).
export type DataSourceSchema = {
  dataSourceId: string;
  type: DataSourceType;
  tables?: SchemaTable[];
  fields?: string[];
};

export async function getDataSourceSchema(
  token: string,
  id: string,
): Promise<DataSourceSchema> {
  const response = await authFetch(`/api/datasources/${id}/schema`, token);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export function googleSheetsConnectUrl(token: string): string {
  return `${API_URL}/api/datasources/google-sheets/login?token=${encodeURIComponent(token)}`;
}

export async function listGoogleSheetsSpreadsheets(
  token: string,
  connectionId: string,
): Promise<GoogleSheetsSpreadsheet[]> {
  const response = await authFetch(
    `/api/datasources/google-sheets/connections/${connectionId}/spreadsheets`,
    token,
  );
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function createGoogleSheetsDataSource(
  token: string,
  input: GoogleSheetsDataSourceInput,
): Promise<DataSource> {
  const response = await authFetch("/api/datasources/google-sheets", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export type LLMProviderType = "claude" | "openai";

export type LLMConfig = {
  id: string;
  provider: LLMProviderType;
  createdAt: string;
  updatedAt: string;
};

export type LLMConfigInput = {
  provider: LLMProviderType;
  apiKey: string;
};

export async function getLLMConfig(token: string): Promise<LLMConfig | null> {
  const response = await authFetch("/api/llm-config", token);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function saveLLMConfig(token: string, input: LLMConfigInput): Promise<LLMConfig> {
  const response = await authFetch("/api/llm-config", token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function deleteLLMConfig(token: string): Promise<void> {
  const response = await authFetch("/api/llm-config", token, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
}

// A slot is a hole in a template's layout the user fills in: "text" takes typed
// text, "column" a single query output column, "columns" an ordered list.
export type TemplateSlotKind = "text" | "column" | "columns";

export type TemplateSlot = {
  key: string;
  label: string;
  kind: TemplateSlotKind;
  description: string;
  required: boolean;
  // numeric marks a slot meant for columns of numbers, such as the measures a
  // template totals. It's a hint for field mapping, not a rule.
  numeric: boolean;
};

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  slots: TemplateSlot[];
};

// TemplateConfig is the user's slot mapping, keyed by slot. It is saved with the
// report, so the shape matches what the backend stores.
export type TemplateConfig = {
  columns?: Record<string, string[]>;
  text?: Record<string, string>;
};

// A report is delivered as one or more files. The options come from the
// server's renderer registry, so this list is the whole of what it can produce.
export type ReportFormat = "pdf" | "xlsx" | "csv";

export const REPORT_FORMATS: { value: ReportFormat; label: string; description: string }[] = [
  { value: "pdf", label: "PDF", description: "The report as a document, laid out for printing." },
  { value: "xlsx", label: "Excel", description: "A worksheet whose numbers are still numbers." },
  { value: "csv", label: "CSV", description: "Plain rows, for loading into another tool." },
];

export type Report = {
  id: string;
  dataSourceId: string;
  dataSourceName: string;
  name: string;
  prompt: string;
  query: string;
  templateId: string;
  templateConfig: TemplateConfig;
  formats: ReportFormat[];
  createdAt: string;
  updatedAt: string;
};

export type GeneratedQuery = {
  query: string;
  // The query language the source speaks, e.g. "PostgreSQL SQL".
  dialect: string;
};

// Cell values come straight from the data source, so anything JSON can hold.
export type QueryPreview = {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
};

export type ReportInput = {
  name: string;
  dataSourceId: string;
  prompt: string;
  query: string;
  templateId: string;
  templateConfig: TemplateConfig;
  formats: ReportFormat[];
};

export async function listReportTemplates(token: string): Promise<ReportTemplate[]> {
  const response = await authFetch("/api/report-templates", token);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

// previewReportTemplate renders the template on the server with the rows the
// query actually returns, so the preview is the document the report will be.
export async function previewReportTemplate(
  token: string,
  input: {
    dataSourceId: string;
    query: string;
    templateId: string;
    templateConfig: TemplateConfig;
  },
): Promise<string> {
  const response = await authFetch("/api/reports/preview-template", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  const body = (await response.json()) as { html: string };
  return body.html;
}

export async function generateReportQuery(
  token: string,
  dataSourceId: string,
  prompt: string,
): Promise<GeneratedQuery> {
  const response = await authFetch("/api/reports/generate-query", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataSourceId, prompt }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function previewReportQuery(
  token: string,
  dataSourceId: string,
  query: string,
): Promise<QueryPreview> {
  const response = await authFetch("/api/reports/preview", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataSourceId, query }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function listReports(token: string): Promise<Report[]> {
  const response = await authFetch("/api/reports", token);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

export async function createReport(token: string, input: ReportInput): Promise<Report> {
  const response = await authFetch("/api/reports", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.json();
}

// downloadReport runs the report on the server and saves the file it returns.
// The request carries the session token, so the file arrives as a response body
// rather than at a URL the browser could follow on its own.
export async function downloadReport(
  token: string,
  id: string,
  format: ReportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const response = await authFetch(`/api/reports/${id}/download?format=${format}`, token);
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get("Content-Disposition"), `${id}.${format}`),
  };
}

// filenameFrom reads the name the server chose for the file. The header is
// exposed to scripts by the API's CORS configuration; if it isn't there, the
// caller's fallback is used rather than guessing.
function filenameFrom(disposition: string | null, fallback: string): string {
  const quoted = disposition?.match(/filename="([^"]+)"/);
  return quoted?.[1] ?? fallback;
}

export async function deleteReport(token: string, id: string): Promise<void> {
  const response = await authFetch(`/api/reports/${id}`, token, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
}
