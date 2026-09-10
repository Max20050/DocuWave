"use client";

import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthForm } from "@/app/ui/auth-form";
import { AuthShell } from "@/app/ui/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const { setToken } = useAuth();

  async function handleSubmit(email: string, password: string) {
    const { token } = await login(email, password);
    setToken(token);
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to build and send your reports."
      footer={{ question: "Don't have an account?", linkLabel: "Sign up", href: "/register" }}
    >
      <AuthForm submitLabel="Log in" onSubmit={handleSubmit} />
    </AuthShell>
  );
}
