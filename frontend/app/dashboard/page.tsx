"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Profile = { id: string; email: string };

export default function DashboardPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    authFetch("/api/me", token)
      .then((res) => res.json())
      .then(setProfile)
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32">
      <h1 className="text-2xl font-semibold">Welcome, {profile.email}</h1>
      <Link
        href="/datasources"
        className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Manage data sources
      </Link>
      <Link
        href="/reports"
        className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Reports
      </Link>
      <Link
        href="/settings"
        className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        LLM settings
      </Link>
      <button
        onClick={() => {
          logout();
          router.push("/login");
        }}
        className="rounded-full border border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Log out
      </button>
    </div>
  );
}
