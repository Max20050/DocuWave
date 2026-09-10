"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  REPORT_FORMATS,
  createReport,
  deleteReport,
  downloadReport,
  listDataSources,
  listReportTemplates,
  listReports,
  type DataSource,
  type Report,
  type ReportFormat,
  type ReportInput,
  type ReportTemplate,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ReportBuilder } from "@/app/ui/report-builder";
import { Icon } from "@/app/ui/icons";
import {
  ConfirmButton,
  CopyButton,
  Disclosure,
  EmptyState,
  LoadingPage,
  Note,
  PageBody,
  PageHeader,
} from "@/app/ui/primitives";
import { useToast } from "@/app/ui/toast";

export default function ReportsPage() {
  const router = useRouter();
  const toast = useToast();
  const { token, logout } = useAuth();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Building takes over the page rather than sitting under the list: the
  // wizard is a several-minute task and deserves the whole column.
  const [building, setBuilding] = useState(false);
  // The report being generated, so the button can say so: a download runs the
  // report's query against the user's data source and isn't instant.
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([listReports(token), listDataSources(token), listReportTemplates(token)])
      .then(([loadedReports, loadedSources, loadedTemplates]) => {
        setReports(loadedReports);
        setSources(loadedSources);
        setTemplates(loadedTemplates);
      })
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  async function handleCreate(input: ReportInput) {
    if (!token) return;
    await createReport(token, input);
    setReports(await listReports(token));
    setBuilding(false);
    toast.ok(`Saved ${input.name}`);
  }

  async function handleDownload(report: Report, format: ReportFormat) {
    if (!token) return;
    setError(null);
    setRunning(`${report.id}:${format}`);
    try {
      const { blob, filename } = await downloadReport(token, report.id, format);
      // The file came back as a response body rather than a URL, so saving it
      // means handing the browser an object URL for one click.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.ok(`${filename} downloaded`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the report");
    } finally {
      setRunning(null);
    }
  }

  async function handleDelete(report: Report) {
    if (!token) return;
    setError(null);
    try {
      await deleteReport(token, report.id);
      setReports(await listReports(token));
      toast.ok(`Removed ${report.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete report");
    }
  }

  if (!token || !reports || !sources) return <LoadingPage />;

  if (building) {
    return (
      <>
        <PageHeader
          title="New report"
          description="Four steps: where the data comes from, what it contains, how it looks, and how it's delivered."
          back={{ label: "Reports", onClick: () => setBuilding(false) }}
        />
        <PageBody wide>
          <ReportBuilder token={token} sources={sources} onCreate={handleCreate} />
        </PageBody>
      </>
    );
  }

  const canBuild = sources.length > 0;

  return (
    <>
      <PageHeader
        title="Reports"
        count={reports.length}
        description="Saved queries with a layout, ready to run whenever you need them."
        action={
          canBuild && (
            <button type="button" onClick={() => setBuilding(true)} className="dw-btn dw-btn-primary">
              <Icon.Plus size={15} />
              New report
            </button>
          )
        }
      />

      <PageBody>
        {error && <Note kind="error">{error}</Note>}

        {!canBuild ? (
          <EmptyState
            icon={<Icon.Plug size={28} />}
            title="Connect a data source first"
            body="A report reads its rows from a connector, so there's nothing to build against yet."
            action={
              <Link href="/datasources" className="dw-btn dw-btn-primary">
                Add a connector
              </Link>
            }
          />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<Icon.Report size={28} />}
            title="No reports yet"
            body="Pick the fields you want from a connector, preview the rows, choose a layout, and save it. Running it later is one click."
            action={
              <button type="button" onClick={() => setBuilding(true)} className="dw-btn dw-btn-primary">
                <Icon.Plus size={15} />
                Build your first report
              </button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {reports.map((report) => {
              const templateName =
                templates.find((template) => template.id === report.templateId)?.name ?? report.templateId;
              return (
                <li key={report.id} className="dw-card dw-card-hover flex flex-col gap-3 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-faint">
                      <Icon.Report size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{report.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="dw-chip">
                          <Icon.Plug size={11} />
                          {report.dataSourceName}
                        </span>
                        <span className="dw-chip">
                          <Icon.Grid size={11} />
                          {templateName}
                        </span>
                      </div>
                      {report.prompt && <p className="dw-hint mt-1.5">{report.prompt}</p>}
                    </div>
                    <ConfirmButton label="Remove" onConfirm={() => handleDelete(report)} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="dw-hint mr-1">Run and download</span>
                      {report.formats.map((format) => {
                        const busy = running === `${report.id}:${format}`;
                        return (
                          <button
                            key={format}
                            type="button"
                            onClick={() => handleDownload(report, format)}
                            disabled={running !== null}
                            className="dw-btn dw-btn-sm"
                          >
                            {busy ? (
                              <span className="animate-spin">
                                <Icon.Refresh size={12} />
                              </span>
                            ) : (
                              <Icon.Download size={12} />
                            )}
                            {busy
                              ? "Generating…"
                              : (REPORT_FORMATS.find((option) => option.value === format)?.label ?? format)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Disclosure
                    summary="Compiled query"
                    right={<CopyButton value={report.query} />}
                  >
                    <pre className="dw-well dw-mono overflow-x-auto px-3 py-2 whitespace-pre-wrap">
                      {report.query}
                    </pre>
                  </Disclosure>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
