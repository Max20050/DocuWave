"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/app/ui/icons";
import { ThemeToggle } from "@/app/ui/theme";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", Icon: Icon.Home },
  { href: "/reports", label: "Reports", Icon: Icon.Report },
  { href: "/datasources", label: "Connectors", Icon: Icon.Plug },
  { href: "/recipients", label: "Recipients", Icon: Icon.People },
  { href: "/settings", label: "Settings", Icon: Icon.Settings },
];

// Sidebar is the app's persistent navigation, shown on every authenticated
// page via app/(app)/layout.tsx. Below the medium breakpoint it collapses to
// icons so the content column keeps its full width on a laptop screen.
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { token, logout } = useAuth();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    authFetch("/api/me", token)
      .then((res) => res.json())
      .then((profile: { email: string }) => {
        if (active) setEmail(profile.email);
      })
      .catch(() => {
        /* The layout already handles a dead session; a missing name is not
           worth bouncing the user for. */
      });
    return () => {
      active = false;
    };
  }, [token]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <nav className="sticky top-0 flex h-dvh w-[3.75rem] shrink-0 flex-col justify-between border-r border-line bg-surface md:w-56">
      <div className="flex flex-col gap-6 p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-1.5 pt-2 pb-1"
          aria-label="DocuWave"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[var(--accent-ink)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 15c3-4 6-4 9 0s6 4 9 0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path d="M3 9c3-4 6-4 9 0s6 4 9 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
            </svg>
          </span>
          <span className="hidden text-[0.95rem] font-semibold tracking-tight md:inline">DocuWave</span>
        </Link>

        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    active
                      ? "bg-surface-2 font-medium text-ink"
                      : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {/* The rail marks the current page even when labels are
                      collapsed away on a narrow screen. */}
                  <span
                    className={`absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r bg-accent transition-opacity ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <item.Icon size={17} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        {email && (
          <p className="hidden truncate px-1.5 pt-1 pb-2 text-xs text-faint md:block" title={email}>
            {email}
          </p>
        )}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title="Log out"
            className="dw-btn dw-btn-quiet dw-btn-sm flex-1 justify-start"
          >
            <Icon.LogOut size={15} />
            <span className="hidden md:inline">Log out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
