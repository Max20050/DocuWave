import Link from "next/link";
import { GoogleSignInButton } from "@/app/ui/google-signin-button";

// AuthShell is the frame /login and /register share: the mark, one card, and
// a single line pointing at the other page. Both used to build this inline
// and drift apart.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: { question: string; linkLabel: string; href: string };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="dw-rise flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-[var(--accent-ink)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 15c3-4 6-4 9 0s6 4 9 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path
                d="M3 9c3-4 6-4 9 0s6 4 9 0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".5"
              />
            </svg>
          </span>
          <div>
            <h1 className="dw-title">{title}</h1>
            <p className="dw-hint mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="dw-card flex flex-col gap-5 p-6">
          <GoogleSignInButton />

          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>

          {children}
        </div>

        <p className="text-center text-sm text-muted">
          {footer.question}{" "}
          <Link href={footer.href} className="dw-link font-medium">
            {footer.linkLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
