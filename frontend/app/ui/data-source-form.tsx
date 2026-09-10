"use client";

import { useState, type FormEvent } from "react";
import type { DataSourceInput } from "@/lib/api";
import { ChoiceCards, Field, Note } from "@/app/ui/primitives";
import { Icon } from "@/app/ui/icons";

type SqlDataSourceType = "postgres" | "mysql";

const ENGINES: { value: SqlDataSourceType; label: string; description: string }[] = [
  { value: "postgres", label: "PostgreSQL", description: "Port 5432 by default" },
  { value: "mysql", label: "MySQL", description: "Port 3306 by default" },
];

const DEFAULT_PORTS: Record<SqlDataSourceType, number> = {
  postgres: 5432,
  mysql: 3306,
};

// DataSourceForm collects a SQL connection in the order a person actually
// thinks about one: which engine, where it lives, then who it lets in. The
// connection is tested before it can be saved, so a typo surfaces here rather
// than the first time a report runs against it.
export function DataSourceForm({
  onTest,
  onCreate,
}: {
  onTest: (input: DataSourceInput) => Promise<void>;
  onCreate: (input: DataSourceInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SqlDataSourceType>("postgres");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORTS.postgres);
  const [dbName, setDbName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, setPending] = useState(false);

  function currentInput(): DataSourceInput {
    return { name, type, host, port, dbName, username, password };
  }

  // Any edit invalidates a previous green tick — otherwise the form would
  // claim a connection that was tested against different details.
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setTested(false);
      setter(value);
    };
  }

  const complete =
    name.trim() !== "" && host.trim() !== "" && dbName.trim() !== "" && username.trim() !== "";

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
      <Field label="Engine" hint="Which database DocuWave should speak to.">
        <ChoiceCards
          columns={2}
          options={ENGINES}
          value={type}
          onChange={(next) => {
            setTested(false);
            setType(next);
            setPort(DEFAULT_PORTS[next]);
          }}
        />
      </Field>

      <Field
        label="Connector name"
        htmlFor="ds-name"
        hint="How this connection appears when you pick a source for a report."
      >
        <input
          id="ds-name"
          required
          value={name}
          onChange={(e) => edit(setName)(e.target.value)}
          placeholder="Production analytics"
          className="dw-field"
        />
      </Field>

      <div className="flex flex-col gap-4">
        <p className="dw-eyebrow">Where it lives</p>
        <div className="flex gap-3">
          <Field label="Host" htmlFor="ds-host" className="flex-1">
            <input
              id="ds-host"
              required
              value={host}
              onChange={(e) => edit(setHost)(e.target.value)}
              placeholder="db.example.com"
              className="dw-field"
            />
          </Field>
          <Field label="Port" htmlFor="ds-port" className="w-24">
            <input
              id="ds-port"
              type="number"
              required
              value={port}
              onChange={(e) => edit(setPort)(Number(e.target.value))}
              className="dw-field"
            />
          </Field>
        </div>
        <Field label="Database" htmlFor="ds-dbname">
          <input
            id="ds-dbname"
            required
            value={dbName}
            onChange={(e) => edit(setDbName)(e.target.value)}
            className="dw-field"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <p className="dw-eyebrow">Credentials</p>
        <p className="dw-hint -mt-2">
          Stored encrypted. A read-only user is enough — DocuWave only ever selects.
        </p>
        <Field label="Username" htmlFor="ds-username">
          <input
            id="ds-username"
            required
            value={username}
            onChange={(e) => edit(setUsername)(e.target.value)}
            className="dw-field"
          />
        </Field>
        <Field label="Password" htmlFor="ds-password">
          <input
            id="ds-password"
            type="password"
            required
            value={password}
            onChange={(e) => edit(setPassword)(e.target.value)}
            className="dw-field"
          />
        </Field>
      </div>

      {error && <Note kind="error">{error}</Note>}
      {tested && <Note kind="ok">Connected. You can save this connector.</Note>}

      <div className="sticky bottom-0 -mx-6 flex items-center gap-2 border-t border-line bg-bg px-6 py-3">
        <button type="button" onClick={handleTest} disabled={testing || !complete} className="dw-btn">
          {testing ? "Testing…" : tested ? <Icon.Check size={14} /> : <Icon.Play size={13} />}
          {testing ? "" : tested ? "Tested" : "Test connection"}
        </button>
        <button type="submit" disabled={pending || !tested} className="dw-btn dw-btn-primary flex-1">
          {pending ? "Saving…" : "Save connector"}
        </button>
      </div>
    </form>
  );
}
