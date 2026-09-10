"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Icon } from "@/app/ui/icons";

const STORAGE_KEY = "docuwave_theme";

// THEME_BOOT_SCRIPT runs before the first paint, from the document head, so a
// user on dark never sees a white flash. It has to stay in sync with what
// ThemeToggle writes below; both read the same key and set the same attribute.
export const THEME_BOOT_SCRIPT = `
try {
  var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch (e) {
  document.documentElement.dataset.theme = "light";
}
`;

// The theme lives on <html>, written by the boot script above before React
// exists. That makes the DOM the source of truth rather than React state, so
// the toggle subscribes to the attribute instead of trying to mirror it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  // The server can't know what the boot script picked, so it renders light and
  // the first client snapshot corrects it.
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as const);

  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="dw-btn dw-btn-quiet dw-btn-sm"
    >
      {theme === "dark" ? <Icon.Sun size={15} /> : <Icon.Moon size={15} />}
    </button>
  );
}
