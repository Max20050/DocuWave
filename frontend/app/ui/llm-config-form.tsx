"use client";

import { useState, type FormEvent } from "react";
import type { LLMConfigInput, LLMProviderType } from "@/lib/api";
import { ChoiceCards, Field, Note } from "@/app/ui/primitives";

export const PROVIDERS: {
  value: LLMProviderType;
  label: string;
  description: string;
  keyHint: string;
  keysUrl: string;
}[] = [
  {
    value: "claude",
    label: "Claude",
    description: "Anthropic",
    keyHint: "Starts with sk-ant-",
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    value: "openai",
    label: "GPT-4o",
    description: "OpenAI",
    keyHint: "Starts with sk-",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    description: "Many models, one key",
    keyHint: "Starts with sk-or-",
    keysUrl: "https://openrouter.ai/keys",
  },
];

// LLMConfigForm asks which provider first and only then for the key, with
// that provider's key format and the page to get one from spelled out — a
// bare "API key" box gives no clue which of three formats belongs in it.
export function LLMConfigForm({
  initialProvider = "claude",
  onSave,
}: {
  initialProvider?: LLMProviderType;
  onSave: (input: LLMConfigInput) => Promise<void>;
}) {
  const [provider, setProvider] = useState<LLMProviderType>(initialProvider);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const chosen = PROVIDERS.find((option) => option.value === provider)!;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSave({ provider, apiKey });
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <Field label="Provider" hint="Which model writes the AI summary blocks in your templates.">
        <ChoiceCards options={PROVIDERS} value={provider} onChange={setProvider} />
      </Field>

      <Field
        label="API key"
        htmlFor="llm-api-key"
        hint={`${chosen.keyHint}. Stored encrypted and never shown again.`}
      >
        <input
          id="llm-api-key"
          type="password"
          required
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={chosen.keyHint.replace("Starts with ", "") + "…"}
          className="dw-field dw-mono"
        />
        <a href={chosen.keysUrl} target="_blank" rel="noreferrer" className="dw-link dw-hint self-start">
          Get a {chosen.label} key
        </a>
      </Field>

      {error && <Note kind="error">{error}</Note>}

      <button type="submit" disabled={pending || apiKey.trim() === ""} className="dw-btn dw-btn-primary">
        {pending ? "Saving…" : "Save key"}
      </button>
    </form>
  );
}
