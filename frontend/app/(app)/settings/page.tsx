"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLLMConfig,
  getLLMConfig,
  saveLLMConfig,
  type LLMConfig,
  type LLMConfigInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { LLMConfigForm, PROVIDERS } from "@/app/ui/llm-config-form";
import { Icon } from "@/app/ui/icons";
import {
  ConfirmButton,
  Drawer,
  EmptyState,
  LoadingPage,
  Note,
  PageBody,
  PageHeader,
  Section,
} from "@/app/ui/primitives";
import { useToast } from "@/app/ui/toast";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { token, logout } = useAuth();
  // undefined means "still loading"; null means "loaded, none configured".
  const [config, setConfig] = useState<LLMConfig | null | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getLLMConfig(token)
      .then(setConfig)
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  async function handleSave(input: LLMConfigInput) {
    if (!token) return;
    const saved = await saveLLMConfig(token, input);
    setConfig(saved);
    setDrawerOpen(false);
    toast.ok("API key saved");
  }

  async function handleDelete() {
    if (!token) return;
    setError(null);
    try {
      await deleteLLMConfig(token);
      setConfig(null);
      toast.ok("API key removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove LLM configuration");
    }
  }

  if (!token || config === undefined) return <LoadingPage />;

  const provider = config ? PROVIDERS.find((option) => option.value === config.provider) : undefined;

  return (
    <>
      <PageHeader title="Settings" description="Account-wide configuration." />

      <PageBody>
        <Section
          title="AI provider"
          hint="Only needed for report templates that include an AI summary block. Everything else works without it."
          action={
            config && (
              <button type="button" onClick={() => setDrawerOpen(true)} className="dw-btn dw-btn-sm">
                Replace key
              </button>
            )
          }
        >
          {error && <Note kind="error">{error}</Note>}

          {config ? (
            <div className="dw-card flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-muted">
                <Icon.Key size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{provider?.label ?? config.provider}</p>
                <p className="dw-hint">
                  Key stored{config.updatedAt ? ` · updated ${formatDate(config.updatedAt)}` : ""}
                </p>
              </div>
              <span className="dw-chip dw-chip-accent">
                <Icon.Check size={12} />
                Active
              </span>
              <ConfirmButton label="Remove" onConfirm={handleDelete} />
            </div>
          ) : (
            <EmptyState
              icon={<Icon.Key size={26} />}
              title="No AI provider connected"
              body="Add a key from Claude, OpenAI or OpenRouter to unlock templates with an AI summary block."
              action={
                <button type="button" onClick={() => setDrawerOpen(true)} className="dw-btn dw-btn-primary">
                  <Icon.Plus size={15} />
                  Add a key
                </button>
              }
            />
          )}
        </Section>
      </PageBody>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={config ? "Replace API key" : "Connect an AI provider"}
        description="The key is encrypted before it's stored and is never sent back to the browser."
      >
        <LLMConfigForm initialProvider={config?.provider} onSave={handleSave} />
      </Drawer>
    </>
  );
}
