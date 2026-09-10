"use client";

import { useState, type FormEvent } from "react";
import { Field, Note } from "@/app/ui/primitives";

export function RecipientGroupForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onCreate(name);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipient group");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <Field
        label="Group name"
        htmlFor="group-name"
        hint="A group is a list you send one report to at once — pick its members after you create it."
      >
        <input
          id="group-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Regional managers"
          className="dw-field"
        />
      </Field>

      {error && <Note kind="error">{error}</Note>}

      <button type="submit" disabled={pending || name.trim() === ""} className="dw-btn dw-btn-primary">
        {pending ? "Saving…" : "Create group"}
      </button>
    </form>
  );
}
