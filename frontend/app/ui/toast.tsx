"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Icon } from "@/app/ui/icons";

type ToastKind = "ok" | "error" | "info";

type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  ok: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

const LIFETIME_MS = 4000;

// ToastProvider owns the one place the app reports the outcome of an action
// that has no other visible result — a delete that removes a row the user was
// already looking at, a key that saved, a download that failed. Anything with
// its own on-screen consequence stays inline instead.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (message) => push("ok", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`dw-rise pointer-events-auto flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm shadow-[var(--shadow-pop)] ${
              toast.kind === "error"
                ? "border-danger/40 bg-[var(--danger-soft)] text-danger"
                : toast.kind === "ok"
                  ? "border-accent/40 bg-[var(--accent-soft)] text-accent"
                  : "border-line bg-surface text-ink"
            }`}
          >
            <span className="shrink-0">
              {toast.kind === "error" ? <Icon.Alert /> : toast.kind === "ok" ? <Icon.Check /> : <Icon.Alert />}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <Icon.X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
