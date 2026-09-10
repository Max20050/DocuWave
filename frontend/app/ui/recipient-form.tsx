"use client";

import { useState, type FormEvent } from "react";
import type { RecipientInput } from "@/lib/api";
import { Field, Note } from "@/app/ui/primitives";
import { Icon } from "@/app/ui/icons";

type AttributeRow = { key: string; value: string };

// Common attribute names, offered as one-click starters so the first thing a
// user sees isn't two empty boxes labelled "key" and "value".
const SUGGESTED_KEYS = ["region", "department", "country", "team"];

export function RecipientForm({ onCreate }: { onCreate: (input: RecipientInput) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateAttribute(index: number, row: AttributeRow) {
    setAttributes(attributes.map((a, i) => (i === index ? row : a)));
  }
  function removeAttribute(index: number) {
    setAttributes(attributes.filter((_, i) => i !== index));
  }
  function addAttribute(key = "") {
    setAttributes([...attributes, { key, value: "" }]);
  }

  const usedKeys = new Set(attributes.map((row) => row.key));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const attributeObject = Object.fromEntries(
        attributes.filter((row) => row.key.trim() !== "").map((row) => [row.key.trim(), row.value]),
      );
      await onCreate({ email, name, attributes: attributeObject });
      setEmail("");
      setName("");
      setAttributes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipient");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <Field label="Email" htmlFor="recipient-email">
        <input
          id="recipient-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@company.com"
          className="dw-field"
        />
      </Field>

      <Field label="Name" htmlFor="recipient-name" optional>
        <input
          id="recipient-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="dw-field"
        />
      </Field>

      <Field
        label="Attributes"
        optional
        hint="Values a report's inputs can filter by, so one report can go out personalised per person."
      >
        <div className="flex flex-col gap-2">
          {attributes.map((row, index) => (
            <div key={index} className="dw-in flex items-center gap-2">
              <input
                value={row.key}
                onChange={(e) => updateAttribute(index, { ...row, key: e.target.value })}
                placeholder="key"
                className="dw-field dw-field-sm w-1/3"
              />
              <span className="text-faint">=</span>
              <input
                value={row.value}
                onChange={(e) => updateAttribute(index, { ...row, value: e.target.value })}
                placeholder="value"
                className="dw-field dw-field-sm flex-1"
              />
              <button
                type="button"
                onClick={() => removeAttribute(index)}
                aria-label="Remove attribute"
                className="dw-btn dw-btn-sm dw-btn-quiet"
              >
                <Icon.X size={13} />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-1.5">
            {SUGGESTED_KEYS.filter((key) => !usedKeys.has(key)).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => addAttribute(key)}
                className="dw-btn dw-btn-sm dw-btn-quiet"
              >
                <Icon.Plus size={12} />
                {key}
              </button>
            ))}
            <button type="button" onClick={() => addAttribute()} className="dw-btn dw-btn-sm">
              <Icon.Plus size={12} />
              Custom
            </button>
          </div>
        </div>
      </Field>

      {error && <Note kind="error">{error}</Note>}

      <button type="submit" disabled={pending} className="dw-btn dw-btn-primary">
        {pending ? "Saving…" : "Add recipient"}
      </button>
    </form>
  );
}
