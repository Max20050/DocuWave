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
