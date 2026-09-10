"use client";

import { useState, type FormEvent } from "react";
import { Field, Note } from "@/app/ui/primitives";

export function AuthForm({
  submitLabel,
  requireStrongPassword = false,
  onSubmit,
}: {
  submitLabel: string;
  // Registration states the rule up front instead of letting the server
  // reject an eight-character minimum after the fact.
  requireStrongPassword?: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const tooShort = requireStrongPassword && password !== "" && password.length < 8;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="dw-field"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint={requireStrongPassword ? "At least 8 characters." : undefined}
      >
        <div className="relative">
          <input
            id="password"
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete={requireStrongPassword ? "new-password" : "current-password"}
            required
            minLength={requireStrongPassword ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="dw-field pr-16"
          />
          <button
            type="button"
            onClick={() => setReveal(!reveal)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-ink"
          >
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      {error && <Note kind="error">{error}</Note>}

      <button type="submit" disabled={pending || tooShort} className="dw-btn dw-btn-primary w-full">
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
