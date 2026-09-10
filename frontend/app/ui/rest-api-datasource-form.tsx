"use client";

import { useState, type FormEvent } from "react";
import type { RestApiDataSourceInput, RestAuthType, RestHeader } from "@/lib/api";
import { ChoiceCards, Disclosure, Field, Note } from "@/app/ui/primitives";
import { Icon } from "@/app/ui/icons";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const AUTH_OPTIONS: { value: RestAuthType; label: string; description: string }[] = [
  { value: "none", label: "None", description: "A public endpoint" },
  { value: "bearer", label: "Bearer token", description: "Authorization: Bearer …" },
  { value: "api_key", label: "API key header", description: "A custom header, e.g. X-API-Key" },
  { value: "basic", label: "Basic auth", description: "Username and password" },
];

function buildAuth(
  type: RestAuthType,
  fields: { username: string; password: string; token: string; headerName: string; headerValue: string },
): RestApiDataSourceInput["auth"] {
  switch (type) {
    case "basic":
      return { type, username: fields.username, password: fields.password };
    case "bearer":
      return { type, token: fields.token };
    case "api_key":
      return { type, headerName: fields.headerName, headerValue: fields.headerValue };
    default:
      return { type: "none" };
  }
}

// RestApiDataSourceForm asks for the endpoint first and everything optional
// after: auth is a set of cards that reveals only the fields that kind needs,
// and headers and a request body stay folded away until asked for. Like the
// SQL form, it has to reach the endpoint once before it can be saved.
export function RestApiDataSourceForm({
  onTest,
  onCreate,
}: {
  onTest: (input: RestApiDataSourceInput) => Promise<void>;
  onCreate: (input: RestApiDataSourceInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState<RestHeader[]>([]);
  const [authType, setAuthType] = useState<RestAuthType>("none");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [body, setBody] = useState("");
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, setPending] = useState(false);

  function currentInput(): RestApiDataSourceInput {
    return {
      name,
      url,
      method,
      headers: headers.filter((h) => h.key.trim() !== ""),
      auth: buildAuth(authType, { username, password, token, headerName, headerValue }),
      body: body || undefined,
    };
  }

  // Any edit invalidates a previous green tick — see DataSourceForm.
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setTested(false);
      setter(value);
    };
  }

  function updateHeader(index: number, field: keyof RestHeader, value: string) {
    setTested(false);
    setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  function removeHeader(index: number) {
    setTested(false);
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }

  const complete = name.trim() !== "" && url.trim() !== "";

  async function handleTest() {
    setError(null);
    setTesting(true);
    try {
      await onTest(currentInput());
      setTested(true);
    } catch (err) {
      setTested(false);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onCreate(currentInput());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <Field
        label="Connector name"
        htmlFor="rest-name"
        hint="How this endpoint appears when you pick a source for a report."
      >
        <input
          id="rest-name"
          required
          value={name}
          onChange={(e) => edit(setName)(e.target.value)}
          placeholder="Orders API"
          className="dw-field"
        />
      </Field>

      <Field label="Endpoint" htmlFor="rest-url" hint="The request DocuWave makes to fetch rows.">
        <div className="flex gap-2">
          <select
            aria-label="HTTP method"
            value={method}
            onChange={(e) => edit(setMethod)(e.target.value)}
            className="dw-field w-28"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            id="rest-url"
            type="url"
            required
            value={url}
            onChange={(e) => edit(setUrl)(e.target.value)}
            className="dw-field flex-1"
            placeholder="https://api.example.com/orders"
          />
        </div>
      </Field>

      <Field label="Authentication" hint="How the endpoint knows it's you.">
        <ChoiceCards
          columns={2}
          options={AUTH_OPTIONS}
          value={authType}
          onChange={(next) => {
            setTested(false);
            setAuthType(next);
          }}
        />
      </Field>

      {authType === "basic" && (
        <div className="dw-in flex gap-3">
          <Field label="Username" htmlFor="rest-username" className="flex-1">
            <input
              id="rest-username"
              required
              value={username}
              onChange={(e) => edit(setUsername)(e.target.value)}
              className="dw-field"
            />
          </Field>
          <Field label="Password" htmlFor="rest-password" className="flex-1">
            <input
              id="rest-password"
              type="password"
              required
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
              className="dw-field"
            />
          </Field>
        </div>
      )}

      {authType === "bearer" && (
        <Field label="Token" htmlFor="rest-token" className="dw-in">
          <input
            id="rest-token"
            type="password"
            required
            value={token}
            onChange={(e) => edit(setToken)(e.target.value)}
            className="dw-field"
          />
        </Field>
      )}

      {authType === "api_key" && (
        <div className="dw-in flex gap-3">
          <Field label="Header name" htmlFor="rest-header-name" className="flex-1">
            <input
              id="rest-header-name"
              required
              value={headerName}
              onChange={(e) => edit(setHeaderName)(e.target.value)}
              className="dw-field"
              placeholder="X-API-Key"
            />
          </Field>
          <Field label="Header value" htmlFor="rest-header-value" className="flex-1">
            <input
              id="rest-header-value"
              type="password"
              required
              value={headerValue}
              onChange={(e) => edit(setHeaderValue)(e.target.value)}
              className="dw-field"
            />
          </Field>
        </div>
      )}

      <div className="dw-card px-3 py-2">
        <Disclosure
          summary={`Extra headers${headers.length > 0 ? ` (${headers.length})` : ""}`}
          defaultOpen={headers.length > 0}
        >
          <div className="flex flex-col gap-2">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={header.key}
                  onChange={(e) => updateHeader(index, "key", e.target.value)}
                  placeholder="Header name"
                  className="dw-field dw-field-sm flex-1"
                />
                <input
                  value={header.value}
                  onChange={(e) => updateHeader(index, "value", e.target.value)}
                  placeholder="Value"
                  className="dw-field dw-field-sm flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeHeader(index)}
                  aria-label="Remove header"
                  className="dw-btn dw-btn-sm dw-btn-quiet"
                >
                  <Icon.X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHeaders((prev) => [...prev, { key: "", value: "" }])}
              className="dw-btn dw-btn-sm self-start"
            >
              <Icon.Plus size={13} />
              Add header
            </button>
          </div>
        </Disclosure>
      </div>

      {method !== "GET" && (
        <div className="dw-card dw-in px-3 py-2">
          <Disclosure summary="Request body" defaultOpen={body !== ""}>
            <textarea
              id="rest-body"
              value={body}
              onChange={(e) => edit(setBody)(e.target.value)}
              rows={4}
              placeholder='{ "from": "2024-01-01" }'
              className="dw-field dw-mono"
            />
          </Disclosure>
        </div>
      )}

      {error && <Note kind="error">{error}</Note>}
      {tested && <Note kind="ok">The endpoint answered. You can save this connector.</Note>}

      <div className="sticky bottom-0 -mx-6 flex items-center gap-2 border-t border-line bg-bg px-6 py-3">
        <button type="button" onClick={handleTest} disabled={testing || !complete} className="dw-btn">
          {testing ? "Testing…" : tested ? <Icon.Check size={14} /> : <Icon.Play size={13} />}
          {testing ? "" : tested ? "Tested" : "Test request"}
        </button>
        <button type="submit" disabled={pending || !tested} className="dw-btn dw-btn-primary flex-1">
          {pending ? "Saving…" : "Save connector"}
        </button>
      </div>
    </form>
  );
}
