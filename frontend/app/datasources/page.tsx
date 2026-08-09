"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  testDataSource,
  type DataSource,
  type DataSourceInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DataSourceForm } from "@/app/ui/data-source-form";

export default function DataSourcesPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    listDataSources(token)
      .then(setSources)
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [token, router, logout]);

  async function handleTest(input: DataSourceInput) {
    if (!token) return;
    await testDataSource(token, input);
  }

  async function handleCreate(input: DataSourceInput) {
    if (!token) return;
    await createDataSource(token, input);
    setSources(await listDataSources(token));
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setError(null);
    try {
      await deleteDataSource(token, id);
      setSources(await listDataSources(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete data source");
    }
  }

  if (!token || !sources) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-16">
      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="text-2xl font-semibold">Data sources</h1>
        <Link href="/dashboard" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        {sources.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No data sources connected yet.</p>
        )}
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between rounded border border-black/[.1] px-4 py-3 dark:border-white/[.15]"
          >
            <div>
              <p className="font-medium">{source.name}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {source.type} · {source.host}:{source.port}/{source.dbName}
              </p>
            </div>
            <button onClick={() => handleDelete(source.id)} className="text-sm text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex w-full max-w-md flex-col gap-4 border-t border-black/[.1] pt-8 dark:border-white/[.15]">
        <h2 className="text-lg font-semibold">Add a data source</h2>
        <DataSourceForm onTest={handleTest} onCreate={handleCreate} />
      </div>
    </div>
  );
}
