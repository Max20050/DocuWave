"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingPage } from "@/app/ui/primitives";

export default function Home() {
  const router = useRouter();
  const { token } = useAuth();

  useEffect(() => {
    router.replace(token ? "/dashboard" : "/login");
  }, [token, router]);

  return <LoadingPage />;
}
