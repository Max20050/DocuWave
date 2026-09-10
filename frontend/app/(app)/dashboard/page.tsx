"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  authFetch,
  getLLMConfig,
  listDataSources,
  listRecipientGroups,
  listRecipients,
  listReports,
  type Report,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/app/ui/icons";
import { LoadingPage, PageBody, PageHeader, Section } from "@/app/ui/primitives";

type Overview = {
  email: string;
  reports: Report[];
  dataSources: number;
  recipients: number;
  recipientGroups: number;
  hasLLM: boolean;
};

const TILES = [
  { key: "reports", label: "Reports", href: "/reports", Icon: Icon.Report },
  { key: "dataSources", label: "Connectors", href: "/datasources", Icon: Icon.Plug },
  { key: "recipients", label: "Recipients", href: "/recipients", Icon: Icon.People },
  { key: "recipientGroups", label: "Groups", href: "/recipients", Icon: Icon.Grid },
] as const;

// Checklist turns the four things that have to exist before a report can be
// sent into an ordered path with exactly one "next" on it. It's the page's
// main job for a new account, and it disappears entirely once the account is
// past that point.
function Checklist({ overview }: { overview: Overview }) {
  const items = [
    {
      done: overview.dataSources > 0,
      title: "Connect a data source",
      body: "Point DocuWave at a Postgres or MySQL database, a Google Sheet, or a REST API.",
      href: "/datasources",
      cta: "Add a connector",
    },
    {
      done: overview.reports.length > 0,
      title: "Build your first report",
      body: "Pick the fields you want, preview the rows, and choose how it prints.",
      href: "/reports",
      cta: "Build a report",
    },
    {
      done: overview.recipients > 0,
      title: "Add recipients",
      body: "The people a report goes to, and the groups you send to at once.",
      href: "/recipients",
      cta: "Add recipients",
    },
    {
      done: overview.hasLLM,
      title: "Connect an AI provider",
      body: "Only needed for templates with an AI summary block.",
      href: "/settings",
      cta: "Add a key",
    },
  ];

  const remaining = items.filter((item) => !item.done).length;
  if (remaining === 0) return null;

  const nextIndex = items.findIndex((item) => !item.done);
  const done = items.length - remaining;

  return (
    <Section title="Get set up">
      <div className="dw-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
          <span className="dw-hint shrink-0 tabular-nums">
            {done} of {items.length}
          </span>
        </div>

        <ul className="divide-y divide-line">
          {items.map((item, index) => {
            const isNext = index === nextIndex;
            return (
              <li
                key={item.title}
                className={`flex items-start gap-3 px-4 py-3 ${isNext ? "bg-[var(--accent-soft)]" : ""}`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    item.done
                      ? "border-accent bg-accent text-[var(--accent-ink)]"
                      : isNext
                        ? "border-accent text-accent"
                        : "border-line-strong text-faint"
                  }`}
                >
                  {item.done ? <Icon.Check size={12} /> : <span className="text-[11px]">{index + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${item.done ? "text-muted line-through" : "font-medium"}`}>
                    {item.title}
                  </p>
                  {!item.done && <p className="dw-hint mt-0.5">{item.body}</p>}
                </div>
                {!item.done && (
                  <Link
                    href={item.href}
                    className={`dw-btn dw-btn-sm shrink-0 ${isNext ? "dw-btn-primary" : ""}`}
                  >
                    {item.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    if (!token) return;

    Promise.all([
      authFetch("/api/me", token).then((res) => res.json() as Promise<{ email: string }>),
      listReports(token),
      listDataSources(token),
      listRecipients(token),
      listRecipientGroups(token),
      // A missing provider is a normal state, not a broken session, so this
      // one failure must not log the user out with the others.
      getLLMConfig(token).catch(() => null),
    ])
      .then(([profile, reports, dataSources, recipients, recipientGroups, llm]) => {
        setOverview({
          email: profile.email,
          reports,
          dataSources: dataSources.length,
          recipients: recipients.length,
          recipientGroups: recipientGroups.length,
          hasLLM: llm !== null,
        });
      })
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  if (!overview) return <LoadingPage />;

  const counts = {
    reports: overview.reports.length,
    dataSources: overview.dataSources,
    recipients: overview.recipients,
    recipientGroups: overview.recipientGroups,
  };

  return (
    <>
      <PageHeader
        title="Overview"
        description={overview.email}
        action={
          <Link href="/reports" className="dw-btn dw-btn-primary">
            <Icon.Plus size={15} />
            New report
          </Link>
        }
      />

      <PageBody>
        <Checklist overview={overview} />

        <Section title="At a glance">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {TILES.map((tile) => (
              <Link
                key={tile.key}
                href={tile.href}
                className="dw-card dw-card-hover flex flex-col gap-2 px-4 py-3.5"
              >
                <span className="flex items-center justify-between text-faint">
                  <tile.Icon size={16} />
                  <Icon.ChevronRight size={14} />
                </span>
                <span className="text-2xl font-semibold tabular-nums">{counts[tile.key]}</span>
                <span className="text-xs text-muted">{tile.label}</span>
              </Link>
            ))}
          </div>
        </Section>

        {overview.reports.length > 0 && (
          <Section
            title="Your reports"
            action={
              <Link href="/reports" className="dw-btn dw-btn-quiet dw-btn-sm">
                See all
                <Icon.ChevronRight size={13} />
              </Link>
            }
          >
            <ul className="dw-card divide-y divide-line">
              {overview.reports.slice(0, 5).map((report) => (
                <li key={report.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-faint">
                    <Icon.Report size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{report.name}</p>
                    <p className="dw-hint truncate">{report.dataSourceName}</p>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    {report.formats.map((format) => (
                      <span key={format} className="dw-chip uppercase">
                        {format}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </PageBody>
    </>
  );
}
