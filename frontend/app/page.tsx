"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { token } = useAuth();

  useEffect(() => {
    router.replace(token ? "/dashboard" : "/login");
  }, [token, router]);

  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p>Loading…</p>
    </div>
  );
}
