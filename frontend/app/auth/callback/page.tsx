"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function SigningIn() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-32">
      <span className="dw-skeleton h-9 w-9 rounded-lg" />
      <p className="dw-hint">Signing you in…</p>
    </div>
  );
}

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setToken(token);
    router.replace("/dashboard");
  }, [searchParams, setToken, router]);

  return <SigningIn />;
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<SigningIn />}>
      <GoogleCallbackContent />
    </Suspense>
  );
}
