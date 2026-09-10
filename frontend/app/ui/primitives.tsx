"use client";

import { useEffect, useId, useState } from "react";
import { Icon } from "@/app/ui/icons";

/* ---------------------------------------------------------------------------
   Page furniture
--------------------------------------------------------------------------- */

// PageHeader is the one bar every page opens with: what you're looking at on
// the left, the single action that page is for on the right. `back` turns it
// into the header of a focused flow (the report builder, the connector wizard)
// so leaving is always in the same place.
export function PageHeader({
  title,
  count,
  description,
  action,
  back,
}: {
  title: string;
  count?: number;
  description?: string;
  action?: React.ReactNode;
  back?: { label: string; onClick: () => void };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 px-7 py-4 backdrop-blur">
      {back && (
        <button type="button" onClick={back.onClick} className="dw-btn dw-btn-quiet dw-btn-sm -ml-2 mb-2">
          <Icon.ArrowLeft size={14} />
          {back.label}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <h1 className="dw-title">{title}</h1>
            {count !== undefined && <span className="dw-chip tabular-nums">{count}</span>}
          </div>
          {description && <p className="dw-hint mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function PageBody({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex-1 px-7 py-6">
      <div className={`dw-in mx-auto flex w-full flex-col gap-7 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <p className="dw-eyebrow">{title}</p>}
            {hint && <p className="dw-hint mt-1">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// EmptyState replaces the bare "No reports created yet." line the pages used
// to show. An empty list is the moment a user most needs to be told what to do
// next, so it carries the action that fills it.
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dw-card flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
      {icon && <span className="text-faint">{icon}</span>}
      <div className="flex flex-col gap-1">
        <p className="dw-h2">{title}</p>
        {body && <p className="dw-hint mx-auto max-w-sm">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Feedback
--------------------------------------------------------------------------- */

export function Note({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "ok" | "warn";
  children: React.ReactNode;
}) {
  const tone =
    kind === "error" ? "dw-note-error" : kind === "ok" ? "dw-note-ok" : kind === "warn" ? "dw-note-warn" : "";
  return (
    <p className={`dw-note dw-in ${tone}`}>
      <span className="mt-px shrink-0">{kind === "ok" ? <Icon.Check size={15} /> : <Icon.Alert size={15} />}</span>
      <span>{children}</span>
    </p>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`dw-skeleton ${className}`} />;
}

// LoadingPage stands in for a page that is still fetching. It draws the shape
// of what's coming rather than the word "Loading", so the layout doesn't jump
// once the data lands.
export function LoadingPage() {
  return (
    <div className="flex-1 px-7 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Inputs
--------------------------------------------------------------------------- */

// Field wraps one control with its label and its hint. Passing the hint here
// rather than writing a loose paragraph next to the input is what keeps the
// forms explaining themselves instead of just listing blanks.
export function Field({
  label,
  hint,
  htmlFor,
  optional,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="dw-label flex items-baseline gap-1.5">
        {label}
        {optional && <span className="text-xs font-normal text-faint">optional</span>}
      </label>
      {hint && <p className="dw-hint -mt-0.5">{hint}</p>}
      {children}
    </div>
  );
}

// ChoiceCards replaces a <select> wherever the choice decides what the user
// sees next — connector type, LLM provider, output format. Seeing all the
// options side by side with a sentence each is the difference between a form
// and something that guides you.
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { value: T; label: string; description?: string; icon?: React.ReactNode; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-2.5 ${columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`dw-card dw-card-hover flex flex-col items-start gap-1.5 p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              selected ? "border-accent bg-[var(--accent-soft)]" : ""
            }`}
          >
            <span className="flex w-full items-center gap-2">
              {option.icon && <span className={selected ? "text-accent" : "text-faint"}>{option.icon}</span>}
              <span className="flex-1 text-sm font-medium">{option.label}</span>
              <span className={`text-accent transition-opacity ${selected ? "opacity-100" : "opacity-0"}`}>
                <Icon.Check size={15} />
              </span>
            </span>
            {option.description && <span className="dw-hint">{option.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-accent font-medium text-ink"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="dw-chip tabular-nums">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Actions
--------------------------------------------------------------------------- */

// ConfirmButton asks in place instead of throwing a modal at the user: the
// first click swaps the row action for "Sure? / Cancel", and walking away
// (blur, or five seconds) puts it back. Nothing destructive happens on one
// click, and nothing blocks the page either.
export function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm",
  className = "dw-btn dw-btn-sm dw-btn-quiet",
}: {
  onConfirm: () => void | Promise<void>;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={className}>
        <Icon.Trash size={13} />
        {label}
      </button>
    );
  }

  return (
    <span className="dw-in flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
        className="dw-btn dw-btn-sm dw-btn-danger"
      >
        {busy ? "Deleting…" : confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="dw-btn dw-btn-sm dw-btn-quiet">
        Cancel
      </button>
    </span>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="dw-btn dw-btn-sm dw-btn-quiet"
    >
      {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}

// Disclosure is the collapsible used for anything secondary — a connector's
// schema, a report's compiled SQL. Keeping it out of sight by default is most
// of why the pages stopped feeling like walls of controls.
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  right,
}: {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="dw-btn dw-btn-sm dw-btn-quiet -ml-1.5"
        >
          <span className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
            <Icon.ChevronRight size={13} />
          </span>
          {summary}
        </button>
        {right}
      </div>
      {open && (
        <div id={id} className="dw-in pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Overlay
--------------------------------------------------------------------------- */

// Drawer holds a creation flow beside the list it adds to, instead of stacking
// yet another form under it. The list stays visible and unchanged behind the
// panel, which is what makes "add another" feel cheap.
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  width = "md",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="dw-in absolute inset-0 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dw-sheet-in relative flex h-full w-full flex-col border-l border-line bg-bg shadow-[var(--shadow-pop)] ${
          width === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="dw-h2">{title}</h2>
            {description && <p className="dw-hint mt-0.5">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="dw-btn dw-btn-sm dw-btn-quiet">
            <Icon.X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Wizard
--------------------------------------------------------------------------- */

// Steps is the rail every multi-stage flow shares. A step you haven't earned
// yet is visibly locked rather than hidden, so the shape of the whole task is
// clear from the first screen.
export function Steps({
  steps,
  current,
  maxUnlocked,
  onSelect,
}: {
  steps: { n: number; label: string; hint?: string }[];
  current: number;
  maxUnlocked: number;
  onSelect: (n: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-0.5">
      {steps.map((step) => {
        const unlocked = step.n <= maxUnlocked;
        const active = step.n === current;
        const done = step.n < current && unlocked;
        return (
          <li key={step.n}>
            <button
              type="button"
              disabled={!unlocked}
              onClick={() => onSelect(step.n)}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                active ? "bg-surface-2" : unlocked ? "hover:bg-surface-2" : "opacity-45"
              }`}
            >
              <span
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors ${
                  done
                    ? "border-accent bg-accent text-[var(--accent-ink)]"
                    : active
                      ? "border-accent text-accent"
                      : "border-line-strong text-faint"
                }`}
              >
                {done ? <Icon.Check size={11} /> : step.n}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${active ? "font-medium" : ""}`}>{step.label}</span>
                {step.hint && <span className="dw-hint block text-xs">{step.hint}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
