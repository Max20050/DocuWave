"use client";

import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthForm } from "@/app/ui/auth-form";
import { AuthShell } from "@/app/ui/auth-shell";

export default function RegisterPage() {
  const router = useRouter();
  const { setToken } = useAuth();

  async function handleSubmit(email: string, password: string) {
    const { token } = await register(email, password);
    setToken(token);
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Connect a data source and your first report is a few clicks away."
      footer={{ question: "Already have an account?", linkLabel: "Log in", href: "/login" }}
    >
      <AuthForm submitLabel="Create account" requireStrongPassword onSubmit={handleSubmit} />
    </AuthShell>
  );
}
