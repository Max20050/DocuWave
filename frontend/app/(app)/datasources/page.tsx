"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createDataSource,
  createGoogleSheetsDataSource,
  createRestApiDataSource,
  deleteDataSource,
  listDataSources,
  testDataSource,
  testRestApiDataSource,
  type DataSource,
  type DataSourceInput,
  type GoogleSheetsDataSourceInput,
  type RestApiDataSourceInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DataSourceForm } from "@/app/ui/data-source-form";
import { GoogleSheetsConnectButton } from "@/app/ui/google-sheets-connect-button";
import { GoogleSheetsPicker } from "@/app/ui/google-sheets-picker";
import { DataSourceSchemaView } from "@/app/ui/data-source-schema";
import { RestApiDataSourceForm } from "@/app/ui/rest-api-datasource-form";
import { Icon } from "@/app/ui/icons";
import {
  ChoiceCards,
  ConfirmButton,
  Disclosure,
  Drawer,
  EmptyState,
  LoadingPage,
  Note,
  PageBody,
  PageHeader,
} from "@/app/ui/primitives";
import { useToast } from "@/app/ui/toast";

type ConnectorKind = "sql" | "google_sheets" | "rest_api";

const KINDS: { value: ConnectorKind; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "sql",
    label: "SQL database",
    description: "PostgreSQL or MySQL, queried directly.",
    icon: <Icon.Plug size={17} />,
  },
  {
    value: "google_sheets",
    label: "Google Sheets",
    description: "A spreadsheet, using its header row as columns.",
    icon: <Icon.Sheet size={17} />,
  },
  {
    value: "rest_api",
    label: "REST API",
    description: "Any JSON endpoint, mapped to fields you name.",
    icon: <Icon.Globe size={17} />,
  },
];

function kindOf(source: DataSource): ConnectorKind {
  if (source.type === "google_sheets") return "google_sheets";
  if (source.type === "rest_api") return "rest_api";
  return "sql";
}

function sourceSubtitle(source: DataSource): string {
  if (source.type === "google_sheets") {
    return source.spreadsheetName ?? source.spreadsheetId ?? "";
  }
  if (source.type === "rest_api") {
    return `${source.method ?? "GET"} ${source.url}`;
  }
  return `${source.host}:${source.port}/${source.dbName}`;
}

function SourceIcon({ kind }: { kind: ConnectorKind }) {
  const glyph = KINDS.find((k) => k.value === kind)?.icon;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-muted">
      {glyph}
    </span>
  );
}

function DataSourcesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { token, logout } = useAuth();
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sheetsConnectionId = searchParams.get("sheetsConnection");
  // Coming back from Google's consent screen lands here with a connection id
  // and no other context, so the flow reopens itself on the step the user was
  // on when they left — derived from the URL rather than pushed there by an
  // effect.
  const [drawerOpen, setDrawerOpen] = useState(Boolean(sheetsConnectionId));
  const [chosenKind, setChosenKind] = useState<ConnectorKind | null>(null);
  const kind: ConnectorKind | null =
    chosenKind ?? (sheetsConnectionId ? "google_sheets" : null);

  useEffect(() => {
    if (!token) return;
    listDataSources(token)
      .then(setSources)
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  // Clearing the connection id matters as much as clearing the local choice:
  // while it's in the URL, `kind` derives back to google_sheets.
  function resetKind() {
    setChosenKind(null);
    if (sheetsConnectionId) router.replace("/datasources");
  }

  function closeDrawer() {
    setDrawerOpen(false);
    resetKind();
  }

  async function refresh() {
    if (!token) return;
    setSources(await listDataSources(token));
  }

  async function handleTest(input: DataSourceInput) {
    if (!token) return;
    await testDataSource(token, input);
  }

  async function handleCreate(input: DataSourceInput) {
    if (!token) return;
    await createDataSource(token, input);
    await refresh();
    closeDrawer();
    toast.ok(`Connected ${input.name}`);
  }

  async function handleCreateSheetsSource(input: GoogleSheetsDataSourceInput) {
    if (!token) return;
    await createGoogleSheetsDataSource(token, input);
    await refresh();
    closeDrawer();
    toast.ok(`Connected ${input.name}`);
  }

  async function handleTestRest(input: RestApiDataSourceInput) {
    if (!token) return;
    await testRestApiDataSource(token, input);
  }

  async function handleCreateRest(input: RestApiDataSourceInput) {
    if (!token) return;
    await createRestApiDataSource(token, input);
    await refresh();
    closeDrawer();
    toast.ok(`Connected ${input.name}`);
  }

  async function handleDelete(source: DataSource) {
    if (!token) return;
    setError(null);
    try {
      await deleteDataSource(token, source.id);
      await refresh();
      toast.ok(`Removed ${source.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete data source");
    }
  }

  if (!token || !sources) return <LoadingPage />;

  return (
    <>
      <PageHeader
        title="Connectors"
        count={sources.length}
        description="Where your report data comes from."
        action={
          <button type="button" onClick={() => setDrawerOpen(true)} className="dw-btn dw-btn-primary">
            <Icon.Plus size={15} />
            New connector
          </button>
        }
      />

      <PageBody>
        {error && <Note kind="error">{error}</Note>}

        {sources.length === 0 ? (
          <EmptyState
            icon={<Icon.Plug size={28} />}
            title="No connectors yet"
            body="A connector is a database, spreadsheet or API DocuWave reads rows from. You need one before you can build a report."
            action={
              <button type="button" onClick={() => setDrawerOpen(true)} className="dw-btn dw-btn-primary">
                <Icon.Plus size={15} />
                Add your first connector
              </button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((source) => (
              <li key={source.id} className="dw-card dw-card-hover flex flex-col gap-3 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <SourceIcon kind={kindOf(source)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{source.name}</p>
                    <p className="dw-hint dw-mono break-all">{sourceSubtitle(source)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="dw-chip hidden sm:inline-flex">
                      {KINDS.find((k) => k.value === kindOf(source))?.label}
                    </span>
                    <ConfirmButton label="Remove" onConfirm={() => handleDelete(source)} />
                  </div>
                </div>
                <div className="border-t border-line pt-2">
                  <Disclosure summary="Fields and tables">
                    <DataSourceSchemaView
                      key={source.id}
                      token={token}
                      dataSourceId={source.id}
                      type={source.type}
                    />
                  </Disclosure>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="New connector"
        description={kind === null ? "Start by telling us what you're connecting to." : undefined}
      >
        {kind === null ? (
          <ChoiceCards
            columns={2}
            options={KINDS}
            value={null}
            onChange={setChosenKind}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <button type="button" onClick={resetKind} className="dw-btn dw-btn-quiet dw-btn-sm -ml-2 self-start">
              <Icon.ArrowLeft size={13} />
              {KINDS.find((k) => k.value === kind)?.label}
            </button>

            {kind === "sql" && <DataSourceForm onTest={handleTest} onCreate={handleCreate} />}

            {kind === "rest_api" && (
              <RestApiDataSourceForm onTest={handleTestRest} onCreate={handleCreateRest} />
            )}

            {kind === "google_sheets" &&
              (sheetsConnectionId ? (
                <GoogleSheetsPicker
                  token={token}
                  connectionId={sheetsConnectionId}
                  onCreate={handleCreateSheetsSource}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="dw-hint">
                    You&apos;ll be sent to Google to approve read-only access, then brought back here to
                    pick a spreadsheet.
                  </p>
                  <GoogleSheetsConnectButton token={token} />
                </div>
              ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function DataSourcesPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <DataSourcesContent />
    </Suspense>
  );
}
